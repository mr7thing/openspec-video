import express from 'express';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ApprovedRefReader } from '../core/ApprovedRefReader';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { logger } from '../utils/logger';

// ============================================================================
// Review 页面服务后端
// 本地 Express 服务，提供：
//   - 批次内候选图展示 API
//   - Approve 交互 API（多选 + 默认序号命名）
//   - 格式检查 API
// ============================================================================

interface CandidateGroup {
    jobId: string;
    source: string;
    images: { model: string; path: string; relativePath: string }[];
}

export class ReviewServer {
    private approvedRefReader: ApprovedRefReader;

    constructor(
        private projectRoot: string,
        private batchDir: string
    ) {
        this.approvedRefReader = new ApprovedRefReader(projectRoot);
    }

    async start(port: number): Promise<void> {
        const app = express();
        app.use(express.json());

        // ---- 静态文件 ----
        // 图片代理：让前端通过 /artifacts/ 路径访问图片
        app.use('/artifacts', express.static(
            path.join(this.projectRoot, 'artifacts')
        ));
        // Review UI 静态页面
        app.use(express.static(path.join(__dirname, 'public')));

        // ---- API: 获取批次内所有候选图 ----
        app.get('/api/candidates', (req: any, res: any) => {
            try {
                const candidates = this.resolveBatchCandidates();
                res.json({ success: true, data: candidates });
            } catch (e) {
                res.status(500).json({ success: false, error: (e as Error).message });
            }
        });

        // ---- API: 格式检查 ----
        app.get('/api/format-check', (req: any, res: any) => {
            try {
                const issues = this.runFormatCheck();
                res.json({ success: true, data: issues });
            } catch (e) {
                res.status(500).json({ success: false, error: (e as Error).message });
            }
        });

        // ---- API: Approve 操作（支持多选） ----
        app.post('/api/approve', async (req: any, res: any) => {
            try {
                const { selections, reviewNote } = req.body;
                // selections: [{ jobId, imagePath, variant? }]
                if (!Array.isArray(selections) || selections.length === 0) {
                    return res.status(400).json({ success: false, error: '未选择任何图片' });
                }

                const results = [];
                for (const sel of selections) {
                    const result = await this.executeApprove(
                        sel.jobId,
                        sel.imagePath,
                        sel.variant,
                        reviewNote || ''
                    );
                    results.push(result);
                }

                // 自动 git commit
                try {
                    const jobIds = selections.map((s: any) => s.jobId).join(', ');
                    execSync(
                        `git add . && git commit -m "approve: ${jobIds}"`,
                        { cwd: this.projectRoot, stdio: 'pipe' }
                    );
                    logger.info(`✅ Git commit: approve ${jobIds}`);
                } catch (e) {
                    logger.warn(`Git commit 失败: ${(e as Error).message}`);
                }

                res.json({ success: true, data: results });
            } catch (e) {
                res.status(500).json({ success: false, error: (e as Error).message });
            }
        });

        app.listen(port, () => {
            logger.info(`Review 服务启动: http://localhost:${port}`);
        });
    }

    // ================================================================
    // 批次候选图扫描
    // ================================================================

    private resolveBatchCandidates(): CandidateGroup[] {
        const groups = new Map<string, CandidateGroup>();

        if (!fs.existsSync(this.batchDir)) return [];

        // 读取批次 jobs json 获取任务元信息
        const jobsJsonFiles = fs.readdirSync(this.batchDir).filter(f => f.startsWith('jobs_batch'));
        let jobMeta: Record<string, string> = {};
        if (jobsJsonFiles.length > 0) {
            try {
                const jobs = JSON.parse(fs.readFileSync(path.join(this.batchDir, jobsJsonFiles[0]), 'utf-8'));
                for (const job of jobs) {
                    jobMeta[job.id] = job._meta?.source || '';
                }
            } catch {}
        }

        // 遍历批次目录下所有子目录（每个子目录对应一个模型）
        const entries = fs.readdirSync(this.batchDir);
        for (const entry of entries) {
            const entryPath = path.join(this.batchDir, entry);
            const stat = fs.statSync(entryPath);

            if (stat.isDirectory()) {
                // 模型子目录
                this.scanModelDir(entryPath, entry, groups, jobMeta);
            } else if (stat.isFile() && /\.(png|jpg|webp)$/i.test(entry)) {
                // 直接在批次根目录的图片
                this.addCandidate(groups, entry, entryPath, 'default', jobMeta);
            }
        }

        return Array.from(groups.values());
    }

    private scanModelDir(
        dirPath: string,
        modelName: string,
        groups: Map<string, CandidateGroup>,
        jobMeta: Record<string, string>
    ): void {
        const files = fs.readdirSync(dirPath).filter(f => /\.(png|jpg|webp)$/i.test(f));
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            this.addCandidate(groups, file, filePath, modelName, jobMeta);
        }
    }

    private addCandidate(
        groups: Map<string, CandidateGroup>,
        fileName: string,
        filePath: string,
        modelName: string,
        jobMeta: Record<string, string>
    ): void {
        // 从文件名提取 jobId: elder_brother_draft_1.png → elder_brother
        const match = fileName.match(/^(.+?)_draft_\d+\.(png|jpg|webp)$/i);
        if (!match) return;

        const jobId = match[1];
        if (!groups.has(jobId)) {
            groups.set(jobId, {
                jobId,
                source: jobMeta[jobId] || '',
                images: []
            });
        }

        const relativePath = path.relative(this.projectRoot, filePath).replace(/\\/g, '/');
        groups.get(jobId)!.images.push({
            model: modelName,
            path: filePath,
            relativePath,
        });
    }

    // ================================================================
    // Approve 执行
    // ================================================================

    private async executeApprove(
        jobId: string,
        imagePath: string,
        variant: string | undefined,
        reviewNote: string
    ): Promise<{ jobId: string; approvedPath: string }> {

        // 默认命名: 未输入变体名 → 用 jobId 加序号
        if (!variant) {
            const existingCount = this.countExistingApproved(jobId);
            variant = existingCount === 0 ? 'default' : `variant_${existingCount + 1}`;
        }

        // 1. 复制到 artifacts/ 目录并重命名
        const ext = path.extname(imagePath);
        const approvedName = `${jobId}_${variant}${ext}`;
        const approvedPath = path.join(this.projectRoot, 'artifacts', approvedName);
        fs.copyFileSync(imagePath, approvedPath);

        // 2. 找到源文档并回写 Approved References
        const docPath = this.findSourceDoc(jobId);
        if (docPath) {
            this.approvedRefReader.appendApprovedRef(docPath, variant, approvedPath);

            // 3. 更新 status → approved
            let content = fs.readFileSync(docPath, 'utf-8');
            content = FrontmatterParser.updateField(content, 'status', 'approved');

            // 4. 追加 reviews 记录
            const reviewEntry = `${new Date().toISOString().split('T')[0]}: ${reviewNote || 'approved via review UI'}`;
            content = FrontmatterParser.appendReview(content, reviewEntry);

            fs.writeFileSync(docPath, content, 'utf-8');
            logger.info(`✅ Approve: ${jobId}:${variant} → ${approvedPath}`);
        }

        return { jobId, approvedPath };
    }

    private countExistingApproved(jobId: string): number {
        const docPath = this.findSourceDoc(jobId);
        if (!docPath) return 0;
        return this.approvedRefReader.getAll(docPath).length;
    }

    private findSourceDoc(jobId: string): string | null {
        const dirs = ['elements', 'scenes'];
        const prefixes = ['@', ''];

        for (const dir of dirs) {
            for (const prefix of prefixes) {
                const p = path.join(this.projectRoot, 'videospec', dir, `${prefix}${jobId}.md`);
                if (fs.existsSync(p)) return p;
            }
        }
        return null;
    }

    // ================================================================
    // 格式检查
    // ================================================================

    private runFormatCheck(): { file: string; issues: string[] }[] {
        const results: { file: string; issues: string[] }[] = [];
        const dirs = ['elements', 'scenes', 'shots'];

        for (const dir of dirs) {
            const dirPath = path.join(this.projectRoot, 'videospec', dir);
            if (!fs.existsSync(dirPath)) continue;

            const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const issues = this.checkDocFormat(filePath);
                if (issues.length > 0) {
                    results.push({ file: `${dir}/${file}`, issues });
                }
            }
        }
        return results;
    }

    private checkDocFormat(filePath: string): string[] {
        const issues: string[] = [];
        const content = fs.readFileSync(filePath, 'utf-8');

        // 1. 检查 frontmatter 存在
        if (!content.match(/^---\r?\n/)) {
            issues.push('缺少 YAML frontmatter');
            return issues;
        }

        try {
            const { frontmatter } = FrontmatterParser.parseRaw(content);

            // 2. 检查 type 字段
            if (!frontmatter.type) issues.push('缺少 type 字段');

            // 3. 检查 status 字段
            if (!frontmatter.status) issues.push('缺少 status 字段');

            // 4. 检查 Approved References 区域
            if (frontmatter.status === 'approved') {
                if (!content.includes('## Approved References')) {
                    issues.push('status 为 approved 但缺少 ## Approved References 区域');
                }
            }
        } catch (e) {
            issues.push(`Frontmatter 解析失败: ${(e as Error).message}`);
        }

        return issues;
    }
}
