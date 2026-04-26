import fs from 'fs/promises';
import path from 'path';
import { AssetManager } from '../core/AssetManager';
import { AssetCompiler } from '../core/AssetCompiler';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { RefResolver, RefResult } from '../core/RefResolver';
import { ApprovedRefReader } from '../core/ApprovedRefReader';
import { DependencyGraph } from '../core/DependencyGraph';
import { JobValidator } from './JobValidator';

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
    private layerIndex: number = 0; // 0 = flat/legacy mode

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
        options: { 
            preview?: boolean; 
            shots?: string[]; 
            skipApproved?: boolean; 
            skipDependsLayer?: boolean;
            circleIndex?: number; // 指定运行哪个环 (N-Circle)
            circleName?: string; // 指定环名称 (如 "zerocircle", "firstcircle")
            iterationIndex?: number; // 指定本次运行的序号 (_N)
            graphName?: string; // 图名称 (默认 videospec)
        } = {}
    ): Promise<Job[]> {
        // ---- 初始化 ----
        await this.assetManager.loadAssets();
        await this.assetCompiler.loadProjectConfig();
        const globalConfig = this.assetCompiler.getProjectConfig();

        // 默认模型逻辑 (从 project.md 或默认设定获取)
        const defaultImageProvider = globalConfig.engine || 'siliconflow';

        // ---- 构建依赖图 ----
        const depGraph = await DependencyGraph.buildFromProject(this.projectRoot);
        logger.info(await depGraph.prettyPrint(this.approvedRefReader));

        // 获取 graphName (如果没有传入，从 active graph 获取)
        const graphName = options.graphName || await DependencyGraph.getActiveGraph(this.projectRoot);

        // ---- 解析 circleIndex 和 circleName ----
        // circleName 可以是 "zerocircle", "firstcircle", "ZeroCircle", "FirstCircle" 等
        // 如果同时传入了 circleIndex 和 circleName，以 circleName 为准进行验证
        const { batches } = depGraph.topologicalSort();
        
        // 确定目标环索引
        let targetCircleIdx = options.circleIndex;
        if (targetCircleIdx === undefined && options.circleName) {
            // 从 circleName 反推索引
            const lowerName = options.circleName.toLowerCase();
            const CIRCLE_NAME_MAP: Record<string, number> = {
                'zerocircle': 0, 'zero_circle': 0,
                'firstcircle': 1, 'first_circle': 1,
                'secondcircle': 2, 'second_circle': 2,
                'thirdcircle': 3, 'third_circle': 3,
                'fourthcircle': 4, 'fourth_circle': 4,
                'fifthcircle': 5, 'fifth_circle': 5,
            };
            // 去掉可能的 _N 后缀 (如 "firstcircle_1" -> "firstcircle")
            const baseName = lowerName.replace(/_\d+$/, '');
            targetCircleIdx = CIRCLE_NAME_MAP[baseName];
        }
        
        // ---- 圈层隔离检查: 验证 explicitFilePaths 属于目标环 ----
        if (targetCircleIdx !== undefined && options.circleName) {
            // 构建 asset -> circleIndex 的映射
            const assetToCircle = new Map<string, number>();
            for (let i = 0; i < batches.length; i++) {
                for (const assetId of batches[i]) {
                    assetToCircle.set(assetId, i);
                }
            }
            
            // 获取目标环的名称用于错误消息
            const targetCircleWord = options.circleName.replace(/_\d+$/, '').toLowerCase();
            
            // 检查 explicitFilePaths 中的每个资产是否属于目标环
            for (const target of targets) {
                const targetPath = path.resolve(this.projectRoot, target);
                if (!await fs.access(targetPath).then(() => true).catch(() => false)) continue;
                
                const stats = await fs.stat(targetPath);
                if (stats.isFile() && targetPath.endsWith('.md')) {
                    const assetId = path.basename(targetPath, '.md').replace(/^@/, '');
                    const assetCircleIdx = assetToCircle.get(assetId);
                    if (assetCircleIdx !== undefined && assetCircleIdx !== targetCircleIdx) {
                        const assetCircleWord = this.getCircleWord(assetCircleIdx);
                        throw new Error(`${assetId} 属于 ${assetCircleWord}，请先执行 opsv imagen ${assetCircleWord}`);
                    }
                } else if (stats.isDirectory()) {
                    const files = (await fs.readdir(targetPath)).filter(f => f.endsWith('.md'));
                    for (const file of files) {
                        const assetId = file.replace(/^@/, '').replace(/\.md$/, '');
                        const assetCircleIdx = assetToCircle.get(assetId);
                        if (assetCircleIdx !== undefined && assetCircleIdx !== targetCircleIdx) {
                            const assetCircleWord = this.getCircleWord(assetCircleIdx);
                            throw new Error(`${assetId} 属于 ${assetCircleWord}，请先执行 opsv imagen ${assetCircleWord}`);
                        }
                    }
                }
            }
        }

        // ---- 扫描目标目录 ----
        if (!targets || targets.length === 0) {
            targets = [
                path.join(this.projectRoot, 'videospec/elements'),
                path.join(this.projectRoot, 'videospec/scenes'),
                path.join(this.projectRoot, 'videospec/shots'),
            ];
        }

        const explicitFilePaths = new Set<string>();
        for (const target of targets) {
            const targetPath = path.resolve(this.projectRoot, target);
            if (!await fs.access(targetPath).then(() => true).catch(() => false)) continue;
            const stats = await fs.stat(targetPath);
            if (stats.isFile() && targetPath.endsWith('.md')) {
                explicitFilePaths.add(targetPath.replace(/\\/g, '/'));
            } else if (stats.isDirectory()) {
                const files = (await fs.readdir(targetPath)).filter(f => f.endsWith('.md'));
                for (const file of files) {
                    explicitFilePaths.add(path.join(targetPath, file).replace(/\\/g, '/'));
                }
            }
        }

        let allJobs: Job[] = [];
        const skippedLog: { id: string; file: string; reason: string }[] = [];

        for (const target of targets) {
            const targetPath = path.resolve(this.projectRoot, target);
            if (!await fs.access(targetPath).then(() => true).catch(() => false)) continue;

            const stats = await fs.stat(targetPath);
            if (stats.isDirectory()) {
                const files = (await fs.readdir(targetPath)).filter(f => f.endsWith('.md'));
                for (const file of files) {
                    const filePath = path.join(targetPath, file);
                    const jobs = await this.processFile(filePath, globalConfig, options, skippedLog, explicitFilePaths);
                    allJobs = allJobs.concat(jobs);
                }
            } else if (stats.isFile() && targetPath.endsWith('.md')) {
                const jobs = await this.processFile(targetPath, globalConfig, options, skippedLog, explicitFilePaths);
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

        // ---- 过滤器: 确定可执行任务 ----
        const { executable, blocked, reasons } = await depGraph.filterExecutable(allJobs, this.approvedRefReader);
        if (blocked.length > 0) {
            logger.warn(`\n⚠️ ${blocked.length} 个任务因依赖未就绪被暂缓:`);
        }

        if (executable.length === 0) {
            logger.info("没有可执行的新任务。");
            return [];
        }

        // ---- 分层逻辑: 确定本次要下发的 Circle ----
        const { idToLayer } = depGraph.buildLayerIndex(executable);
        
        // 如果没有指定 circleIndex，默认下发第一层 (ZeroCircle)
        const targetLayerIdx = options.circleIndex !== undefined ? options.circleIndex : 0;
        
        // 过滤出属于当前 Circle 的任务
        // 注意：idToLayer 返回的是 1-based (Layer 1 = ZeroCircle)，所以这里要 +1
        const targetLayerJobs = executable.filter(j => (idToLayer.get(j.id)) === (targetLayerIdx + 1));

        if (targetLayerJobs.length === 0) {
            logger.warn(`Circle ${targetLayerIdx} 无可执行任务，请检查依赖关系。`);
            return [];
        }

        // ---- 保存任务列表到 opsv-queue ----
        // 使用 ensureCircleDirectories 确保圈层目录存在（仅文件列表变化时新建）
        const circleDirInfo = await depGraph.ensureCircleDirectories(this.projectRoot, targetLayerIdx, graphName);
        const circleDir = circleDirInfo.dir;
        
        const jobsPath = path.join(circleDir, 'imagen_jobs.json');
        await fs.writeFile(jobsPath, JSON.stringify(targetLayerJobs, null, 2), 'utf-8');
        
        const circleWord = this.getCircleWord(targetLayerIdx);
        logger.info(`\n✅ ${path.basename(circleDir)} 任务列表生成完毕: ${targetLayerJobs.length} 个任务 → ${jobsPath}`);
        
        return targetLayerJobs;
    }

    private getCircleWord(index: number): string {
        const words = ['zerocircle', 'firstcircle', 'secondcircle', 'thirdcircle', 'fourthcircle', 'fifthcircle'];
        return words[index] || `circle_${index}`;
    }

    /**
     * 自动寻找当前环的下一个可用序号
     */
    private async _nextCircleIteration(circleIndex: number): Promise<number> {
        const circleWord = this.getCircleWord(circleIndex);
        let idx = 1;
        while (true) {
            const circlePath = path.join(this.projectRoot, 'opsv-queue', `${circleWord}_${idx}`);
            if (!await fs.access(circlePath).then(() => true).catch(() => false)) {
                break;
            }
            idx++;
        }
        return idx;
    }

    // ================================================================
    // 文件分流
    // ================================================================

    private async processFile(
        filePath: string,
        globalConfig: any,
        options: { preview?: boolean; shots?: string[]; skipApproved?: boolean },
        skippedLog: { id: string; file: string; reason: string }[],
        explicitFilePaths: Set<string>
    ): Promise<Job[]> {
        const normalizedPath = filePath.replace(/\\/g, '/');

        if (normalizedPath.includes('/elements/') || normalizedPath.includes('/scenes/')) {
            return this.processAssetFile(filePath, globalConfig, options, skippedLog, explicitFilePaths);
        } else if (normalizedPath.includes('/shots/')) {
            // v0.5: 支持多样化命名。包含 'shotlist.md' 的文件被视为生产辅助文档并跳过解析
            const fileName = path.basename(filePath).toLowerCase();
            if (fileName.includes('shotlist.md')) {
                logger.info(`跳过 ${path.basename(filePath)} (视频编译管线专用)`);
                return [];
            }
            return this.processShotDesignFile(filePath, globalConfig, options, skippedLog, explicitFilePaths);
        }

        logger.warn(`跳过非规范目录文件: ${filePath}`);
        return [];
    }

    // ================================================================
    // 资产文件处理（elements/*.md, scenes/*.md）
    // ================================================================

    private async processAssetFile(
        filePath: string,
        globalConfig: any,
        options: { skipApproved?: boolean },
        skippedLog: { id: string; file: string; reason: string }[],
        explicitFilePaths: Set<string>
    ): Promise<Job[]> {
        const content = await fs.readFile(filePath, 'utf-8');
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

        // Approved 检查: 显式指定的文档跳过 approved 检查；其他文档检查 Approved References 区
        const isExplicit = explicitFilePaths.has(filePath.replace(/\\/g, '/'));
        if (options.skipApproved && !isExplicit) {
            const hasApproved = await this.approvedRefReader.hasAnyApproved(id);
            if (hasApproved) {
                logger.info(`  ⏭️  跳过已有 approved 图的资产: ${id}`);
                skippedLog.push({ id, file: filePath, reason: 'has approved image' });
                return [];
            }
        }

        logger.info(`  处理资产: ${id} (type: ${frontmatter.type}, status: ${frontmatter.status})`);

        // v0.5.7: YAML 强约束，职责清晰化：仅关注视觉属性
        const description = (frontmatter as any).visual_brief || "(无描述)";
        const yamlPrompt = (frontmatter as any).prompt_en;

        // 虽然主 Prompt 来自 YAML，但我们仍需解析正文中的 @ 引用以获取附件
        const { attachments } = await this.assetCompiler.assembleAssetPrompt(id, body);

        // ---- 全局配置 ----
        const ar = globalConfig.aspect_ratio || '16:9';
        const res = globalConfig.resolution || '1920x1080';

        // ---- 移除硬编码 output_path ----
        // output_path 交由 provider queue run 阶段自动确定

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
            _meta: { batch: `draft_${this.batchIndex}`, source: filePath },
        };

        return [job];
    }

    // ================================================================
    // Script.md 处理（从正文 ## Shot NN 解析）
    // ================================================================

    private async processShotDesignFile(
        filePath: string,
        globalConfig: any,
        options: { preview?: boolean; shots?: string[]; skipApproved?: boolean },
        skippedLog: { id: string; file: string; reason: string }[],
        explicitFilePaths: Set<string>
    ): Promise<Job[]> {
        const content = await fs.readFile(filePath, 'utf-8');
        const jobs: Job[] = [];

        let frontmatter: any;
        let body: string;
        try {
            const parsed = FrontmatterParser.parseRaw(content);
            frontmatter = parsed.frontmatter;
            body = parsed.body;
        } catch (e) {
            logger.error(`[${path.basename(filePath)}] 解析失败: ${(e as Error).message}`);
            return [];
        }

        // Approved 检查: 显式指定的文档跳过 approved 检查；其他文档检查 Approved References 区
        const isExplicit = explicitFilePaths.has(filePath.replace(/\\/g, '/'));
        if (options.skipApproved && !isExplicit) {
            // shots 的 approved 检查按 shot 设计文档本身来（通过 findDocPath 查找）
            const docId = path.basename(filePath).replace(/\.md$/, '');
            const hasApproved = await this.approvedRefReader.hasAnyApproved(docId);
            if (hasApproved) {
                const fileName = path.basename(filePath);
                logger.info(`  ⏭️  跳过已有 approved 图的脚本: ${fileName}`);
                skippedLog.push({ id: fileName, file: filePath, reason: 'has approved image' });
                return [];
            }
        }

        // ---- v0.5 核心: 从正文 ## Shot NN 标题解析 shots ----
        const shots = this.parseShotsFromBody(body);
        logger.info(`  [${path.basename(filePath)}] 解析到 ${shots.length} 个分镜`);

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
            const { expandedText, attachments: assetAttachments } = await this.refResolver.expandRefsInText(
                shot.body, shot.refs
            );

            // ---- v0.5.12: 解析镜头局部参考图 (Shot-Local References) ----
            const localAttachments = await this.extractLocalImageRefs(shot.body, filePath);
            const allAttachments = Array.from(new Set([...assetAttachments, ...localAttachments]));

            // ---- 全局配置 ----
            const ar = globalConfig.aspect_ratio || '16:9';
            const res = globalConfig.resolution || '1920x1080';
            const stylePostfix = globalConfig.global_style_postfix || '';

            // ---- 组装 prompt ----
            let promptEn = this.cleanMarkdown(expandedText);
            if (stylePostfix) promptEn += `, ${stylePostfix}`;

            // ---- 构建 Job ----
            // 移除 output_path，由 provider 自行根据全局计数命名

            const payload: PromptPayload = {
                prompt: `[分镜: ${shot.id} - ${shot.title}]\n${shot.body}`,
                global_settings: { aspect_ratio: ar, quality: res },
            };

            const job: Job = {
                id: shot.id,
                type: 'image_generation',
                prompt_en: promptEn,
                payload,
                reference_images: allAttachments.length > 0 ? allAttachments : undefined,
                _meta: { batch: `draft_${this.batchIndex}`, source: filePath },
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

    private cleanMarkdown(text: string): string {
        return text
            .replace(/\*\?(?:\()?@([a-zA-Z0-9_:]+)(?:\))?/g, '') // 清理新语法标号
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/!\[.*?\]\(.*?\)/g, '')
            .replace(/^[-*]\s+/gm, '')
            .replace(/---+/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    /**
     * v0.5.12: 从文本中提取 Markdown 图片链接并转为绝对路径
     */
    private async extractLocalImageRefs(text: string, sourcePath: string): Promise<string[]> {
        const refs: string[] = [];
        const imgRegex = /!\[.*?\]\(([^)]+)\)/g;
        let match;
        const baseDir = path.dirname(sourcePath);

        while ((match = imgRegex.exec(text)) !== null) {
            const imgPath = match[1];
            const absPath = path.isAbsolute(imgPath) 
                ? imgPath 
                : path.resolve(baseDir, imgPath);
            if (await fs.access(absPath).then(() => true).catch(() => false)) {
                refs.push(absPath.replace(/\\/g, '/'));
            } else {
                logger.warn(`镜头局部参考图不存: ${absPath}`);
            }
        }
        return refs;
    }
}
