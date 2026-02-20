import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { AssetManager } from '../core/AssetManager';
import { SpecParser } from '../core/SpecParser';
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

    async generateJobs(mode: string = 'story', options: { preview?: boolean, shots?: string[] } = {}): Promise<Job[]> {
        await this.assetManager.loadAssets();
        const projectConfig = await this.specParser.parseProjectConfig();

        // Load Workflow Config
        const workflowPath = path.join(this.projectRoot, 'videospec/workflow.json');
        let workflows: any = {};

        if (fs.existsSync(workflowPath)) {
            try {
                const wfConfig = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
                workflows = wfConfig.workflows || {};
                console.log("DEBUG: Loaded workflow.json");
            } catch (e) {
                console.error("Failed to parse workflow.json", e);
            }
        }

        // Fallback or override logic if config missing
        const activeWorkflow = workflows[mode];
        if (!activeWorkflow) {
            console.warn(`Workflow mode '${mode}' not found in workflow.json. Falling back to default story mode.`);
            if (mode === 'story') return this.generateStory(projectConfig, {}, options);
            return [];
        }

        console.log(`Executing workflow: ${mode} (${activeWorkflow.type})`);

        let jobs: Job[] = [];
        if (activeWorkflow.type === 'asset_batch') {
            jobs = await this.generateBatchAssets(activeWorkflow, projectConfig);
        } else if (activeWorkflow.type === 'storyboard') {
            jobs = await this.generateStory(projectConfig, activeWorkflow, options);
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

    private async generateBatchAssets(workflow: any, config: any): Promise<Job[]> {
        // glob pattern matching (basic simulation)
        // expects source like "videospec/assets/characters/*.md"
        const sourcePattern = workflow.source;
        // Simple directory resolution 
        const relDir = path.dirname(sourcePattern);
        const dir = path.resolve(this.projectRoot, relDir);

        if (!fs.existsSync(dir)) {
            console.warn(`Workflow source directory not found: ${dir}`);
            return [];
        }

        const allFiles = fs.readdirSync(dir);
        const files = allFiles.filter(f => f.endsWith('.md'));

        const jobs: Job[] = [];

        for (const file of files) {
            const filePath = path.join(dir, file);
            const content = fs.readFileSync(filePath, 'utf-8');

            console.log(`Processing file: ${file}`);

            // Extract Metadata - Support quotes or no quotes
            // Match id: value until end of line, trimming quotes
            const idMatch = content.match(/id:\s*(["']?)(.*?)\1\s*$/m);
            const nameMatch = content.match(/name:\s*(["']?)(.*?)\1\s*$/m);

            if (idMatch && nameMatch) {
                const id = idMatch[2].trim();
                const name = nameMatch[2].trim();
                console.log(`  Found Asset: ${id} - ${name}`);

                // Robust body extraction (everything after frontmatter)
                const parts = content.split('---');
                const body = parts.length > 2 ? parts.slice(2).join('---').trim() : content;

                // Extract Assets from Markdown
                const assets = this.extractAssetsFromMarkdown(body, dir);

                // Template Replacement
                let prompt = workflow.prompt_template
                    .replace('${style}', config.context.style.visual_style)
                    .replace('${name}', name)
                    .replace('${description}', body);

                // Add asset hints to prompt if needed
                if (assets.length > 0) {
                    prompt += `\n\n**Reference Images**: ${assets.length} images provided. Please use them in order as visual references.`;
                }

                // Resolve Output Path (Ensure dir exists)
                const outputDir = path.join(this.projectRoot, workflow.output_dir || 'queue');
                if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

                jobs.push({
                    id: `${id}`,
                    type: 'image_generation',
                    target_tool: 'nano_banana_pro',
                    payload: {
                        prompt: prompt,
                        global_settings: workflow.settings || { aspect_ratio: "1:1", quality: "4K" },
                        subject: { description: body }, // Fill required fields with dummy data
                        environment: { details: [] },
                        camera: {}
                    } as any, // Cast to avoid strict schema check on partials if strictly typed
                    assets: assets,
                    output_path: path.join(outputDir, `${id}.png`)
                });
            }
        }
        return jobs;
    }

    private async generateStory(config: any, workflow?: any, options: { preview?: boolean, shots?: string[] } = {}): Promise<Job[]> {
        const scriptPath = path.join(this.projectRoot, 'videospec/stories/Script.md');
        if (!fs.existsSync(scriptPath)) {
            throw new Error("Script file not found.");
        }

        const content = fs.readFileSync(scriptPath, 'utf-8');
        const jobs: Job[] = [];

        // Manual Filtering (Agent Driven)
        // If options.shots is passed (e.g. from CLI --shots "1,5"), use that.
        // If --preview is passed, default to first shot of each act (Agent can override this logic via Skill).

        const shotRegex = /\*\*Shot (\d+)\*\*: \[(.*?)\]([\s\S]*?)(?=\*\*Shot \d+\*\*:|$)/g;
        let match;

        while ((match = shotRegex.exec(content)) !== null) {
            const shotNum = match[1];
            const shotId = `shot_${shotNum}`;

            let shouldGenerate = true;

            if (options.shots && options.shots.length > 0) {
                // Strict check: Must match ID or Number
                shouldGenerate = options.shots.includes(shotId) || options.shots.includes(shotNum);
            } else if (options.preview) {
                // Heuristic Preview: Just Shot 1
                shouldGenerate = (shotNum === '1');
            }

            if (!shouldGenerate) continue;

            const location = match[2].trim();
            const shotBody = match[3].trim();

            const job = this.parseShotToJob(shotId, location, shotBody, config, workflow);
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
            // Check Characters
            const char = this.assetManager.getCharacter(refId);
            if (char) {
                subjectDesc = subjectDesc.split(`[${refId}]`).join(char.name);

                // 1. Look for Generated Concept Art (Highest Priority if use_references is true)
                if (workflow && workflow.use_references) {
                    // Try to find APPROVED reference first (from assets/characters/id_ref.png)
                    const approvedRef = path.join(this.projectRoot, `videospec/assets/characters/${char.id}_ref.png`);

                    if (fs.existsSync(approvedRef)) {
                        assetRefs.push(path.relative(this.projectRoot, approvedRef));
                    } else {
                        // Fallback to Artifacts
                        const generatedRef = path.join(this.projectRoot, 'Project-mv/artifacts/characters', `${char.id}.png`);
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
                    const approvedRef = path.join(this.projectRoot, `videospec/assets/scenes/${scene.id}_ref.png`);
                    if (fs.existsSync(approvedRef)) {
                        assetRefs.push(path.relative(this.projectRoot, approvedRef));
                    } else {
                        const sceneRef = path.join(this.projectRoot, 'Project-mv/artifacts/scenes', `${scene.id}.png`);
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
                const char = this.assetManager.getCharacter(id);
                if (char) {
                    const approvedRef = path.join(this.projectRoot, `videospec/assets/characters/${char.id}_ref.png`);
                    if (fs.existsSync(approvedRef)) assetRefs.push(path.relative(this.projectRoot, approvedRef));
                }
                const scene = this.assetManager.getScene(id);
                if (scene) {
                    const approvedRef = path.join(this.projectRoot, `videospec/assets/scenes/${scene.id}_ref.png`);
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
**Task**: Generate an Image
**Style**: ${config.context.style.visual_style}
**Camera**: ${body.match(/(Tracking Shot|Close Up|Wide Shot)/i)?.[0] || "Cinematic"}
**Location**: ${location}

**Description**:
${cleanDesc}
`.trim();

        const payload = {
            prompt: fullPrompt,
            global_settings: workflow?.settings || {
                aspect_ratio: config.context.style.aspect_ratio || "16:9",
                quality: config.context.style.resolution || "4K"
            },
            subject: { description: subjectDesc },
            environment: { location: location, description: location, details: [] },
            camera: { type: body.match(/(Tracking Shot|Close Up|Wide Shot)/i)?.[0] || "Cinematic" }
        };

        const outputDir = path.join(this.projectRoot, workflow?.output_dir || 'queue');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        return {
            id,
            type: 'image_generation',
            target_tool: 'nano_banana_pro',
            payload: payload as any,
            assets: assetRefs,
            output_path: path.join(outputDir, `${id}.png`)
        };
    }

    private extractAssetsFromMarkdown(content: string, baseDir: string): string[] {
        const assets: string[] = [];
        // Match ![alt](path)
        const regex = /!\[.*?\]\((.*?)\)/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            let relativePath = match[1];
            console.log(`Debug Asset: Found link ${relativePath}`);

            // Handle ./ manually if needed, but path.resolve handles it
            try {
                const absolutePath = path.resolve(baseDir, relativePath);
                console.log(`Debug Asset: Resolved to ${absolutePath}`);

                if (fs.existsSync(absolutePath)) {
                    // Convert back to project relative for consistency in jobs.json
                    const projectRelative = path.relative(this.projectRoot, absolutePath);
                    assets.push(projectRelative);
                    console.log(`Debug Asset: Added ${projectRelative}`);
                } else {
                    console.warn(`Warning: Asset file not found: ${absolutePath}`);
                }
            } catch (e) {
                console.warn(`Warning: Could not resolve asset path: ${relativePath}`);
            }
        }
        return assets;
    }
}
