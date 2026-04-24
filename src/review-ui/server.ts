import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { execFileSync } from 'child_process';
import { ApprovedRefReader } from '../core/ApprovedRefReader';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { logger } from '../utils/logger';
import { printCircleSummary } from '../utils/circleStatus';

// ============================================================================
// Review 页面服务后端
// 本地 Express 服务，提供：
//   - 批次内候选图展示 API
//   - Approve 交互 API（多选 + 默认序号命名）
//   - 格式检查 API
// ============================================================================

interface Candidate {
    model: string;
    path: string;
    relativePath: string;
    batchId: string;
}

interface CandidateGroup {
    jobId: string;
    source: string;
    images: Candidate[];
}

export class ReviewServer {
    private approvedRefReader: ApprovedRefReader;

    constructor(
        private projectRoot: string,
        private batchDirs: string[]
    ) {
        this.approvedRefReader = new ApprovedRefReader(projectRoot);
    }

    async start(port: number): Promise<void> {
        const app = express();
        app.use(express.json());

        // ---- 静态文件 ----
        // 图片代理：让前端通过 /opsv-queue/ 路径访问资产
        app.use('/opsv-queue', express.static(
            path.join(this.projectRoot, 'opsv-queue')
        ));

        // Review UI 静态页面
        // 增加动态路径探测，兼容开发模式 (ts-node) 和 发布模式 (dist)
        let publicPath = path.join(__dirname, 'public');
        const publicPathExists = await fs.access(publicPath).then(() => true).catch(() => false);
        if (!publicPathExists) {
            // 如果是在 dist/review-ui/server.js 运行，public 应该在同级
            // 如果是在 src/review-ui/server.ts 运行，public 也在同级
            // 但有些运行环境可能会导致路径偏移，此处做一个向上探测
            publicPath = path.join(__dirname, '../src/review-ui/public');
        }

        const finalPublicPathExists = await fs.access(publicPath).then(() => true).catch(() => false);
        if (finalPublicPathExists) {
            app.use(express.static(publicPath));
        } else {
            logger.error(`❌ Review UI 静态资源目录不存在: ${publicPath}`);
            // 提供一个基础的响应而不是挂起
            app.get('/', (req, res) => {
                res.status(500).send('<h1>OpsV Review UI 资源缺失</h1><p>请确保 dist/review-ui/public 目录存在。</p>');
            });
        }

        // ---- API: 获取批次内所有候选图 ----
        app.get('/api/candidates', async (req: any, res: any) => {
            try {
                const candidates = await this.resolveBatchCandidates();
                res.json({ success: true, data: candidates });
            } catch (e) {
                res.status(500).json({ success: false, error: (e as Error).message });
            }
        });

        // ---- API: 获取文档内容 ----
        app.get('/api/document/:jobId', async (req: any, res: any) => {
            try {
                const docPath = await this.findSourceDoc(req.params.jobId);
                if (docPath) {
                    const exists = await fs.access(docPath).then(() => true).catch(() => false);
                    if (exists) {
                        const data = await fs.readFile(docPath, 'utf-8');
                        res.json({ success: true, data });
                        return;
                    }
                }
                res.status(404).json({ success: false, error: '文档不存在' });
            } catch (e) {
                res.status(500).json({ success: false, error: (e as Error).message });
            }
        });

        // ---- API: 格式检查 ----
        app.get('/api/format-check', async (req: any, res: any) => {
            try {
                const issues = await this.runFormatCheck();
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

                // 自动 git commit（使用参数数组防止命令注入）
                try {
                    // 白名单校验所有 jobId，只允许字母/数字/下划线/连字符
                    const SAFE_JOB_ID = /^[a-zA-Z0-9_-]+$/;
                    const validatedIds = selections.map((s: any) => {
                        if (typeof s.jobId !== 'string' || !SAFE_JOB_ID.test(s.jobId)) {
                            throw new Error(`非法 jobId，拒绝提交: ${String(s.jobId).substring(0, 50)}`);
                        }
                        return s.jobId;
                    });
                    const commitMsg = `approve: ${validatedIds.join(', ')}`;
                    execFileSync('git', ['add', '.'], { cwd: this.projectRoot, stdio: 'pipe' });
                    execFileSync('git', ['commit', '-m', commitMsg], {
                        cwd: this.projectRoot,
                        encoding: 'utf-8',
                        stdio: 'pipe'
                    });
                    logger.info(`✅ Git commit: ${commitMsg}`);
                } catch (e) {
                    logger.warn(`Git commit 失败: ${(e as Error).message}`);
                }

                // Approve 后打印 Circle 状态摘要
                try {
                    await printCircleSummary(this.projectRoot);
                } catch (e) {
                    logger.warn(`Circle 摘要打印失败: ${(e as Error).message}`);
                }

                res.json({ success: true, data: results });
            } catch (e) {
                res.status(500).json({ success: false, error: (e as Error).message });
            }
        });

        // ---- API: Draft 操作（打回并记录参考） ----
        app.post('/api/draft', async (req: any, res: any) => {
            try {
                const { jobId, imagePath, feedback } = req.body;
                if (!jobId) {
                    return res.status(400).json({ success: false, error: '缺少 jobId' });
                }

                const docPath = await this.findSourceDoc(jobId);
                if (!docPath) {
                    return res.status(404).json({ success: false, error: '源文档不存在' });
                }

                let content = await fs.readFile(docPath, 'utf-8');

                // 1. 设置 status → draft
                content = FrontmatterParser.updateField(content, 'status', 'draft');

                // 2. 记录 draft_ref（当前不满意的生成结果，供下轮迭代参考）
                if (imagePath) {
                    const relativePath = path.relative(this.projectRoot, imagePath).replace(/\\/g, '/');
                    content = FrontmatterParser.updateField(content, 'draft_ref', relativePath);
                }

                // 3. 记录导演意见
                const reviewEntry = `${new Date().toISOString().split('T')[0]}: [DRAFT] ${feedback || '需要调整'}`;
                content = FrontmatterParser.appendReview(content, reviewEntry);

                await fs.writeFile(docPath, content, 'utf-8');
                logger.info(`📝 Draft: ${jobId} — ${feedback || '(无具体意见)'}`);

                // 自动 git commit
                try {
                    const SAFE_JOB_ID = /^[a-zA-Z0-9_-]+$/;
                    if (typeof jobId === 'string' && SAFE_JOB_ID.test(jobId)) {
                        execFileSync('git', ['add', '.'], { cwd: this.projectRoot, stdio: 'pipe' });
                        execFileSync('git', ['commit', '-m', `draft: ${jobId} — ${(feedback || '').substring(0, 60)}`], {
                            cwd: this.projectRoot, encoding: 'utf-8', stdio: 'pipe'
                        });
                    }
                } catch (e) {
                    logger.warn(`Git commit 失败: ${(e as Error).message}`);
                }

                // Draft 后打印 Circle 状态摘要
                try {
                    await printCircleSummary(this.projectRoot);
                } catch (e) {
                    logger.warn(`Circle 摘要打印失败: ${(e as Error).message}`);
                }

                res.json({ success: true, data: { jobId, status: 'draft' } });
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

    private async resolveBatchCandidates(): Promise<CandidateGroup[]> {
        const groups = new Map<string, CandidateGroup>();

        for (const dir of this.batchDirs) {
            const dirExists = await fs.access(dir).then(() => true).catch(() => false);
            if (!dirExists) continue;
            const batchId = path.basename(dir);

            // 读取批次 jobs json 获取任务元信息
            let jobsJsonFiles: string[] = [];
            try {
                jobsJsonFiles = (await fs.readdir(dir)).filter(f => f.startsWith('jobs_batch'));
            } catch { /* ignore */ }

            let jobMeta: Record<string, string> = {};
            if (jobsJsonFiles.length > 0) {
                try {
                    const jobsRaw = await fs.readFile(path.join(dir, jobsJsonFiles[0]), 'utf-8');
                    const jobs = JSON.parse(jobsRaw);
                    for (const job of jobs) {
                        jobMeta[job.id] = job._meta?.source || '';
                    }
                } catch {}
            }

            // 遍历批次目录下所有子目录（每个子目录对应一个模型）
            const entries = await fs.readdir(dir);
            for (const entry of entries) {
                const entryPath = path.join(dir, entry);
                const stat = await fs.stat(entryPath);

                if (stat.isDirectory()) {
                    // 模型子目录 (Legacy or sub-models)
                    await this.scanModelDir(entryPath, entry, batchId, groups, jobMeta);
                } else if (stat.isFile() && /\.(png|jpg|webp|mp4|webm)$/i.test(entry)) {
                    // 资产文件 (v0.6.2 moves assets into Batch root)
                    // The model name is derived from the parent folder of Batch dir (which is Provider name)
                    const providerName = path.basename(path.dirname(dir));
                    this.addCandidate(groups, entry, entryPath, providerName, batchId, jobMeta);
                }
            }
        }

        return Array.from(groups.values());
    }

    private async scanModelDir(
        dirPath: string,
        modelName: string,
        batchId: string,
        groups: Map<string, CandidateGroup>,
        jobMeta: Record<string, string>
    ): Promise<void> {
        const files = (await fs.readdir(dirPath)).filter(f => /\.(png|jpg|webp|mp4|webm)$/i.test(f));
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            this.addCandidate(groups, file, filePath, modelName, batchId, jobMeta);
        }
    }

    private addCandidate(
        groups: Map<string, CandidateGroup>,
        fileName: string,
        filePath: string,
        modelName: string,
        batchId: string,
        jobMeta: Record<string, string>
    ): void {
        // Match: shot_01.png, shot_01_1.mp4, shot_01_draft_1.png etc.
        const match = fileName.match(/^(.+?)(?:_(?:draft_)?\d+)?\.(png|jpg|webp|mp4|webm)$/i);
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
            batchId
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
            const existingCount = await this.countExistingApproved(jobId);
            variant = existingCount === 0 ? 'default' : `variant_${existingCount + 1}`;
        }

        // 1. 直接使用原产出路径作为 approved 引用（无需复制到单独目录）
        const approvedPath = imagePath;

        // 2. 找到源文档并回写 Approved References + 生成参数
        const docPath = await this.findSourceDoc(jobId);
        if (docPath) {
            await this.approvedRefReader.appendApprovedRef(docPath, variant, approvedPath);

            // 3. 更新 status → pending_sync（由 writebackFromTask 设置）或 approved（无 task JSON 时）
            let content = await fs.readFile(docPath, 'utf-8');

            // 4. 追加 reviews 记录
            const reviewEntry = `${new Date().toISOString().split('T')[0]}: ${reviewNote || 'approved via review UI'}`;
            content = FrontmatterParser.appendReview(content, reviewEntry);

            // 5. 从 task JSON 回写生成参数到源文档
            const taskJson = await this.findTaskJson(jobId, imagePath);
            if (taskJson) {
                content = this.writebackFromTask(content, taskJson, jobId, imagePath);
                logger.info(`  🔄 Writeback: ${jobId} (prompt_en已覆盖, Design References已同步, status→pending_sync)`);
            } else {
                content = FrontmatterParser.updateField(content, 'status', 'approved');
                logger.warn(`  ⚠️  Writeback: ${jobId} 未找到 task JSON，直接设为 approved`);
            }

            await fs.writeFile(docPath, content, 'utf-8');
            logger.info(`✅ Approve: ${jobId}:${variant} → ${approvedPath}`);
        }

        return { jobId, approvedPath };
    }

    private async countExistingApproved(jobId: string): Promise<number> {
        const docPath = await this.findSourceDoc(jobId);
        if (!docPath) return 0;
        const approvedRefs = await this.approvedRefReader.getAll(docPath);
        return approvedRefs.length;
    }

    private async findSourceDoc(jobId: string): Promise<string | null> {
        const dirs = ['elements', 'scenes', 'shots'];
        const prefixes = ['@', ''];

        for (const dir of dirs) {
            for (const prefix of prefixes) {
                const p = path.join(this.projectRoot, 'videospec', dir, `${prefix}${jobId}.md`);
                const exists = await fs.access(p).then(() => true).catch(() => false);
                if (exists) return p;
            }
        }
        return null;
    }

    // ================================================================
    // 格式检查
    // ================================================================

    private async runFormatCheck(): Promise<{ file: string; issues: string[] }[]> {
        const results: { file: string; issues: string[] }[] = [];
        const dirs = ['elements', 'scenes', 'shots'];

        for (const dir of dirs) {
            const dirPath = path.join(this.projectRoot, 'videospec', dir);
            const dirExists = await fs.access(dirPath).then(() => true).catch(() => false);
            if (!dirExists) continue;

            const files = (await fs.readdir(dirPath)).filter(f => f.endsWith('.md'));
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const issues = await this.checkDocFormat(filePath);
                if (issues.length > 0) {
                    results.push({ file: `${dir}/${file}`, issues });
                }
            }
        }
        return results;
    }

    private async checkDocFormat(filePath: string): Promise<string[]> {
        const issues: string[] = [];
        const content = await fs.readFile(filePath, 'utf-8');

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

    // ================================================================
    // Task JSON 定位与回写
    // ================================================================

    private async findTaskJson(jobId: string, imagePath: string): Promise<any | null> {
        const batchDir = path.dirname(imagePath);

        const defaultPath = path.join(batchDir, `${jobId}.json`);
        const exists = await fs.access(defaultPath).then(() => true).catch(() => false);
        if (exists) {
            try {
                const raw = await fs.readFile(defaultPath, 'utf-8');
                return JSON.parse(raw);
            } catch {
                return null;
            }
        }

        return null;
    }

    private writebackFromTask(docContent: string, taskData: any, jobId: string, imagePath: string): string {
        const prompt = taskData.prompt || '';
        const content: any[] = taskData.content || [];
        const actualPrompt = this.extractPrompt(prompt, content);
        if (!actualPrompt) return docContent;

        // 1. prompt_en: 始终覆盖为实际发送的完整提示词
        docContent = FrontmatterParser.updateField(docContent, 'prompt_en', actualPrompt);

        // 2. 同步 ## Design References 图片链接（从 task JSON 提取参考素材）
        const taskImageRefs = this.extractImageRefs(taskData.image || [], content);
        if (taskImageRefs.length > 0) {
            docContent = this.syncDesignReferences(docContent, taskImageRefs);
        }

        // 3. 追加 review 条目指向 task JSON（供 Agent 追溯完整生成参数）
        const taskJsonRelPath = path.relative(this.projectRoot, path.dirname(imagePath)).replace(/\\/g, '/')
            + `/${jobId}.json`;
        const model = taskData.model || '';
        const size = taskData.size || taskData.ratio || '';
        const reviewNote = `prompt_en 已从 task JSON 同步 | ${model}${size ? ` | ${size}` : ''} | ${taskJsonRelPath}`;
        docContent = FrontmatterParser.appendReview(docContent, reviewNote);

        // 4. status → pending_sync（需 Agent 根据 prompt_en 完成 visual_detailed/visual_brief/refs 对齐后方可改为 approved）
        docContent = FrontmatterParser.updateField(docContent, 'status', 'pending_sync');

        return docContent;
    }

    private syncDesignReferences(docContent: string, imageUrls: string[]): string {
        const relPaths = imageUrls.map(url => {
            if (url.startsWith('data:')) return null;
            if (url.startsWith('http://') || url.startsWith('https://')) return url;
            return url;
        }).filter((p): p is string => p !== null);

        const newEntries = relPaths.map(url => `![ref](${url})`).join('\n');
        const sectionHeader = '## Design References';
        const sectionRegex = /^(##\s*Design\s+References\s*\n)/im;
        const match = docContent.match(sectionRegex);

        if (match && match.index !== undefined) {
            const afterHeader = match.index + match[0].length;
            const nextSectionRegex = /\n##\s/g;
            const restOfDoc = docContent.slice(afterHeader);
            const nextSection = restOfDoc.search(nextSectionRegex);
            const sectionBody = nextSection >= 0 ? restOfDoc.slice(0, nextSection) : restOfDoc;
            const afterSection = nextSection >= 0 ? restOfDoc.slice(nextSection) : '';
            docContent = docContent.slice(0, afterHeader) + '\n' + newEntries + '\n' + sectionBody.trimEnd() + afterSection;
        } else {
            const approvedRefRegex = /^(##\s*Approved\s+References)/m;
            const approvedMatch = docContent.match(approvedRefRegex);
            if (approvedMatch && approvedMatch.index !== undefined) {
                docContent = docContent.slice(0, approvedMatch.index)
                    + `${sectionHeader}\n\n${newEntries}\n\n`
                    + docContent.slice(approvedMatch.index);
            } else {
                docContent += `\n\n${sectionHeader}\n\n${newEntries}\n`;
            }
        }

        return docContent;
    }

    private extractPrompt(prompt: string, content: any[]): string {
        if (prompt) return prompt;
        for (const item of content) {
            if (item.type === 'text' && item.text) return item.text;
        }
        return '';
    }

    private extractImageRefs(imageRefs: any[], content: any[]): string[] {
        const refs: string[] = [];

        if (Array.isArray(imageRefs)) {
            for (const ref of imageRefs) {
                if (typeof ref === 'string') refs.push(ref);
                else if (ref?.url) refs.push(ref.url);
            }
        }

        for (const item of content) {
            if (item.type === 'image_url' && item.image_url?.url && !item.image_url.url.startsWith('data:')) {
                refs.push(item.image_url.url);
            }
            if (item.type === 'video_url' && item.video_url?.url && !item.video_url.url.startsWith('data:')) {
                refs.push(item.video_url.url);
            }
        }

        return [...new Set(refs)];
    }

}
