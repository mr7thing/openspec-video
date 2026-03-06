import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Job } from '../types/PromptSchema';
import { AssetCompiler } from '../core/AssetCompiler';

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
            if (!shot.id) continue;

            const refImage = shot.reference_image;
            if (!refImage || refImage.trim() === "") {
                console.warn(`⚠️ Warning: Shot ${shot.id} is missing a reference_image. Skipping animation job.`);
                continue;
            }

            const absRefPath = path.resolve(path.dirname(shotlistPath), refImage);
            if (!fs.existsSync(absRefPath)) {
                console.error(`❌ Error: Reference image not found for ${shot.id} at ${absRefPath}. Skipping.`);
                continue;
            }

            const motionPrompt = shot.motion_prompt_en || '';
            if (motionPrompt.trim() === '') {
                console.warn(`⚠️ Warning: Shot ${shot.id} has an empty motion_prompt_en.`);
            }

            const payload = {
                prompt: `[视频动态生成: ${shot.id}]\nMotion: ${motionPrompt}`,
                global_settings: { aspect_ratio: ar, quality: res },
                camera: { motion: motionPrompt }
            };

            const outputPath = path.join(videoOutDir, `${shot.id}.mp4`);

            jobs.push({
                id: shot.id,
                type: 'video_generation',
                prompt_en: motionPrompt,
                payload: payload,
                reference_images: [absRefPath],
                output_path: outputPath
            });
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
