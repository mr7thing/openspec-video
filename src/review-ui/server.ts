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
//   - 生命周期管理（TTL / Idle / 优雅关闭）
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

export interface ReviewLifecycle {
    ttlMs: number;   // 最大存活时长
    idleMs: number;  // 无操作自动关闭
}

export class ReviewServer {
    private approvedRefReader: ApprovedRefReader;
    private lifecycle: ReviewLifecycle;
    private serverInstance: ReturnType<express.Express['listen']> | null = null;
    private idleTimer: NodeJS.Timeout | null = null;
    private ttlTimer: NodeJS.Timeout | null = null;
    private isShuttingDown = false;

    constructor(
        private projectRoot: string,
        private batchDirs: string[],
        lifecycle: ReviewLifecycle = { ttlMs: 2 * 60 * 60 * 1000, idleMs: 30 * 60 * 1000 }
    ) {
        this.approvedRefReader = new ApprovedRefReader(projectRoot);
        this.lifecycle = lifecycle;
    }

    // ================================================================
    // 生命周期管理
    // ================================================================

    private scheduleIdleTimer(): void {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            logger.info(`⏰ Review 服务 idle 超时（${this.lifecycle.idleMs}ms），自动关闭`);
            this.gracefulShutdown('idle-timeout');
        }, this.lifecycle.idleMs);
    }

    private scheduleTtlTimer(): void {
        if (this.ttlTimer) clearTimeout(this.ttlTimer);
        this.ttlTimer = setTimeout(() => {
            logger.info(`⏰ Review 服务 TTL 到期（${this.lifecycle.ttlMs}ms），强制关闭`);
            this.gracefulShutdown('ttl-expired');
        }, this.lifecycle.ttlMs);
    }

    private resetIdleTimer(): void {
        if (!this.isShuttingDown) {
            this.scheduleIdleTimer();
        }
    }

    private async gracefulShutdown(reason: string): Promise<void> {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        if (this.idleTimer) clearTimeout(this.idleTimer);
        if (this.ttlTimer) clearTimeout(this.ttlTimer);

        const timestamp = new Date().toISOString();

        // git commit checkpoint
        try {
            execFileSync('git', ['add', '.'], { cwd: this.projectRoot, stdio: 'pipe' });
            execFileSync('git', ['commit', '-m', `[review done] ${timestamp} (${reason})`], {
                cwd: this.projectRoot,
                encoding: 'utf-8',
                stdio: 'pipe'
            });
            logger.info(`✅ Git commit: [review done] ${timestamp} (${reason})`);
        } catch (e) {
            logger.warn(`Git commit 失败: ${(e as Error).message}`);
        }

        // 关闭 HTTP 服务
        if (this.serverInstance) {
            this.serverInstance.close(() => {
                logger.info('🚪 Review 服务已关闭');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    }

    // ================================================================
    // 启动
    // ================================================================

    async start(port: number): Promise<void> {
        const app = express();
        app.use(express.json());

        // ---- 启动时 git commit checkpoint ----
        try {
            const timestamp = new Date().toISOString();
            execFileSync('git', ['add', '.'], { cwd: this.projectRoot, stdio: 'pipe' });
            execFileSync('git', ['commit', '-m', `[review] ${timestamp} — started`], {
                cwd: this.projectRoot,
                encoding: 'utf-8',
                stdio: 'pipe'
            });
            logger.info(`✅ Git checkpoint: [review] ${timestamp}`);
        } catch (e) {
            logger.warn(`启动 checkpoint 失败: ${(e as Error).message}`);
        }

        // 启动 TTL / Idle 计时器
        this.scheduleTtlTimer();
        this.scheduleIdleTimer();

        // SIGINT 处理（Ctrl+C）
        process.once('SIGINT', () => {
            logger.info('\n🔒 收到 Ctrl+C，优雅关闭...');
            this.gracefulShutdown('sigint');
        });

        // ---- 静态文件 ----
        app.use('/opsv-queue', express.static(
            path.join(this.projectRoot, 'opsv-queue')
        ));

        // Review UI 静态页面
        let publicPath = path.join(__dirname, 'public');
        const publicPathExists = await fs.access(publicPath).then(() => true).catch(() => false);
        if (!publicPathExists) {
            publicPath = path.join(__dirname, '../src/review-ui/public');
        }

        const finalPublicPathExists = await fs.access(publicPath).then(() => true).catch(() => false);
        if (finalPublicPathExists) {
            app.use(express.static(publicPath));
        } else {
            logger.error(`❌ Review UI 静态资源目录不存在: ${publicPath}`);
            app.get('/', (req, res) => {
                res.status(500).send('<h1>OpsV Review UI 资源缺失</h1><p>请确保 dist/review-ui/public 目录存在。</p>');
            });
        }

        // ---- API: 获取批次内所有候选图 ----
        app.get('/api/candidates', async (req: any, res: any) => {
            this.resetIdleTimer();
            try {
                const candidates = await this.resolveBatchCandidates();
                res.json({ success: true, data: candidates });
            } catch (e) {
                res.status(500).json({ success: false, error: (e as Error).message });
            }
        });

        // ---- API: 获取文档内容 ----
        app.get('/api/document/:jobId', async (req: any, res: any) => {
            this.resetIdleTimer();
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
            this.resetIdleTimer();
            try {
                const issues = await this.runFormatCheck();
                res.json({ success: true, data: issues });
            } catch (e) {
                res.status(500).json({ success: false, error: (e as Error).message });
            }
        });

        // ---- API: Approve 操作（支持多选）----
        app.post('/api/approve', async (req: any, res: any) => {
            this.resetIdleTimer();
            try {
                const { selections, reviewNote } = req.body;
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

        // ---- API: Draft 操作（打回并记录参考）----
        app.post('/api/draft', async (req: any, res: any) => {
            this.resetIdleTimer();
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

                // 2. 记录 draft_ref
                if (imagePath) {
                    const relativePath = path.relative(this.projectRoot, imagePath).replace(/\\/g, '/');
                    content = FrontmatterParser.updateField(content, 'draft_ref', relativePath);
                }

                // 3. 记录导演意见
                const reviewEntry = `${new Date().toISOString().split('T')[0]}: [DRAFT] ${feedback || '需要调整'}`;
                content = FrontmatterParser.appendReview(content, reviewEntry);

                await fs.writeFile(docPath, content, 'utf-8');
                logger.info(`📝 Draft: ${jobId} — ${feedback || '(无具体意见)'}`);

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

        // ---- API: 完成审阅（手动关闭）----
        app.post('/api/complete-review', async (req: any, res: any) => {
            logger.info('🔒 收到完成审阅请求');
            this.gracefulShutdown('manual');
        });

        this.serverInstance = app.listen(port, () => {
            logger.info(`Review 服务启动: http://localhost:${port}`);
            logger.info(`   TTL: ${this.lifecycle.ttlMs}ms | Idle: ${this.lifecycle.idleMs}ms`);
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

            const entries = await fs.readdir(dir);
            for (const entry of entries) {
                const entryPath = path.join(dir, entry);
                const stat = await fs.stat(entryPath);

                if (stat.isDirectory()) {
                    await this.scanModelDir(entryPath, entry, batchId, groups, jobMeta);
                } else if (stat.isFile() && /\.(png|jpg|webp|mp4|webm)$/i.test(entry)) {
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

        if (!variant) {
            const existingCount = await this.countExistingApproved(jobId);
            variant = existingCount === 0 ? 'default' : `variant_${existingCount + 1}`;
        }

        const approvedPath = imagePath;
        const docPath = await this.findSourceDoc(jobId);
        if (docPath) {
            await this.approvedRefReader.appendApprovedRef(docPath, variant, approvedPath);

            let content = await fs.readFile(docPath, 'utf-8');

            const reviewEntry = `${new Date().toISOString().split('T')[0]}: ${reviewNote || 'approved via review UI'}`;
            content = FrontmatterParser.appendReview(content, reviewEntry);

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

        if (!content.match(/^---\r?\n/)) {
            issues.push('缺少 YAML frontmatter');
            return issues;
        }

        try {
            const { frontmatter } = FrontmatterParser.parseRaw(content);

            if (!frontmatter.type) issues.push('缺少 type 字段');
            if (!frontmatter.status) issues.push('缺少 status 字段');

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

        docContent = FrontmatterParser.updateField(docContent, 'prompt_en', actualPrompt);

        const taskImageRefs = this.extractImageRefs(taskData.image || [], content);
        if (taskImageRefs.length > 0) {
            docContent = this.syncDesignReferences(docContent, taskImageRefs);
        }

        const taskJsonRelPath = path.relative(this.projectRoot, path.dirname(imagePath)).replace(/\\/g, '/')
            + `/${jobId}.json`;
        const model = taskData.model || '';
        const size = taskData.size || taskData.ratio || '';
        const reviewNote = `prompt_en 已从 task JSON 同步 | ${model}${size ? ` | ${size}` : ''} | ${taskJsonRelPath}`;
        docContent = FrontmatterParser.appendReview(docContent, reviewNote);

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
