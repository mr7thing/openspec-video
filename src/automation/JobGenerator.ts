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

    async generateJobs(): Promise<Job[]> {
        await this.assetManager.loadAssets();
        const projectConfig = await this.specParser.parseProjectConfig();

        const scriptPath = path.join(this.projectRoot, 'videospec/stories/Script.md');
        if (!fs.existsSync(scriptPath)) {
            throw new Error("Script file not found matches default pattern.");
        }

        const content = fs.readFileSync(scriptPath, 'utf-8');
        const jobs: Job[] = [];

        // Simple regex-based parsing for demo purposes
        // Ideally this would use a robust Markdown parser
        const shotRegex = /## Shot (\d+)([\s\S]*?)(?=## Shot|$)/g;
        let match;

        while ((match = shotRegex.exec(content)) !== null) {
            const shotId = `shot_${match[1]}`;
            const shotBody = match[2];

            const job = this.parseShotToJob(shotId, shotBody, projectConfig);
            if (job) jobs.push(job);
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

    private parseShotToJob(id: string, body: string, config: any): Job | null {
        // Extract key fields
        const getValue = (key: string) => {
            const re = new RegExp(`\\*\\*${key}\\*\\*: (.*)`);
            const m = body.match(re);
            return m ? m[1].trim() : undefined;
        };

        const subjectRaw = getValue('Subject') || "";
        const environmentRaw = getValue('Environment') || "";
        const actionRaw = getValue('Action');
        const cameraRaw = getValue('Camera');

        // Detect Asset References [char_k]
        const assetRefs: string[] = [];
        let subjectDesc = subjectRaw;

        // Replace [id] with Name and collect assets
        // Regex to find [text]
        const refRegex = /\[(.*?)\]/g;
        let refMatch;

        // We intentionally iterate to process all refs in Subject line
        while ((refMatch = refRegex.exec(subjectRaw)) !== null) {
            const refId = refMatch[1];
            const char = this.assetManager.getCharacter(refId);
            if (char) {
                // Replace [char_k] with "Detective K (brown leather trench coat...)"
                subjectDesc = subjectDesc.replace(refMatch[0], `${char.name}`);
                if (char.reference_sheet) {
                    assetRefs.push(path.join(this.projectRoot, char.reference_sheet));
                }
            }

            const loc = this.assetManager.getScene(refId);
            if (loc) {
                subjectDesc = subjectDesc.replace(refMatch[0], `${loc.name}`);
            }
        }

        // Construct Payload
        const payload = {
            global_settings: {
                aspect_ratio: config.context.style.aspect_ratio || "16:9",
                quality: config.context.style.resolution || "4K"
            },
            subject: {
                description: subjectDesc,
                action: actionRaw
            },
            environment: {
                description: environmentRaw, // Note: Schema expects structured, we assume raw string for now or map it
                // For schema compliance, let's map string to details
                details: [environmentRaw]
            },
            camera: {
                motion: cameraRaw
            }
        };

        return {
            id,
            type: 'image_generation', // Default to image for now
            target_tool: 'nano_banana_pro',
            payload: payload as any, // Cast for simplicity in demo
            assets: assetRefs,
            output_path: path.join(this.projectRoot, 'artifacts', `${id}.png`)
        };
    }
}
