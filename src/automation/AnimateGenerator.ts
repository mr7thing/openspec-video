import fs from 'fs';
import path from 'path';
import { Job, PromptPayload } from '../types/PromptSchema';
import { AssetCompiler } from '../core/AssetCompiler';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { logger } from '../utils/logger';

// ============================================================================
// v0.5 视频编译管线
// 核心: 读 Shotlist.md (shot-production) → 生成 video_jobs.json
// 变更: schema_0_3 → frame_ref，删除 middle_image
// ============================================================================

export class AnimateGenerator {
    private projectRoot: string;
    private assetCompiler: AssetCompiler;

    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
        this.assetCompiler = new AssetCompiler(projectRoot);
    }

    async generateAnimationJobs(): Promise<Job[]> {
        const shotlistPath = path.join(this.projectRoot, 'videospec/shots/Shotlist.md');
        if (!fs.existsSync(shotlistPath)) {
            logger.error(`❌ 未找到 Shotlist.md: ${shotlistPath}`);
            logger.error(`   请先通过 opsv-animator agent 生成动态分镜表`);
            return [];
        }

        const content = fs.readFileSync(shotlistPath, 'utf-8');

        // ---- 解析 Shotlist.md ----
        let frontmatter: any;
        let body: string;
        try {
            const parsed = FrontmatterParser.parseRaw(content);
            frontmatter = parsed.frontmatter;
            body = parsed.body;
        } catch (e) {
            logger.error(`❌ Shotlist.md 解析失败: ${(e as Error).message}`);
            return [];
        }

        // v0.5: 从正文 ## Shot NN 解析 shotlist
        const shotSections = this.parseShotSections(body);
        if (shotSections.length === 0) {
            // 兼容 frontmatter shots[] 模式
            if (frontmatter.shots && Array.isArray(frontmatter.shots)) {
                return this.processLegacyShots(frontmatter.shots);
            }
            logger.error(`❌ Shotlist.md 中未找到 ## Shot NN 区域`);
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

        for (const section of shotSections) {
            // 从正文中提取 Markdown 链接 [首帧](path) [尾帧](path) 等
            const firstImage = this.extractLink(section.body, '首帧') || this.extractLink(section.body, 'first');
            const lastImage = this.extractLink(section.body, '尾帧') || this.extractLink(section.body, 'last');
            const referenceImages = this.extractAllLinks(section.body, '参考图');

            // 解析为绝对路径
            const absFirst = this.resolvePath(firstImage);
            const absLast = this.resolvePath(lastImage);
            const absRefs = referenceImages.map(r => this.resolvePath(r)).filter(Boolean) as string[];

            if (!absFirst) {
                logger.warn(`⚠️ Shot ${section.id}: 缺少首帧，跳过`);
                continue;
            }

            // 检查 @FRAME 指针
            if (absFirst && !absFirst.startsWith('@FRAME:') && !fs.existsSync(absFirst)) {
                logger.error(`❌ Shot ${section.id}: 首帧文件不存在 ${absFirst}，跳过`);
                continue;
            }

            // 提取动作描述
            const motionPrompt = this.extractMotionPrompt(section.body);
            const outputPath = path.join(videoOutDir, `${section.id}.mp4`);

            const payload: PromptPayload = {
                prompt: `[视频生成: ${section.id}]\n${motionPrompt}`,
                global_settings: { aspect_ratio: ar, quality: res },
                camera: { motion: motionPrompt },
                duration: section.duration || '5s',
                // v0.5: frame_ref 替代 schema_0_3
                frame_ref: {
                    first: absFirst || null,
                    last: absLast || null,
                },
            };

            const job: Job = {
                id: section.id,
                type: 'video_generation',
                prompt_en: motionPrompt,
                payload,
                reference_images: absRefs.length > 0
                    ? absRefs
                    : (absFirst ? [absFirst] : undefined),
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
            logger.info(`ℹ️ 无有效的视频生成任务`);
        }

        return jobs;
    }

    // ================================================================
    // 正文解析
    // ================================================================

    private parseShotSections(body: string): { id: string; body: string; duration?: string }[] {
        const sections: { id: string; body: string; duration?: string }[] = [];
        const shotRegex = /^##\s+Shot\s+(\d+)/gm;
        const matches: { id: string; startIdx: number }[] = [];

        let match;
        while ((match = shotRegex.exec(body)) !== null) {
            matches.push({
                id: `shot_${match[1].padStart(2, '0')}`,
                startIdx: match.index + match[0].length,
            });
        }

        for (let i = 0; i < matches.length; i++) {
            const start = matches[i].startIdx;
            const end = i + 1 < matches.length
                ? body.lastIndexOf('##', matches[i + 1].startIdx)
                : body.length;
            const shotBody = body.slice(start, end).trim();

            // 提取时长
            const durationMatch = shotBody.match(/时长[：:]\s*(\d+s?)/i)
                || shotBody.match(/duration[：:]\s*(\d+s?)/i);

            sections.push({
                id: matches[i].id,
                body: shotBody,
                duration: durationMatch?.[1],
            });
        }

        return sections;
    }

    private extractLink(body: string, label: string): string | null {
        const regex = new RegExp(`\\[${label}\\]\\(([^)]+)\\)`, 'i');
        const match = body.match(regex);
        return match ? match[1] : null;
    }

    private extractAllLinks(body: string, label: string): string[] {
        const regex = new RegExp(`\\[${label}[^\\]]*\\]\\(([^)]+)\\)`, 'gi');
        const results: string[] = [];
        let match;
        while ((match = regex.exec(body)) !== null) {
            results.push(match[1]);
        }
        return results;
    }

    private extractMotionPrompt(body: string): string {
        // 提取 Motion: 或 动作: 行
        const motionMatch = body.match(/(?:Motion|动作|运动)[：:]\s*(.+)/i);
        if (motionMatch) return motionMatch[1].trim();

        // 回退: 取第一段非链接文本
        const lines = body.split('\n').filter(l => {
            const t = l.trim();
            return t && !t.startsWith('[') && !t.startsWith('!') && !t.startsWith('#');
        });
        return lines[0]?.trim() || '';
    }

    private resolvePath(p: string | null): string | null {
        if (!p || p.trim() === '') return null;
        if (p.startsWith('@FRAME:')) return p; // 保留管线指针
        return path.resolve(this.projectRoot, p);
    }

    // ================================================================
    // Legacy: frontmatter shots[] 兼容（过渡期）
    // ================================================================

    private processLegacyShots(shots: any[]): Job[] {
        logger.warn('⚠️ 使用 frontmatter shots[] 数组模式（v0.5 建议迁移到正文 ## Shot NN）');

        this.assetCompiler.loadProjectConfig();
        const globalConfig = this.assetCompiler.getProjectConfig();
        const ar = globalConfig.aspect_ratio || '16:9';
        const res = globalConfig.resolution || '1920x1080';

        const videoOutDir = path.join(this.projectRoot, 'artifacts', 'videos');
        if (!fs.existsSync(videoOutDir)) fs.mkdirSync(videoOutDir, { recursive: true });

        const jobs: Job[] = [];

        for (const shot of shots) {
            if (!shot.id && !shot.shot) continue;
            const shotId = shot.id || `shot_${shot.shot}`;

            const absFirst = this.resolvePath(shot.first_image || shot.reference_image);
            const absLast = this.resolvePath(shot.last_image);

            if (!absFirst) continue;
            if (!absFirst.startsWith('@FRAME:') && !fs.existsSync(absFirst)) continue;

            const motionPrompt = shot.motion_prompt_en || '';

            const payload: PromptPayload = {
                prompt: `[视频生成: ${shotId}]\n${motionPrompt}`,
                global_settings: { aspect_ratio: ar, quality: res },
                camera: { motion: motionPrompt },
                duration: shot.duration || '5s',
                frame_ref: {
                    first: absFirst,
                    last: absLast || null,
                },
            };

            jobs.push({
                id: shotId,
                type: 'video_generation',
                prompt_en: motionPrompt,
                payload,
                reference_images: [absFirst!],
                output_path: path.join(videoOutDir, `${shotId}.mp4`),
            });
        }

        if (jobs.length > 0) {
            const queueDir = path.join(this.projectRoot, 'queue');
            if (!fs.existsSync(queueDir)) fs.mkdirSync(queueDir);
            fs.writeFileSync(path.join(queueDir, 'video_jobs.json'), JSON.stringify(jobs, null, 2));
            logger.info(`✅ 编译 ${jobs.length} 个视频任务 (legacy 模式)`);
        }

        return jobs;
    }
}
