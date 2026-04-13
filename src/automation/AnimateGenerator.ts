import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Job, PromptPayload } from '../types/PromptSchema';
import { AssetCompiler } from '../core/AssetCompiler';
import { RefResolver } from '../core/RefResolver';
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
        this.refResolver = new RefResolver(projectRoot);
    }

    async generateAnimationJobs(): Promise<Job[]> {
        const shotlistPath = path.join(this.projectRoot, 'videospec/shots/Shotlist.md');
        if (!fs.existsSync(shotlistPath)) {
            logger.error(`❌ 未找到 Shotlist.md: ${shotlistPath}`);
            logger.error(`   请先通过 opsv-animator agent 生成动态分镜表`);
            return [];
        }

        const content = fs.readFileSync(shotlistPath, 'utf-8');

        // ---- 解析正文 ## Shot NN ----
        const shotSections = this.parseShotSections(content);
        if (shotSections.length === 0) {
            logger.error(`❌ Shotlist.md 中未找到有效的 ## Shot NN 区域或 YAML 状态块`);
            return [];
        }

        // ---- 加载全局配置 ----
        this.assetCompiler.loadProjectConfig();
        const globalConfig = this.assetCompiler.getProjectConfig();
        const ar = globalConfig.aspect_ratio || '16:9';
        const res = globalConfig.resolution || '1920x1080';

        // ---- 输出目录 ----
        const videoOutDir = path.join(this.projectRoot, 'artifacts', 'videos');
        if (!fs.existsSync(videoOutDir)) fs.mkdirSync(videoOutDir, { recursive: true });

        const jobs: Job[] = [];

        // 预加载资产图谱，用于解析 @ID
        await this.refResolver.buildGraph();

        for (const section of shotSections) {
            // 状态机拦截
            if (section.state.status !== 'pending' && section.state.status !== 'failed') {
                logger.info(`⏭️ 跳过 ${section.id} (状态: ${section.state.status})`);
                continue;
            }

            // 解析第一帧
            const firstImage = section.state.first_frame;
            const absFirst = this.resolvePath(firstImage);
            
            if (!absFirst) {
                logger.warn(`⚠️ Shot ${section.id}: 缺少 first_frame (首帧)，跳过`);
                continue;
            }

            // 检查 @FRAME 指针或实体文件
            if (absFirst && !absFirst.startsWith('@FRAME:') && !fs.existsSync(absFirst)) {
                logger.error(`❌ Shot ${section.id}: 首帧文件不存在 ${absFirst}，跳过`);
                continue;
            }

            // 获取最后一帧设置
            const absLast = this.resolvePath(section.state.last_frame);

            // 提取纯净的 Prompt 并展开 @ID
            let rawPrompt = this.cleanPromptText(section.textBody);
            
            // v0.5.13: 支持 Local Reference Images (和 JobGenerator 保持一致)
            const localImageRefs = this.extractLocalImages(rawPrompt);
            const absRefs = localImageRefs.map(r => this.resolvePath(r)).filter(Boolean) as string[];

            // 剥离 Markdown 图片语法以免送给大模型
            rawPrompt = rawPrompt.replace(/!\[.*?\]\(.*?\)/g, '');

            try {
                // 将形如 (@hero), @scene 展开为标准 Prompt 描述
                rawPrompt = await this.refResolver.expandRefsInText(rawPrompt);
            } catch (e) {
                logger.warn(`⚠️ Shot ${section.id}: 引用展开失败 - ${(e as Error).message}`);
            }

            const outputPath = path.join(videoOutDir, `${section.id}.mp4`);
            
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
                    : (absFirst && !absFirst.startsWith('@FRAME:') ? [absFirst] : undefined),
                output_path: outputPath,
            };
            jobs.push(job);
        }

        // ---- 写入队列 ----
        if (jobs.length > 0) {
            const queueDir = path.join(this.projectRoot, 'queue');
            if (!fs.existsSync(queueDir)) fs.mkdirSync(queueDir);

            fs.writeFileSync(
                path.join(queueDir, 'video_jobs.json'),
                JSON.stringify(jobs, null, 2)
            );
            logger.info(`✅ 编译 ${jobs.length} 个视频生成任务 → queue/video_jobs.json`);
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
}
