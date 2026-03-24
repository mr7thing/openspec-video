import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { AssetManager } from '../core/AssetManager';
import { SpecParser } from '../core/SpecParser';
import { ShotManager } from '../core/ShotManager';
import { AssetCompiler, CompiledIntent } from '../core/AssetCompiler';
import { Job, JobSchema, PromptPayload } from '../types/PromptSchema';
import { logger } from '../utils/logger';

export class JobGenerator {
    private projectRoot: string;
    private assetManager: AssetManager;
    private specParser: SpecParser;
    private assetCompiler: AssetCompiler;
    private jobCount: number = 0;
    private currentDraftDir: string = '';

    private findGeneratedRef(baseName: string): string | null {
        const artifactsDir = path.join(this.projectRoot, 'artifacts');
        if (!fs.existsSync(artifactsDir)) return null;

        const folders = fs.readdirSync(artifactsDir)
            .filter(f => f.startsWith('drafts_'))
            .sort((a, b) => {
                const numA = parseInt(a.replace('drafts_', ''), 10);
                const numB = parseInt(b.replace('drafts_', ''), 10);
                return numB - numA;
            });

        for (const folder of folders) {
            const p = path.join(artifactsDir, folder, `${baseName}.png`);
            if (fs.existsSync(p)) return p;
        }

        // Fallback
        const elemPath = path.join(artifactsDir, 'elements', `${baseName}.png`);
        if (fs.existsSync(elemPath)) return elemPath;

        const scenePath = path.join(artifactsDir, 'scenes', `${baseName}.png`);
        if (fs.existsSync(scenePath)) return scenePath;

        return null;
    }

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

        // Load 0.3.2 AssetCompiler and global configurations
        this.assetCompiler.loadProjectConfig();
        this.assetCompiler.indexAssets();
        this.jobCount = 0;

        let jobs: Job[] = [];

        // 1. Calculate dynamic batched drafts directory
        let batchIndex = 1;
        while (fs.existsSync(path.join(this.projectRoot, `artifacts/drafts_${batchIndex}`))) {
            batchIndex++;
        }
        this.currentDraftDir = path.join(this.projectRoot, `artifacts/drafts_${batchIndex}`);
        fs.mkdirSync(this.currentDraftDir, { recursive: true });

        // If no targets provided, default to scanning all normative folders
        if (!targets || targets.length === 0) {
            targets = [
                path.join(this.projectRoot, 'videospec/elements'),
                path.join(this.projectRoot, 'videospec/scenes'),
                path.join(this.projectRoot, 'videospec/shots')
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

        // Save to primary queue for daemon processing
        const queueDir = path.join(this.projectRoot, 'queue');
        if (!fs.existsSync(queueDir)) fs.mkdirSync(queueDir);

        fs.writeFileSync(
            path.join(queueDir, 'jobs.json'),
            JSON.stringify(jobs, null, 2)
        );

        // Save a historical backup to the specific batch directory for ComfyUI reuse
        fs.writeFileSync(
            path.join(this.currentDraftDir, 'jobs.json'),
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
        let promptEn = frontmatter.prompt_en || '';

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
        
        // Use AssetManager's parsed references if available
        const asset = this.assetManager.getElement(id) || this.assetManager.getScene(id);
        if (asset && asset.design_references && asset.design_references.length > 0) {
            referenceImages.push(...asset.design_references);
        } else if (asset && asset.reference_images && asset.reference_images.length > 0) {
            referenceImages.push(...asset.reference_images);
        } else {
            const refImgMatch = body.match(/\[.*?\]\((.*?)\)/);
            if (refImgMatch && refImgMatch[1]) {
                const absPath = path.resolve(path.dirname(filePath), refImgMatch[1]);
                if (fs.existsSync(absPath)) referenceImages.push(absPath);
            }
        }

        // ---- Phase 4: Build payload.prompt (中文叙事) ----
        const ar = config.context?.style?.aspect_ratio || "16:9";
        const res = config.context?.style?.resolution || "2K";

        const globalConfig = this.assetCompiler.getProjectConfig();
        const stylePostfix = globalConfig.global_style_postfix || config.context?.style?.visual_style;
        if (stylePostfix && promptEn) {
            promptEn = `${promptEn}, ${stylePostfix}`;
        }

        let payloadPrompt = "";
        if (this.jobCount === 0) {
            const vision = globalConfig.vision;
            if (vision) payloadPrompt += `${vision} `;
            payloadPrompt += `请帮我生成以下角色/物品设定图片：\n\n`;
        }
        this.jobCount++;
        payloadPrompt += `[角色/场景设定: @${id}]\n${description}`;

        if (referenceImages.length > 0) {
            payloadPrompt += `\n参考图：`;
            referenceImages.forEach((_, idx) => { payloadPrompt += `[image${idx + 1}] `; });
        }

        // ---- Phase 5: Assemble output path ----
        if (!this.currentDraftDir) {
            this.currentDraftDir = path.join(this.projectRoot, 'artifacts', 'drafts_1');
            if (!fs.existsSync(this.currentDraftDir)) fs.mkdirSync(this.currentDraftDir, { recursive: true });
        }
        const outputDir = this.currentDraftDir;

        let baseName = id;
        let ext = '.png';
        let finalOutputPath = path.join(outputDir, `${baseName}_draft_1${ext}`);
        let counter = 1;
        while (fs.existsSync(finalOutputPath)) {
            counter++;
            finalOutputPath = path.join(outputDir, `${baseName}_draft_${counter}${ext}`);
        }

        // ---- Phase 6: Build the Job object (dual-channel) ----
        const payload: PromptPayload = {
            prompt: payloadPrompt,
            global_settings: { aspect_ratio: ar, quality: res },
            subject: { description: subjectDesc }
        };
        if (envDesc) payload.environment = { description: envDesc };
        if (cameraDesc) payload.camera = { type: cameraDesc };

        const job: Job = {
            id,
            type: 'image_generation',
            prompt_en: promptEn || undefined,
            payload,
            reference_images: referenceImages.length > 0 ? referenceImages : undefined,
            output_path: finalOutputPath
        };
        jobs.push(job);

        return jobs;
    }

    private async processShotFile(filePath: string, content: string, config: any, options: { preview?: boolean, shots?: string[] }, shotManager: ShotManager): Promise<Job[]> {
        const jobs: Job[] = [];

        // ---- Phase 1: Parse YAML frontmatter ----
        const parts = content.split(/^---$/m);
        if (parts.length < 3) return jobs;

        let frontmatter: any;
        try {
            const yaml = require('js-yaml');
            frontmatter = yaml.load(parts[1]);
        } catch (e) {
            console.error(`  Failed to parse YAML in shot file: ${filePath}`);
            return jobs;
        }

        const shots = frontmatter.shots;
        if (!shots || !Array.isArray(shots)) {
            console.error(`  No 'shots' array found in YAML frontmatter for: ${filePath}`);
            return jobs;
        }

        // ---- Phase 2: Process each shot ----
        for (const shot of shots) {
            const shotId = shot.id;
            const shotNumStr = shotId.replace('shot_', '');

            let shouldGenerate = true;
            if (options.shots && options.shots.length > 0) {
                shouldGenerate = options.shots.includes(shotId) || options.shots.includes(shotNumStr);
            } else if (options.preview) {
                shouldGenerate = (shotNumStr === '1');
            }

            if (!shouldGenerate) continue;
            if (shotManager) shotManager.updateShotStatus(shotId, 'Draft');

            // Format location/environment
            const location = shot.environment ? shot.environment.trim() : 'Unknown Location';

            // Build the body description out of camera + subject + environment
            const cameraPart = shot.camera ? `Camera: ${shot.camera}\n` : '';
            const envPart = shot.environment ? `Environment: ${shot.environment}\n` : '';
            const subjectPart = shot.subject ? `Subject: ${shot.subject}` : '';
            const compiledBody = `${cameraPart}${envPart}${subjectPart}`.trim();

            // Extract the shot's approved reference image from the markdown body
            const shotRefs: string[] = [];
            // Regex matches ![...](...shotId.png) or ![...](...shotId_1.png)
            const shotImgRegex = new RegExp(`!\\[.*?\\]\\((.*?${shotId}(?:_\\d+)?\\.(?:png|jpg|jpeg|webp))\\)`, 'gi');
            let match;
            while ((match = shotImgRegex.exec(content)) !== null) {
                const relativePath = match[1];
                try {
                    const absPath = path.resolve(path.dirname(filePath), relativePath);
                    if (fs.existsSync(absPath)) {
                        shotRefs.push(absPath);
                    }
                } catch (e) { }
            }

            const job = this.parseShotToJob(
                shotId,
                location,
                compiledBody,
                config,
                null,
                shot.prompt_en,
                shotRefs
            );

            if (job) {
                jobs.push(job);

                // --- 0.3.2 Keyframe Resolution Protocol: 靶向生成 ---
                if (shot.target_last_prompt) {
                    const lastFrameJob = this.parseShotToJob(
                        `${shotId}_last`,
                        location,
                        `${compiledBody}\nLast Frame Target: ${shot.target_last_prompt}`,
                        config,
                        null,
                        shot.target_last_prompt,
                        shotRefs
                    );
                    if (lastFrameJob) jobs.push(lastFrameJob);
                }
            }
        }

        return jobs;
    }

    private parseShotToJob(id: string, location: string, body: string, config: any, workflow?: any, promptEn?: string, shotRefs: string[] = []): Job | null {
        let subjectDesc = body;
        const assetRefs: string[] = [...shotRefs];
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
                // 1. Look for Document-Driven References (Highest Priority)
                if (char.approved_references && char.approved_references.length > 0) {
                    assetRefs.push(char.approved_references[0]);
                    foundRef = true;
                } else if (char.reference_images && char.reference_images.length > 0) {
                    assetRefs.push(char.reference_images[0]); // Pick first registered reference
                    foundRef = true;
                } else {
                    const approvedRef = path.join(this.projectRoot, `videospec/elements/${char.id}_ref.png`);
                    if (fs.existsSync(approvedRef)) {
                        assetRefs.push(approvedRef);
                        foundRef = true;
                    } else {
                        const generatedRef = this.findGeneratedRef(char.id || '') || this.findGeneratedRef((char as any).name || '');
                        if (generatedRef) {
                            console.warn(`[WARN] Relying on unverified auto-fallback for @${char.id}. Please run 'opsv review' to append references to documentation.`);
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
                if (scene.approved_references && scene.approved_references.length > 0) {
                    assetRefs.push(scene.approved_references[0]);
                    foundRef = true;
                } else if (scene.reference_images && scene.reference_images.length > 0) {
                    assetRefs.push(scene.reference_images[0]);
                    foundRef = true;
                } else {
                    const approvedRef = path.join(this.projectRoot, `videospec/scenes/${scene.id}_ref.png`);
                    if (fs.existsSync(approvedRef)) {
                        assetRefs.push(approvedRef);
                        foundRef = true;
                    } else {
                        const sceneRef = this.findGeneratedRef(scene.id || '') || this.findGeneratedRef((scene as any).name || '');
                        if (sceneRef) {
                            console.warn(`[WARN] Relying on unverified auto-fallback for @${scene.id}. Please run 'opsv review' to append references to documentation.`);
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
        const atRefs = body.match(/@([a-zA-Z0-9_-]+)/g);
        if (atRefs) {
            for (const atRef of atRefs) {
                const name = atRef.substring(1);

                // Case-insensitive lookup
                let char = this.assetManager.getElement(name);
                if (!char) {
                    char = this.assetManager.getAllElements().find(e => e.id?.toLowerCase() === name.toLowerCase() || e.name?.toLowerCase() === name.toLowerCase());
                }

                if (char) {
                    let foundRef = false;
                    if (char.approved_references && char.approved_references.length > 0) {
                        assetRefs.push(char.approved_references[0]);
                        foundRef = true;
                    } else if (char.reference_images && char.reference_images.length > 0) {
                        assetRefs.push(char.reference_images[0]);
                        foundRef = true;
                    } else {
                        const approvedRef = path.join(this.projectRoot, `videospec/elements/${char.id}_ref.png`);
                        if (fs.existsSync(approvedRef)) {
                            assetRefs.push(approvedRef);
                            foundRef = true;
                        } else {
                            const generatedRef = this.findGeneratedRef(char.id || '') || this.findGeneratedRef(char.name || '');
                            if (generatedRef) {
                                console.warn(`[WARN] Relying on unverified auto-fallback for @${char.id}. Please run 'opsv review' to append references to documentation.`);
                                assetRefs.push(generatedRef);
                                foundRef = true;
                            }
                        }
                    }

                    const replacementText = foundRef ? `${char.name} [image${assetRefs.length}]` : char.name;
                    subjectDesc = subjectDesc.split(atRef).join(replacementText);
                    if (promptEn) promptEn = promptEn.split(atRef).join(char.name || name); // Strip @ for english prompt
                    continue; // Skip checking scenes if it's a character
                }

                let scene = this.assetManager.getScene(name);
                if (!scene) {
                    // We need a helper for getting all scenes, but since it's not exposed, 
                    // we'll try lowercase/uppercase fallback, or we can just hope ID matches.
                    scene = this.assetManager.getScene(name) || this.assetManager.getScene(name.charAt(0).toUpperCase() + name.slice(1));
                }

                if (scene) {
                    let foundRef = false;
                    if (scene.approved_references && scene.approved_references.length > 0) {
                        assetRefs.push(scene.approved_references[0]);
                        foundRef = true;
                    } else if (scene.reference_images && scene.reference_images.length > 0) {
                        assetRefs.push(scene.reference_images[0]);
                        foundRef = true;
                    } else {
                        const approvedRef = path.join(this.projectRoot, `videospec/scenes/${scene.id}_ref.png`);
                        if (fs.existsSync(approvedRef)) {
                            assetRefs.push(approvedRef);
                            foundRef = true;
                        } else {
                            const sceneRef = this.findGeneratedRef(scene.id || '') || this.findGeneratedRef(scene.name || '');
                            if (sceneRef) {
                                console.warn(`[WARN] Relying on unverified auto-fallback for @${scene.id}. Please run 'opsv review' to append references to documentation.`);
                                assetRefs.push(sceneRef);
                                foundRef = true;
                            }
                        }
                    }

                    const replacementText = foundRef ? `${scene.name} [image${assetRefs.length}]` : scene.name;
                    subjectDesc = subjectDesc.split(atRef).join(replacementText);
                    if (promptEn) promptEn = promptEn.split(atRef).join(scene.name || name);
                } else {
                    // Replace anyway to remove @ if not found
                    subjectDesc = subjectDesc.split(atRef).join(name);
                    if (promptEn) promptEn = promptEn.split(atRef).join(name);
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

        fullPrompt += `[视频分镜设定: ${id}]\n比例: ${ar} (分辨率: ${res})\n运镜: ${body.match(/(Tracking Shot|Close(-|)Up|Wide Shot|Low Angle|High Angle|POV)/i)?.[0] || "标准"}\n场景: ${location}\n描述: ${cleanDesc}`;

        const stylePostfix = globalConfig.global_style_postfix || config.context?.style?.visual_style;
        if (stylePostfix && promptEn) {
            promptEn = `${promptEn}, ${stylePostfix}`;
        }


        const cameraMatch = body.match(/(Tracking Shot|Close(-|)Up|Wide Shot|Low Angle|High Angle|POV)/i)?.[0];
        const payload: PromptPayload = {
            prompt: fullPrompt,
            global_settings: workflow?.settings || {
                aspect_ratio: config.context.style.aspect_ratio || "16:9",
                quality: config.context.style.resolution || "2K"
            },
            subject: { description: cleanDesc }
        };

        if (location && location !== 'Unknown Location') {
            payload.environment = { description: location };
        }

        if (cameraMatch) {
            payload.camera = { type: cameraMatch };
        }

        // Phase 6: Route all generation drafts to a unified folder to simplify extensions and integrations
        if (!this.currentDraftDir) {
            this.currentDraftDir = path.join(this.projectRoot, 'artifacts', 'drafts_1');
            if (!fs.existsSync(this.currentDraftDir)) fs.mkdirSync(this.currentDraftDir, { recursive: true });
        }
        const artifactsDraftDir = this.currentDraftDir;

        // Non-destructive filename logic
        // 0.3.2 统一使用 draft 后缀，除非是明确的 target 补帧
        const isTargetLast = id.endsWith('_last');
        const namingBase = isTargetLast ? id.replace('_last', '_target_last') : `${id}_draft`;

        let ext = '.png';
        let finalOutputPath = path.join(artifactsDraftDir, `${namingBase}_1${ext}`);
        let counter = 1;
        while (fs.existsSync(finalOutputPath)) {
            counter++;
            finalOutputPath = path.join(artifactsDraftDir, `${namingBase}_${counter}${ext}`);
        }

        // Save the generated prompt trace for reference
        const promptLogPath = path.join(artifactsDraftDir, `${namingBase}_prompt.txt`);
        fs.writeFileSync(promptLogPath, fullPrompt);

        if (assetRefs.length === 0 && (refs.size > 0 || (atRefs && atRefs.length > 0))) {
            console.warn(`WARNING: Shot ${id} requested references but no approved / draft images were found.Generating blindly.`);
        }

        const job: Job = {
            id,
            type: 'image_generation',
            prompt_en: promptEn || undefined,
            payload: payload,
            reference_images: assetRefs, // Absolute paths array for Comfy UI
            output_path: finalOutputPath
        };
        return job;
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
