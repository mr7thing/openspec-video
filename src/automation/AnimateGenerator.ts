import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { Job, PromptPayload } from '../types/PromptSchema';
import { AssetCompiler } from '../core/AssetCompiler';
import { RefResolver } from '../core/RefResolver';
import { ApprovedRefReader } from '../core/ApprovedRefReader';
import { DependencyGraph } from '../core/DependencyGraph';
import { logger } from '../utils/logger';

// ============================================================================
// v0.5.13 视频编译管线 (Explicit Ledger Paradigm)
// 核心: 读 Shotlist.md → 解析 YAML 状态块 → 合成纯净 Prompt → 生成 video_jobs.json
// ============================================================================

export class AnimateGenerator {
    private projectRoot: string;
    private assetCompiler: AssetCompiler;
    private refResolver: RefResolver;

    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
        this.assetCompiler = new AssetCompiler(projectRoot);
        const approvedRefReader = new ApprovedRefReader(projectRoot);
        this.refResolver = new RefResolver(projectRoot, approvedRefReader);
    }

    async generateAnimationJobs(circle: string = 'auto'): Promise<Job[]> {
        // 如果指定 auto，自动推断依赖图的末端 Circle
        const resolvedCircle = circle === 'auto'
            ? await this.resolveEndCircle()
            : circle;
        // 不区分大小写查找 shotlist 文件
        const shotsDir = path.join(this.projectRoot, 'videospec/shots');
        let shotlistPath: string | null = null;
        const shotsDirExists = await fs.access(shotsDir).then(() => true).catch(() => false);
        if (shotsDirExists) {
            const files = await fs.readdir(shotsDir);
            const shotlistFile = files.find(f => f.toLowerCase() === 'shotlist.md');
            if (shotlistFile) {
                shotlistPath = path.join(shotsDir, shotlistFile);
            }
        }
        if (!shotlistPath) {
            logger.error(`❌ 未找到 Shotlist.md: ${shotsDir}/shotlist.md`);
            logger.error(`   请先通过 opsv-animator agent 生成动态分镜表`);
            return [];
        }

        const content = await fs.readFile(shotlistPath, 'utf-8');

        // ---- 解析正文 ## Shot NN ----
        const shotSections = this.parseShotSections(content);
        if (shotSections.length === 0) {
            logger.error(`❌ Shotlist.md 中未找到有效的 ## Shot NN 区域或 YAML 状态块`);
            return [];
        }

        // ---- 加载全局配置 ----
        await this.assetCompiler.loadProjectConfig();
        const globalConfig = this.assetCompiler.getProjectConfig();
        const ar = globalConfig.aspect_ratio || '16:9';
        const res = globalConfig.resolution || '1920x1080';

        // ---- 输出目录 ----
        const circleDir = path.join(this.projectRoot, 'opsv-queue', resolvedCircle);
        await fs.mkdir(circleDir, { recursive: true });

        const jobs: Job[] = [];

        // 不需要 buildGraph，parseAll 和 resolve 会动态查找

        for (const section of shotSections) {
            // 状态机拦截
            if (section.state.status !== 'pending' && section.state.status !== 'failed') {
                logger.info(`⏭️ 跳过 ${section.id} (状态: ${section.state.status})`);
                continue;
            }

            // 解析第一帧（支持 @FRAME:shot_01_last 指针）
            let absFirst = this.resolvePath(section.state.first_frame);
            if (absFirst && absFirst.startsWith('@FRAME:')) {
                const frameResult = await this.refResolver.resolve(absFirst.slice(1), '');
                if (frameResult.resolvedImagePath) {
                    absFirst = frameResult.resolvedImagePath;
                } else {
                    logger.warn(`⚠️ Shot ${section.id}: @FRAME 指针解析失败 ${section.state.first_frame}，跳过`);
                    continue;
                }
            }
            if (!absFirst) {
                logger.warn(`⚠️ Shot ${section.id}: 缺少 first_frame (首帧)，跳过`);
                continue;
            }
            const firstExists = await fs.access(absFirst).then(() => true).catch(() => false);
            if (!firstExists) {
                logger.error(`❌ Shot ${section.id}: 首帧文件不存在 ${absFirst}，跳过`);
                continue;
            }

            // 获取最后一帧设置（支持 @FRAME 指针）
            let absLast = this.resolvePath(section.state.last_frame);
            if (absLast && absLast.startsWith('@FRAME:')) {
                const frameResult = await this.refResolver.resolve(absLast.slice(1), '');
                if (frameResult.resolvedImagePath) {
                    absLast = frameResult.resolvedImagePath;
                } else {
                    logger.warn(`⚠️ Shot ${section.id}: @FRAME 尾帧指针解析失败 ${section.state.last_frame}，忽略尾帧`);
                    absLast = null;
                }
            }

            // 提取纯净的 Prompt 并展开 @ID
            let rawPrompt = this.cleanPromptText(section.textBody);
            
            // v0.5.13: 支持 Local Reference Images (和 JobGenerator 保持一致)
            const localImageRefs = this.extractLocalImages(rawPrompt);
            const absRefs = localImageRefs.map(r => this.resolvePath(r)).filter(Boolean) as string[];

            // 剥离 Markdown 图片语法以免送给大模型
            rawPrompt = rawPrompt.replace(/!\[.*?\]\(.*?\)/g, '');

            try {
                // 将形如 (@hero), @scene 展开为标准 Prompt 描述
                const refs = await this.refResolver.parseAll(rawPrompt);
                const expansion = await this.refResolver.expandRefsInText(rawPrompt, refs);
                rawPrompt = expansion.expandedText;
                // 将附件图合并到 job 的参考图中
                if (expansion.attachments.length > 0) {
                    absRefs.push(...expansion.attachments);
                }
            } catch (e) {
                logger.warn(`⚠️ Shot ${section.id}: 引用展开失败 - ${(e as Error).message}`);
            }

            const outputPath = path.join(circleDir, `${section.id}.mp4`);
            
            // 提取多模态引用（供将来使用）
            const mediaLinks = this.extractMediaLinks(section.originalBody);

            const payload: PromptPayload = {
                prompt: rawPrompt,
                global_settings: { aspect_ratio: ar, quality: res },
                camera: { motion: rawPrompt }, // 暂时保留，部分 API 可能单独需要
                duration: section.state.duration || '5s',
                frame_ref: {
                    first: absFirst || null,
                    last: absLast || null,
                },
                // 暂时利用 extra 字段塞入媒体引用
                extra: mediaLinks.length > 0 ? { media_refs: mediaLinks } : undefined
            };

            const job: Job = {
                id: section.id,
                type: 'video_generation',
                prompt_en: rawPrompt,
                payload,
                reference_images: absRefs.length > 0 
                    ? absRefs 
                    : [absFirst],
                output_path: outputPath,
            };
            jobs.push(job);
        }

        // ---- 写入队列 ----
        if (jobs.length > 0) {
            const jobsPath = path.join(circleDir, 'video_jobs.json');
            await fs.writeFile(
                jobsPath,
                JSON.stringify(jobs, null, 2)
            );
            logger.info(`✅ 编译 ${jobs.length} 个视频生成任务 → ${jobsPath}`);
        } else {
            logger.info(`ℹ️ 无需要生成的视频任务 (所有分镜非 pending 状态)`);
        }

        return jobs;
    }

    // ================================================================
    // Hybrid Shot Block 解析逻辑
    // ================================================================

    private parseShotSections(body: string) {
        const sections: { id: string; originalBody: string; textBody: string; state: any }[] = [];
        const shotRegex = /^##\s+Shot\s+(\d+)(?:\s*\((.*?)\))?/gm;
        const matches: { id: string; duration?: string; startIdx: number }[] = [];

        let match;
        while ((match = shotRegex.exec(body)) !== null) {
            matches.push({
                id: `shot_${match[1].padStart(2, '0')}`,
                duration: match[2],
                startIdx: match.index + match[0].length,
            });
        }

        for (let i = 0; i < matches.length; i++) {
            const start = matches[i].startIdx;
            const end = i + 1 < matches.length
                ? body.lastIndexOf('##', matches[i + 1].startIdx)
                : body.length;
            
            const shotBody = body.slice(start, end).trim();
            
            // 提取 YAML 状态块
            const yamlRegex = /```yaml\s*([\s\S]*?)\s*```/;
            const yamlMatch = shotBody.match(yamlRegex);
            
            let state: any = { status: 'unknown' };
            if (yamlMatch) {
                try {
                    state = yaml.load(yamlMatch[1]) || {};
                } catch (e) {
                    logger.error(`❌ 解析 Shot ${matches[i].id} 的 YAML 失败: ${(e as Error).message}`);
                }
            }
            
            // 默认继承标题上的时长
            if (!state.duration && matches[i].duration) {
                state.duration = matches[i].duration;
            }

            // 剥离 YAML 块，剩余的是纯文本编辑区
            const textBody = shotBody.replace(yamlRegex, '');

            sections.push({
                id: state.id || matches[i].id,
                originalBody: shotBody,
                textBody: textBody,
                state: state,
            });
        }

        return sections;
    }

    private cleanPromptText(text: string): string {
        let cleaned = text;

        // 1. 去除 `> [!note]` 以及紧跟在它里面的所有引用块内容
        // 这一段正则需要谨慎：匹配 > [!note] 直到非 > 开头的行
        const noteBlockRegex = /(?:^|\n)>\s*\[!note\][\s\S]*?(?=\n[^>]|$)/gi;
        cleaned = cleaned.replace(noteBlockRegex, '');

        // 2. 去除 Review 审查区的 HTML 块和占位文本
        const reviewRegex = /\[Review 审查区\][\s\S]*/i;
        cleaned = cleaned.replace(reviewRegex, '');

        // 3. 去除诸如 **Video Prompt:** / **Motion:** 这类副标题标签
        cleaned = cleaned.replace(/\*\*(?:Video Prompt|Motion|Prompt)[\s\S]*?\*\*/gi, '');

        // 4. 合并多余的回车与空格
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        return cleaned;
    }

    private extractLocalImages(text: string): string[] {
        // 从 Markdown 中提取所有图片 `![xxx](path)`
        const imgRegex = /!\[.*?\]\((.*?)\)/g;
        const matches: string[] = [];
        let m;
        while ((m = imgRegex.exec(text)) !== null) {
            matches.push(m[1]);
        }
        return matches;
    }

    private extractMediaLinks(text: string): string[] {
        // 从 originalBody 里面寻找 [audio](./xxx.mp3) 等
        const mdLinkRegex = /\[.*?\]\((.*?)\)/g;
        const extensions = ['.mp4', '.mp3', '.wav'];
        const matches: string[] = [];
        let m;
        while ((m = mdLinkRegex.exec(text)) !== null) {
            const ext = path.extname(m[1]).toLowerCase();
            if (extensions.includes(ext)) {
                matches.push(m[1]);
            }
        }
        return matches;
    }

    private resolvePath(p: string | null | undefined): string | null {
        if (!p || p.trim() === '') return null;
        if (p.startsWith('@FRAME:')) return p; // 帧指针
        // 如果已经是绝对路径，保持不变
        if (path.isAbsolute(p)) return p;
        // 支持 URL 这类
        if (p.startsWith('http://') || p.startsWith('https://')) return p;
        
        return path.resolve(this.projectRoot, 'videospec/shots', p);
    }

    /**
     * 自动推断依赖图的末端 Circle
     * 视频生成位于拓扑排序的最后一个 batch
     */
    private async resolveEndCircle(): Promise<string> {
        try {
            const graph = await DependencyGraph.buildFromProject(this.projectRoot);
            const { batches } = graph.topologicalSort();
            if (batches.length === 0) {
                return 'zerocircle_1';
            }
            const lastIdx = batches.length - 1;
            const circleWord = this.getCircleWord(lastIdx);
            return `${circleWord}_1`;
        } catch (e) {
            logger.warn(`⚠️ 依赖图分析失败，回退到 zerocircle_1: ${(e as Error).message}`);
            return 'zerocircle_1';
        }
    }

    private getCircleWord(index: number): string {
        const words = ['zerocircle', 'firstcircle', 'secondcircle', 'thirdcircle', 'fourthcircle', 'fifthcircle'];
        return words[index] || `circle_${index}`;
    }
}
