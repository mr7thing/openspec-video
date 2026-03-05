import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { AssetManager } from '../core/AssetManager';
import { SpecParser } from '../core/SpecParser';
import { ShotManager } from '../core/ShotManager';
import { AssetCompiler, CompiledIntent } from '../core/AssetCompiler';
import { Job, JobSchema } from '../types/PromptSchema';

export class JobGenerator {
    private projectRoot: string;
    private assetManager: AssetManager;
    private specParser: SpecParser;
    private assetCompiler: AssetCompiler;
    private jobCount: number = 0;

    constructor(projectRoot: string) {
        this.projectRoot = path.resolve(projectRoot);
        this.assetManager = new AssetManager(projectRoot);
        this.specParser = new SpecParser(projectRoot);
        this.assetCompiler = new AssetCompiler(projectRoot);
    }

    async generateJobs(targets: string[], options: { preview?: boolean, shots?: string[] } = {}): Promise<Job[]> {
        await this.assetManager.loadAssets();
        const projectConfig = await this.specParser.parseProjectConfig();
        const shotManager = new ShotManager(this.projectRoot);

        // Load 0.2 AssetCompiler and global configurations
        this.assetCompiler.loadProjectConfig();
        this.assetCompiler.indexAssets();
        this.jobCount = 0;

        let jobs: Job[] = [];

        // If no targets provided, default to scanning all normative folders
        if (!targets || targets.length === 0) {
            targets = [
                path.join(this.projectRoot, 'videospec/elements'),
                path.join(this.projectRoot, 'videospec/scenes'),
                path.join(this.projectRoot, 'videospec/shots'),
                path.join(this.projectRoot, 'artifacts/elements'),
                path.join(this.projectRoot, 'artifacts/scenes'),
                path.join(this.projectRoot, 'artifacts/shots')
            ];
        }

        for (const target of targets) {
            const targetPath = path.resolve(this.projectRoot, target);
            if (!fs.existsSync(targetPath)) {
                console.warn(`Warning: Target path not found: ${targetPath}`);
                continue;
            }

            const stats = fs.statSync(targetPath);
            if (stats.isDirectory()) {
                const files = fs.readdirSync(targetPath).filter(f => f.endsWith('.md'));
                for (const file of files) {
                    const filePath = path.join(targetPath, file);
                    const fileJobs = await this.processFile(filePath, projectConfig, options, shotManager);
                    jobs = jobs.concat(fileJobs);
                }
            } else if (stats.isFile() && targetPath.endsWith('.md')) {
                const fileJobs = await this.processFile(targetPath, projectConfig, options, shotManager);
                jobs = jobs.concat(fileJobs);
            }
        }

        // Save to queue
        const queueDir = path.join(this.projectRoot, 'queue');
        if (!fs.existsSync(queueDir)) fs.mkdirSync(queueDir);

        fs.writeFileSync(
            path.join(queueDir, 'jobs.json'),
            JSON.stringify(jobs, null, 2)
        );

        return jobs;
    }

    private async processFile(filePath: string, config: any, options: { preview?: boolean, shots?: string[] }, shotManager: ShotManager): Promise<Job[]> {
        const content = fs.readFileSync(filePath, 'utf-8');
        const fileName = path.basename(filePath);
        // Normalize slashes for robust path checking
        const normalizedPath = filePath.replace(/\\/g, '/');

        if (normalizedPath.includes('/elements/') || normalizedPath.includes('/scenes/')) {
            return this.processAssetFile(filePath, content, config);
        } else if (normalizedPath.includes('/shots/')) {
            return this.processShotFile(filePath, content, config, options, shotManager);
        }

        console.warn(`Warning: File ${fileName} is not in a normative directory (elements, scenes, shots). Skipping generation for this file.`);
        return [];
    }

    private async processAssetFile(filePath: string, content: string, config: any): Promise<Job[]> {
        const jobs: Job[] = [];

        // ---- Phase 1: Parse YAML frontmatter ----
        const parts = content.split(/^---$/m);
        if (parts.length < 3) return jobs;

        let frontmatter: any;
        try {
            const yaml = require('js-yaml');
            frontmatter = yaml.load(parts[1]);
        } catch { return jobs; }

        const id = frontmatter.name?.replace(/^@/, '') || path.parse(filePath).name;
        const name = frontmatter.name || id;
        const hasImage = frontmatter.has_image === true;

        // Read descriptions directly from YAML (no regex hacking)
        const detailedDesc = frontmatter.detailed_description || '';
        const briefDesc = frontmatter.brief_description || '';
        const promptEn = frontmatter.prompt_en || '';

        // Use brief desc if reference confirmed, otherwise detailed
        const description = hasImage ? briefDesc : detailedDesc;

        console.log(`  Found Asset: ${id} - ${name}`);

        // ---- Phase 2: Parse markdown body for payload sections ----
        const body = parts.slice(2).join('---');
        const subjectMatch = body.match(/^## subject\s*\n([\s\S]*?)(?=\n## |\n$)/im);
        const envMatch = body.match(/^## environment\s*\n([\s\S]*?)(?=\n## |\n$)/im);
        const cameraMatch = body.match(/^## camera\s*\n([\s\S]*?)(?=\n## |\n$)/im);

        const subjectDesc = subjectMatch ? subjectMatch[1].trim() : description;
        const envDesc = envMatch ? envMatch[1].trim() : '';
        const cameraDesc = cameraMatch ? cameraMatch[1].trim() : '';

        // ---- Phase 3: Extract reference images ----
        const referenceImages: string[] = [];
        const refImgMatch = body.match(/\[.*?\]\((.*?)\)/);
        if (refImgMatch && refImgMatch[1] && fs.existsSync(refImgMatch[1])) {
            referenceImages.push(refImgMatch[1]);
        }

        // ---- Phase 4: Build payload.prompt (中文叙事) ----
        const ar = config.context?.style?.aspect_ratio || "16:9";
        const res = config.context?.style?.resolution || "2K";

        let payloadPrompt = "";
        if (this.jobCount === 0) {
            const vision = this.assetCompiler.getProjectConfig().vision;
            if (vision) payloadPrompt += `${vision} `;
            payloadPrompt += `请帮我生成以下角色/物品设定图片：\n\n`;
        }
        this.jobCount++;
        payloadPrompt += description;

        if (referenceImages.length > 0) {
            payloadPrompt += `\n参考图：`;
            referenceImages.forEach((_, idx) => { payloadPrompt += `[image${idx + 1}] `; });
        }

        // ---- Phase 5: Assemble output path ----
        const outputDir = path.join(this.projectRoot, 'artifacts', 'drafts');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        let baseName = id;
        let ext = '.png';
        let finalOutputPath = path.join(outputDir, `${baseName}${ext}`);
        let counter = 1;
        while (fs.existsSync(finalOutputPath)) {
            finalOutputPath = path.join(outputDir, `${baseName}_${counter}${ext}`);
            counter++;
        }

        // ---- Phase 6: Build the Job object (dual-channel) ----
        const payload: any = {
            prompt: payloadPrompt,
            global_settings: { aspect_ratio: ar, quality: res },
            subject: { description: subjectDesc }
        };
        if (envDesc) payload.environment = { description: envDesc };
        if (cameraDesc) payload.camera = { type: cameraDesc };

        jobs.push({
            id,
            type: 'image_generation',
            prompt_en: promptEn || undefined,
            payload,
            reference_images: referenceImages.length > 0 ? referenceImages : undefined,
            output_path: finalOutputPath
        } as any);

        return jobs;
    }

    private async processShotFile(filePath: string, content: string, config: any, options: { preview?: boolean, shots?: string[] }, shotManager: ShotManager): Promise<Job[]> {
        const jobs: Job[] = [];

        const shotRegex = /\*\*Shot\s+(\d+)[^\*]*\*\*:\s*\[(.*?)\]([\s\S]*?)(?=\*\*Shot\s+\d+[^\*]*\*\*:|$)/gi;
        let match;
        let matchFound = false;

        while ((match = shotRegex.exec(content)) !== null) {
            matchFound = true;
            const shotNum = match[1];
            const shotId = `shot_${shotNum}`;

            let shouldGenerate = true;
            if (options.shots && options.shots.length > 0) {
                shouldGenerate = options.shots.includes(shotId) || options.shots.includes(shotNum);
            } else if (options.preview) {
                shouldGenerate = (shotNum === '1');
            }

            if (!shouldGenerate) continue;
            if (shotManager) shotManager.updateShotStatus(shotId, 'Draft');

            const location = match[2].trim();
            const shotBody = match[3].trim();

            const job = this.parseShotToJob(shotId, location, shotBody, config, null);
            if (job) jobs.push(job);
        }

        if (!matchFound) {
            // Support single plain markdown files as a single shot
            const shotId = path.parse(filePath).name;
            let shouldGenerate = true;
            if (options.shots && options.shots.length > 0) {
                shouldGenerate = options.shots.includes(shotId);
            }
            if (!shouldGenerate) return jobs;

            if (shotManager) shotManager.updateShotStatus(shotId, 'Draft');
            const job = this.parseShotToJob(shotId, 'Unknown Location', content, config, null);
            if (job) jobs.push(job);
        }

        return jobs;
    }

    private parseShotToJob(id: string, location: string, body: string, config: any, workflow?: any): Job | null {
        let subjectDesc = body;
        const assetRefs: string[] = [];
        const refRegex = /\[(.*?)\]/g;
        let refMatch;
        const refs = new Set<string>();

        while ((refMatch = refRegex.exec(body)) !== null) {
            refs.add(refMatch[1]);
        }

        for (const refId of refs) {
            // Check Elements (Characters/Props/Costumes)
            const char = this.assetManager.getElement(refId);
            if (char) {
                let foundRef = false;
                // 1. Look for Generated Concept Art (Highest Priority if use_references is true)
                if (workflow && workflow.use_references) {
                    const approvedRef = path.join(this.projectRoot, `videospec/elements/${char.id}_ref.png`);
                    if (fs.existsSync(approvedRef)) {
                        assetRefs.push(approvedRef);
                        foundRef = true;
                    } else {
                        const generatedRef = path.join(this.projectRoot, 'artifacts/elements', `${char.id}.png`);
                        if (fs.existsSync(generatedRef)) {
                            assetRefs.push(generatedRef);
                            foundRef = true;
                        }
                    }
                }

                if (foundRef) {
                    subjectDesc = subjectDesc.split(`[${refId}]`).join(`${char.name} [image${assetRefs.length}]`);
                } else {
                    subjectDesc = subjectDesc.split(`[${refId}]`).join(char.name);
                }
            }

            // Check Scenes
            const scene = this.assetManager.getScene(refId);
            if (scene) {
                let foundRef = false;
                if (workflow && workflow.use_references) {
                    const approvedRef = path.join(this.projectRoot, `videospec/scenes/${scene.id}_ref.png`);
                    if (fs.existsSync(approvedRef)) {
                        assetRefs.push(approvedRef);
                        foundRef = true;
                    } else {
                        const sceneRef = path.join(this.projectRoot, 'artifacts/scenes', `${scene.id}.png`);
                        if (fs.existsSync(sceneRef)) {
                            assetRefs.push(sceneRef);
                            foundRef = true;
                        }
                    }
                }

                if (foundRef) {
                    subjectDesc = subjectDesc.split(`[${refId}]`).join(`${scene.name} [image${assetRefs.length}]`);
                } else {
                    subjectDesc = subjectDesc.split(`[${refId}]`).join(scene.name);
                }
            }
        }

        // Support @Ref syntax (e.g. @Momo) without brackets
        const atRefs = body.match(/@(\w+)/g);
        if (atRefs) {
            for (const atRef of atRefs) {
                const name = atRef.substring(1);
                const id = name.toLowerCase();

                const char = this.assetManager.getElement(id);
                if (char) {
                    const approvedRef = path.join(this.projectRoot, `videospec/elements/${char.id}_ref.png`);
                    if (fs.existsSync(approvedRef)) assetRefs.push(approvedRef);
                }
                const scene = this.assetManager.getScene(id);
                if (scene) {
                    const approvedRef = path.join(this.projectRoot, `videospec/scenes/${scene.id}_ref.png`);
                    if (fs.existsSync(approvedRef)) assetRefs.push(approvedRef);
                }
            }
        }

        const cleanDesc = subjectDesc
            .replace(/\*Audio:.*?\*/g, '')
            .replace(/^## Act \d+.*$/gm, '')
            .replace(/^\*\(Lyrics:.*\)\*$/gm, '')
            .trim();

        const globalConfig = this.assetCompiler.getProjectConfig();
        const ar = globalConfig.aspect_ratio || config.context?.style?.aspect_ratio || "16:9";
        const res = globalConfig.resolution || config.context?.style?.resolution || "2K";

        let fullPrompt = "";

        if (this.jobCount === 0) {
            const vision = this.assetCompiler.getProjectConfig().vision;
            if (vision) {
                fullPrompt += `${vision} 请帮我生成MV的分镜图片，第一条需求如下：\n\n`;
            } else {
                fullPrompt += `请帮我生成MV的分镜图片，第一条需求如下：\n\n`;
            }
        }

        this.jobCount++;

        fullPrompt += `[视频分镜设定]
比例: ${ar} (分辨率: ${res})
运镜: ${body.match(/(Tracking Shot|Close(-|)Up|Wide Shot|Low Angle|High Angle|POV)/i)?.[0] || "标准"}
场景: ${location}
描述: ${cleanDesc}`;

        // Append 0.2 global style postfix if defined in project.md
        if (globalConfig.global_style_postfix) {
            fullPrompt += `\n全局风格: ${globalConfig.global_style_postfix}`;
        } else if (config.context?.style?.visual_style) {
            fullPrompt += `\n风格: ${config.context.style.visual_style}`;
        }


        const cameraMatch = body.match(/(Tracking Shot|Close(-|)Up|Wide Shot|Low Angle|High Angle|POV)/i)?.[0];
        const payload: any = {
            prompt: fullPrompt,
            global_settings: workflow?.settings || {
                aspect_ratio: config.context.style.aspect_ratio || "16:9",
                quality: config.context.style.resolution || "2K"
            },
            subject: { description: cleanDesc }
        };

        if (location && location !== 'Unknown Location') {
            payload.environment = { location: location, description: location };
        }

        if (cameraMatch) {
            payload.camera = { type: cameraMatch };
        }

        // Phase 6: Route all generation drafts to a unified folder to simplify extensions and integrations
        const artifactsDraftDir = path.join(this.projectRoot, 'artifacts/drafts');
        if (!fs.existsSync(artifactsDraftDir)) fs.mkdirSync(artifactsDraftDir, { recursive: true });

        // Non-destructive filename logic
        let baseName = id;
        let ext = '.png';
        let finalOutputPath = path.join(artifactsDraftDir, `${baseName}${ext}`);
        let counter = 1;
        while (fs.existsSync(finalOutputPath)) {
            finalOutputPath = path.join(artifactsDraftDir, `${baseName}_${counter}${ext}`);
            counter++;
        }

        // Save the generated prompt trace for reference
        const promptLogPath = path.join(artifactsDraftDir, `${baseName}_prompt.txt`);
        fs.writeFileSync(promptLogPath, fullPrompt);

        if (assetRefs.length === 0 && (refs.size > 0 || (atRefs && atRefs.length > 0))) {
            console.warn(`WARNING: Shot ${id} requested references but no approved / draft images were found.Generating blindly.`);
        }

        return {
            id,
            type: 'image_generation',
            payload: payload,
            reference_images: assetRefs, // Absolute paths array for Comfy UI
            output_path: finalOutputPath
        };
    }

    private extractAssetsFromMarkdown(content: string, baseDir: string): string[] {
        const assets: string[] = [];
        // Match ![alt](path)
        const regex = /!\[.*?\]\((.*?)\)/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            let relativePath = match[1];
            console.log(`Debug Asset: Found link ${relativePath} `);

            // Handle ./ manually if needed, but path.resolve handles it
            try {
                const absolutePath = path.resolve(baseDir, relativePath);
                console.log(`Debug Asset: Resolved to ${absolutePath} `);

                if (fs.existsSync(absolutePath)) {
                    // Convert back to project relative for consistency in jobs.json
                    const projectRelative = path.relative(this.projectRoot, absolutePath);
                    assets.push(projectRelative);
                    console.log(`Debug Asset: Added ${projectRelative} `);
                } else {
                    console.warn(`Warning: Asset file not found: ${absolutePath} `);
                }
            } catch (e) {
                console.warn(`Warning: Could not resolve asset path: ${relativePath} `);
            }
        }
        return assets;
    }
}
