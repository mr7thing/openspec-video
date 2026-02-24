import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { AssetManager } from '../core/AssetManager';
import { SpecParser } from '../core/SpecParser';
import { ShotManager } from '../core/ShotManager';
import { Job, JobSchema } from '../types/PromptSchema';

export class JobGenerator {
    private projectRoot: string;
    private assetManager: AssetManager;
    private specParser: SpecParser;

    constructor(projectRoot: string) {
        this.projectRoot = path.resolve(projectRoot);
        this.assetManager = new AssetManager(projectRoot);
        this.specParser = new SpecParser(projectRoot);
    }

    async generateJobs(targets: string[], options: { preview?: boolean, shots?: string[] } = {}): Promise<Job[]> {
        await this.assetManager.loadAssets();
        const projectConfig = await this.specParser.parseProjectConfig();
        const shotManager = new ShotManager(this.projectRoot);

        let jobs: Job[] = [];

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
        const dir = path.dirname(filePath);

        const idMatch = content.match(/id:\s*(["']?)(.*?)\1\s*$/m);
        const nameMatch = content.match(/name:\s*(["']?)(.*?)\1\s*$/m);

        if (idMatch && nameMatch) {
            const id = idMatch[2].trim();
            const name = nameMatch[2].trim();
            console.log(`  Found Asset: ${id} - ${name}`);

            const parts = content.split('---');
            const body = parts.length > 2 ? parts.slice(2).join('---').trim() : content;

            const assets = this.extractAssetsFromMarkdown(body, dir);

            let prompt = `**Task**: Generate Concept Art\n**Style**: ${config.context.style.visual_style}\n**Name**: ${name}\n**Description**:\n${body}`;

            if (assets.length > 0) {
                prompt += `\n\n**Reference Images**: ${assets.length} images provided. Please use them in order as visual references.`;
            }

            const outputDir = path.join(this.projectRoot, 'queue');
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

            jobs.push({
                id: `${id}`,
                type: 'image_generation',
                target_tool: 'nano_banana_pro',
                payload: {
                    prompt: prompt,
                    global_settings: { aspect_ratio: "16:9", quality: "2K" },
                    subject: { description: body },
                    environment: { details: [] },
                    camera: {}
                } as any,
                assets: assets,
                output_path: path.join(outputDir, `${id}.png`),
                _meta: {
                    project: config.project?.title || path.basename(this.projectRoot),
                    timestamp: new Date().toISOString(),
                    mode: 'Asset Generation'
                }
            } as any);
        }
        return jobs;
    }

    private async processShotFile(filePath: string, content: string, config: any, options: { preview?: boolean, shots?: string[] }, shotManager: ShotManager): Promise<Job[]> {
        const jobs: Job[] = [];

        const shotRegex = /\*\*Shot (\d+)\*\*: \[(.*?)\]([\s\S]*?)(?=\*\*Shot \d+\*\*:|$)/g;
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
                subjectDesc = subjectDesc.split(`[${refId}]`).join(char.name);

                // 1. Look for Generated Concept Art (Highest Priority if use_references is true)
                if (workflow && workflow.use_references) {
                    // Try to find APPROVED reference first (from videospec/elements/id_ref.png)
                    const approvedRef = path.join(this.projectRoot, `videospec/elements/${char.id}_ref.png`);

                    if (fs.existsSync(approvedRef)) {
                        assetRefs.push(path.relative(this.projectRoot, approvedRef));
                    } else {
                        // Fallback to Artifacts
                        const generatedRef = path.join(this.projectRoot, 'artifacts/elements', `${char.id}.png`);
                        if (fs.existsSync(generatedRef)) {
                            assetRefs.push(path.relative(this.projectRoot, generatedRef));
                        }
                    }
                }
            }

            // Check Scenes
            const scene = this.assetManager.getScene(refId);
            if (scene) {
                subjectDesc = subjectDesc.split(`[${refId}]`).join(scene.name);
                if (workflow && workflow.use_references) {
                    const approvedRef = path.join(this.projectRoot, `videospec/scenes/${scene.id}_ref.png`);
                    if (fs.existsSync(approvedRef)) {
                        assetRefs.push(path.relative(this.projectRoot, approvedRef));
                    } else {
                        const sceneRef = path.join(this.projectRoot, 'artifacts/scenes', `${scene.id}.png`);
                        if (fs.existsSync(sceneRef)) {
                            assetRefs.push(path.relative(this.projectRoot, sceneRef));
                        }
                    }
                }
            }
        }

        // Support @Ref syntax (e.g. @Momo)
        // Matches @Word
        const atRefs = body.match(/@(\w+)/g);
        if (atRefs) {
            for (const atRef of atRefs) {
                const name = atRef.substring(1); // Remove @
                // Try to find char/scene by Name (not ID)
                // AssetManager currently keyed by ID. We might need a loose lookup or convention ID=lower(name)
                const id = name.toLowerCase();

                // Reuse logic
                const char = this.assetManager.getElement(id);
                if (char) {
                    const approvedRef = path.join(this.projectRoot, `videospec/elements/${char.id}_ref.png`);
                    if (fs.existsSync(approvedRef)) assetRefs.push(path.relative(this.projectRoot, approvedRef));
                }
                const scene = this.assetManager.getScene(id);
                if (scene) {
                    const approvedRef = path.join(this.projectRoot, `videospec/scenes/${scene.id}_ref.png`);
                    if (fs.existsSync(approvedRef)) assetRefs.push(path.relative(this.projectRoot, approvedRef));
                }
            }
        }

        const cleanDesc = subjectDesc
            .replace(/\*Audio:.*?\*/g, '')
            .replace(/^## Act \d+.*$/gm, '')
            .replace(/^\*\(Lyrics:.*\)\*$/gm, '')
            .trim();

        const fullPrompt = `
    ** Task **: Generate an Image
        ** Style **: ${config.context.style.visual_style}
** Camera **: ${body.match(/(Tracking Shot|Close Up|Wide Shot)/i)?.[0] || "Cinematic"}
** Location **: ${location}

** Description **:
${cleanDesc}
`.trim();

        const payload = {
            prompt: fullPrompt,
            global_settings: workflow?.settings || {
                aspect_ratio: config.context.style.aspect_ratio || "16:9",
                quality: config.context.style.resolution || "2K"
            },
            subject: { description: subjectDesc },
            environment: { location: location, description: location, details: [] },
            camera: { type: body.match(/(Tracking Shot|Close Up|Wide Shot)/i)?.[0] || "Cinematic" }
        };

        // Phase 6: Route shot generations to artifacts directory first for user review
        const artifactsShotDir = path.join(this.projectRoot, 'artifacts/assets/shots', id);
        if (!fs.existsSync(artifactsShotDir)) fs.mkdirSync(artifactsShotDir, { recursive: true });

        // Save the generated prompt trace for reference
        const promptLogPath = path.join(artifactsShotDir, 'prompt.txt');
        fs.writeFileSync(promptLogPath, fullPrompt);

        if (assetRefs.length === 0 && (refs.size > 0 || (atRefs && atRefs.length > 0))) {
            console.warn(`WARNING: Shot ${id} requested references but no approved / draft images were found.Generating blindly.`);
        }

        return {
            id,
            type: 'image_generation',
            target_tool: 'nano_banana_pro',
            payload: payload as any,
            assets: assetRefs,
            output_path: path.join(artifactsShotDir, `${id}.png`),
            _meta: {
                project: config.project?.title || path.basename(this.projectRoot),
                timestamp: new Date().toISOString(),
                mode: 'Storyboard Resolution'
            }
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
