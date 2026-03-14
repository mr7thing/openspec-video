import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Job } from '../types/PromptSchema';
import { AssetCompiler } from '../core/AssetCompiler';

// 拓展原有的 Job 接口适配 0.3.2 的动态数据透传，或在此直接添加任何自定义 Payload 给下游使用


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
            console.error(`❌ Error: Shotlist.md not found at ${shotlistPath}`);
            console.error(`   Please run the opsv-animator agent first to generate dynamic shotlists.`);
            return [];
        }

        const content = fs.readFileSync(shotlistPath, 'utf-8');
        const parts = content.split(/^---$/m);

        if (parts.length < 3) {
            console.error('❌ Error: Shotlist.md is missing YAML frontmatter.');
            return [];
        }

        let frontmatter: any;
        try {
            frontmatter = yaml.load(parts[1]);
        } catch (e) {
            console.error(`❌ Error: Failed to parse YAML in Shotlist.md`, e);
            return [];
        }

        const shots = frontmatter.shots;
        if (!shots || !Array.isArray(shots)) {
            console.error(`❌ Error: No 'shots' array found in Shotlist.md frontmatter.`);
            return [];
        }

        // Load project config for resolutions/aspect ratios
        this.assetCompiler.loadProjectConfig();
        const globalConfig = this.assetCompiler.getProjectConfig();
        const ar = globalConfig.aspect_ratio || "16:9";
        const res = globalConfig.resolution || "2K";

        const jobs: Job[] = [];

        // Define an output directory for videos
        const videoOutDir = path.join(this.projectRoot, 'artifacts', 'videos');
        if (!fs.existsSync(videoOutDir)) {
            fs.mkdirSync(videoOutDir, { recursive: true });
        }

        for (const shot of shots) {
            if (!shot.id && !shot.shot) continue;

            // 兼容旧版 shot.id 或新版 shot: 1
            const shotId = shot.id || `shot_${shot.shot}`;

            // --- 0.3.2 Schema 解析图像锚点 ---
            const resolvePath = (p: string | undefined): string | undefined => {
                if (!p || p.trim() === "") return undefined;
                if (p.startsWith('@FRAME:')) return p; // Preserve pipeline pointer
                return path.resolve(this.projectRoot, p);
            };

            const absFirstImage = resolvePath(shot.first_image || shot.reference_image);
            const absMiddleImage = resolvePath(shot.middle_image);
            const absLastImage = resolvePath(shot.last_image);

            const referenceImages = Array.isArray(shot.reference_images)
                ? shot.reference_images.map(resolvePath).filter((p: string | undefined): p is string => !!p)
                : [];

            if (!absFirstImage) {
                console.warn(`⚠️ Warning: Shot ${shotId} is missing a first_image. Skipping animation job.`);
                continue;
            }

            if (!absFirstImage) {
                console.warn(`⚠️ Warning: Shot ${shotId} is missing a first_image. Skipping animation job.`);
                continue;
            }

            if (!absFirstImage.startsWith('@FRAME:') && !fs.existsSync(absFirstImage)) {
                console.error(`❌ Error: First image not found for ${shotId} at ${absFirstImage}. Skipping.`);
                continue;
            }

            // --- 0.3.2 Schema 解析文本 ---
            const motionPrompt = shot.motion_prompt_en || '';
            const motionPromptZh = shot.motion_prompt_zh || '';

            if (motionPrompt.trim() === '') {
                console.warn(`⚠️ Warning: Shot ${shotId} has an empty motion_prompt_en.`);
            }

            // duration
            const durationLiteral = shot.duration || '5s';

            const payload = {
                prompt: `[视频动态生成: ${shotId}]\n动作意图: ${motionPromptZh}\nMotion: ${motionPrompt}`,
                global_settings: { aspect_ratio: ar, quality: res },
                camera: { motion: motionPrompt },
                duration: durationLiteral, // 提供给下游 API
                schema_0_3_2: {
                    first_image: absFirstImage,
                    middle_image: absMiddleImage,
                    last_image: absLastImage,
                    reference_images: referenceImages
                },
                schema_0_3: { // Legacy Support
                    first_image: absFirstImage,
                    middle_image: absMiddleImage,
                    last_image: absLastImage,
                    reference_images: referenceImages
                }
            };

            const outputPath = path.join(videoOutDir, `${shotId}.mp4`);

            jobs.push({
                id: shotId,
                type: 'video_generation',
                prompt_en: motionPrompt,
                payload: payload,
                // 为了向后兼容，我们将最重要的 first_image 塞入老字段，让不支持 0.3+ 的老生态不报错
                reference_images: [absFirstImage]
                // 新的 API Client 应当越过 reference_images，直接去 payload.schema_0_3_2 里读取组装好的 0.3.2 绝对路径对象
            } as any); // 类型断言通过新增的冗余属性
        }

        if (jobs.length > 0) {
            const queueDir = path.join(this.projectRoot, 'queue');
            if (!fs.existsSync(queueDir)) fs.mkdirSync(queueDir);

            const outPath = path.join(queueDir, 'video_jobs.json');
            fs.writeFileSync(outPath, JSON.stringify(jobs, null, 2));
            console.log(`✅ successfully compiled ${jobs.length} video animation jobs to ${outPath}`);
        } else {
            console.log(`ℹ️ No valid video jobs to compile.`);
        }

        return jobs;
    }
}
