import fs from 'fs';
import path from 'path';
import { AssetManager } from '../core/AssetManager';
import { AssetCompiler } from '../core/AssetCompiler';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { RefResolver, RefResult } from '../core/RefResolver';
import { ApprovedRefReader } from '../core/ApprovedRefReader';
import { DependencyGraph } from '../core/DependencyGraph';
import { JobValidator } from './JobValidator';
import { ShotDesignFrontmatterSchema } from '../types/FrontmatterSchema';
import { Job, PromptPayload } from '../types/PromptSchema';
import { logger } from '../utils/logger';

// ============================================================================
// v0.5 任务生成器（图像编译管线）
// 核心变更:
//   1. Script.md 从正文 ## Shot NN 解析
//   2. @ 引用由 RefResolver 处理
//   3. 集成 DependencyGraph 严格模式
//   4. 编译期通用校验
// ============================================================================

interface ParsedShot {
    id: string;
    title: string;
    body: string;
    refs: RefResult[];
}

export class JobGenerator {
    private projectRoot: string;
    private assetManager: AssetManager;
    private assetCompiler: AssetCompiler;
    private refResolver: RefResolver;
    private approvedRefReader: ApprovedRefReader;
    private jobValidator: JobValidator;
    private currentDraftDir: string = '';
    private batchIndex: number = 1;

    constructor(projectRoot: string) {
        this.projectRoot = path.resolve(projectRoot);
        this.assetManager = new AssetManager(this.projectRoot);
        this.assetCompiler = new AssetCompiler(this.projectRoot);
        this.approvedRefReader = new ApprovedRefReader(this.projectRoot);
        this.refResolver = new RefResolver(this.projectRoot, this.approvedRefReader);
        this.jobValidator = new JobValidator();
    }

    async generateJobs(
        targets: string[],
        options: { preview?: boolean; shots?: string[] } = {}
    ): Promise<Job[]> {
        // ---- 初始化 ----
        await this.assetManager.loadAssets();
        this.assetCompiler.loadProjectConfig();
        const globalConfig = this.assetCompiler.getProjectConfig();

        // ---- 计算批次目录 ----
        this.batchIndex = 1;
        while (fs.existsSync(path.join(this.projectRoot, `artifacts/drafts_${this.batchIndex}`))) {
            this.batchIndex++;
        }
        this.currentDraftDir = path.join(this.projectRoot, `artifacts/drafts_${this.batchIndex}`);
        fs.mkdirSync(this.currentDraftDir, { recursive: true });

        // ---- 构建依赖图（每次 generate 前重新构建，确保最新） ----
        const depGraph = DependencyGraph.buildFromProject(this.projectRoot);
        logger.info(await depGraph.prettyPrint(this.approvedRefReader));

        // ---- 扫描目标目录 ----
        if (!targets || targets.length === 0) {
            targets = [
                path.join(this.projectRoot, 'videospec/elements'),
                path.join(this.projectRoot, 'videospec/scenes'),
                path.join(this.projectRoot, 'videospec/shots'),
            ];
        }

        let allJobs: Job[] = [];
        for (const target of targets) {
            const targetPath = path.resolve(this.projectRoot, target);
            if (!fs.existsSync(targetPath)) continue;

            const stats = fs.statSync(targetPath);
            if (stats.isDirectory()) {
                const files = fs.readdirSync(targetPath).filter(f => f.endsWith('.md'));
                for (const file of files) {
                    const filePath = path.join(targetPath, file);
                    const jobs = await this.processFile(filePath, globalConfig, options);
                    allJobs = allJobs.concat(jobs);
                }
            } else if (stats.isFile() && targetPath.endsWith('.md')) {
                const jobs = await this.processFile(targetPath, globalConfig, options);
                allJobs = allJobs.concat(jobs);
            }
        }

        // ---- 编译期通用校验 + 清洗 ----
        const { valid, errors, sanitized } = this.jobValidator.validateAndSanitize(allJobs);
        if (!valid) {
            logger.warn(`\n⚠️ 编译期校验发现 ${errors.length} 个问题:`);
            for (const err of errors) {
                logger.warn(`  ❌ ${err.jobId}.${err.field}: ${err.message}`);
            }
        }
        allJobs = sanitized || allJobs;

        // ---- 依赖图严格模式: 仅保留可执行的任务 ----
        const { executable, blocked, reasons } = await depGraph.filterExecutable(allJobs, this.approvedRefReader);
        if (blocked.length > 0) {
            logger.warn(`\n⚠️ ${blocked.length} 个任务因依赖未就绪被暂缓:`);
            for (const [id, reason] of reasons) {
                logger.warn(`  ⏸️ ${id}: ${reason}`);
            }
        }

        // ---- 写入 queue ----
        const queueDir = path.join(this.projectRoot, 'queue');
        if (!fs.existsSync(queueDir)) fs.mkdirSync(queueDir);

        // 主任务队列
        fs.writeFileSync(
            path.join(queueDir, 'jobs.json'),
            JSON.stringify(executable, null, 2)
        );

        // 带批次号的备份（用于 review 时按批次检索）
        fs.writeFileSync(
            path.join(this.currentDraftDir, `jobs_batch_${this.batchIndex}.json`),
            JSON.stringify(executable, null, 2)
        );

        logger.info(
            `\n✅ 编译完成: ${executable.length} 个可执行任务` +
            (blocked.length > 0 ? ` (${blocked.length} 个等待依赖)` : '')
        );

        return executable;
    }

    // ================================================================
    // 文件分流
    // ================================================================

    private async processFile(
        filePath: string,
        globalConfig: any,
        options: { preview?: boolean; shots?: string[] }
    ): Promise<Job[]> {
        const normalizedPath = filePath.replace(/\\/g, '/');

        if (normalizedPath.includes('/elements/') || normalizedPath.includes('/scenes/')) {
            return this.processAssetFile(filePath, globalConfig);
        } else if (normalizedPath.includes('/shots/')) {
            // v0.5: 只处理 Script.md（shot-design），跳过 Shotlist.md（shot-production）
            if (path.basename(filePath).toLowerCase() === 'shotlist.md') {
                logger.info(`跳过 Shotlist.md（视频编译管线专用）`);
                return [];
            }
            return this.processShotDesignFile(filePath, globalConfig, options);
        }

        logger.warn(`跳过非规范目录文件: ${filePath}`);
        return [];
    }

    // ================================================================
    // 资产文件处理（elements/*.md, scenes/*.md）
    // ================================================================

    private async processAssetFile(filePath: string, globalConfig: any): Promise<Job[]> {
        const content = fs.readFileSync(filePath, 'utf-8');
        const id = path.parse(filePath).name.replace(/^@/, '');

        let frontmatter: any;
        let body: string;
        try {
            const parsed = FrontmatterParser.parseRaw(content);
            frontmatter = parsed.frontmatter;
            body = parsed.body;
        } catch {
            return [];
        }

        // v0.5: 如果 status 已经是 approved，跳过图像生成
        if (frontmatter.status === 'approved') {
            logger.info(`  跳过已 approved 资产: ${id}`);
            return [];
        }

        logger.info(`  处理资产: ${id} (type: ${frontmatter.type}, status: ${frontmatter.status})`);

        // v0.5.6: YAML 强约束，正文仅用于参考或 @ 引用展开
        const description = (frontmatter as any).brief_description || "(无描述)";
        const yamlPrompt = (frontmatter as any).prompt_en;

        // 虽然主 Prompt 来自 YAML，但我们仍需解析正文中的 @ 引用以获取附件
        const { attachments } = await this.assetCompiler.assembleAssetPrompt(id, body);

        // ---- 全局配置 ----
        const ar = globalConfig.aspect_ratio || '16:9';
        const res = globalConfig.resolution || '1920x1080';

        // ---- 输出路径 ----
        const outputPath = this.nextOutputPath(id);

        // ---- 构建 Job ----
        const payload: PromptPayload = {
            prompt: `[资产设计: ${id}]\n${description}`,
            global_settings: { aspect_ratio: ar, quality: res },
            subject: { description },
        };

        const job: Job = {
            id,
            type: 'image_generation',
            prompt_en: yamlPrompt || undefined,
            payload,
            reference_images: attachments.length > 0 ? attachments : undefined,
            output_path: outputPath,
            _meta: { batch: `batch_${this.batchIndex}`, source: filePath },
        };

        return [job];
    }

    // ================================================================
    // Script.md 处理（从正文 ## Shot NN 解析）
    // ================================================================

    private async processShotDesignFile(
        filePath: string,
        globalConfig: any,
        options: { preview?: boolean; shots?: string[] }
    ): Promise<Job[]> {
        const content = fs.readFileSync(filePath, 'utf-8');
        const jobs: Job[] = [];

        let body: string;
        try {
            const parsed = FrontmatterParser.parseRaw(content);
            body = parsed.body;
        } catch (e) {
            logger.error(`Script.md 解析失败: ${(e as Error).message}`);
            return [];
        }

        // ---- v0.5 核心: 从正文 ## Shot NN 标题解析 shots ----
        const shots = this.parseShotsFromBody(body);
        logger.info(`  Script.md 解析到 ${shots.length} 个分镜`);

        for (const shot of shots) {
            // ---- 过滤: preview 模式或指定 shots ----
            if (options.shots && options.shots.length > 0) {
                const shotNum = shot.id.replace('shot_', '');
                if (!options.shots.includes(shot.id) && !options.shots.includes(shotNum)) {
                    continue;
                }
            } else if (options.preview) {
                if (shot.id !== 'shot_01') continue;
            }

            // ---- 解析 @ 引用并展开 ----
            const { expandedText, attachments } = this.refResolver.expandRefsInText(
                shot.body, shot.refs
            );

            // ---- 全局配置 ----
            const ar = globalConfig.aspect_ratio || '16:9';
            const res = globalConfig.resolution || '1920x1080';
            const stylePostfix = globalConfig.global_style_postfix || '';

            // ---- 组装 prompt ----
            let promptEn = this.cleanMarkdown(expandedText);
            if (stylePostfix) promptEn += `, ${stylePostfix}`;

            // ---- 输出路径 ----
            const outputPath = this.nextOutputPath(shot.id);

            const payload: PromptPayload = {
                prompt: `[分镜: ${shot.id} - ${shot.title}]\n${shot.body}`,
                global_settings: { aspect_ratio: ar, quality: res },
            };

            const job: Job = {
                id: shot.id,
                type: 'image_generation',
                prompt_en: promptEn,
                payload,
                reference_images: attachments.length > 0 ? attachments : undefined,
                output_path: outputPath,
                _meta: { batch: `batch_${this.batchIndex}`, source: filePath },
            };

            jobs.push(job);
        }

        return jobs;
    }

    // ================================================================
    // 正文 ## Shot NN 解析器
    // ================================================================

    private parseShotsFromBody(body: string): ParsedShot[] {
        const shots: ParsedShot[] = [];

        // 匹配 ## Shot 01 - 标题 或 ## Shot 1 标题
        const shotRegex = /^##\s+Shot\s+(\d+)\s*[-–—]?\s*(.*)/gm;
        const sections: { id: string; title: string; startIdx: number }[] = [];

        let match;
        while ((match = shotRegex.exec(body)) !== null) {
            sections.push({
                id: `shot_${match[1].padStart(2, '0')}`,
                title: match[2].trim(),
                startIdx: match.index + match[0].length,
            });
        }

        for (let i = 0; i < sections.length; i++) {
            const start = sections[i].startIdx;
            // 到下一个 ## Shot 或下一个 ## 标题或文档结尾
            let end = body.length;
            for (let j = start + 1; j < body.length; j++) {
                if (body[j] === '#' && body[j + 1] === '#' && (j === 0 || body[j - 1] === '\n')) {
                    end = j;
                    break;
                }
            }
            const shotBody = body.slice(start, end).trim();

            shots.push({
                id: sections[i].id,
                title: sections[i].title,
                body: shotBody,
                refs: [], // refs 将异步解析
            });
        }

        return shots;
    }

    // ================================================================
    // 工具方法
    // ================================================================

    /**
     * 生成不重复的输出路径
     */
    private nextOutputPath(baseName: string): string {
        let counter = 1;
        let outputPath = path.join(this.currentDraftDir, `${baseName}_draft_${counter}.png`);
        while (fs.existsSync(outputPath)) {
            counter++;
            outputPath = path.join(this.currentDraftDir, `${baseName}_draft_${counter}.png`);
        }
        return outputPath;
    }

    private cleanMarkdown(text: string): string {
        return text
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/!\[.*?\]\(.*?\)/g, '')
            .replace(/^[-*]\s+/gm, '')
            .replace(/---+/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
}
