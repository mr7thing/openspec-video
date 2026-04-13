import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';

export class Reviewer {
    private projectRoot: string;

    constructor(projectRoot: string) {
        this.projectRoot = path.resolve(projectRoot);
    }

    /**
     * Main entry point for global review
     */
    public async reviewAll(options: { allDrafts?: boolean } = {}): Promise<void> {
        const artifactsDir = path.join(this.projectRoot, 'artifacts');
        if (!fs.existsSync(artifactsDir)) {
             console.warn('No artifacts directory found. Nothing to review.');
             return;
        }

        if (options.allDrafts) {
            // --all mode: process all drafts_* folders
            const folders = fs.readdirSync(artifactsDir)
                .filter(f => f.startsWith('drafts_'))
                .sort((a, b) => {
                    const numA = parseInt(a.replace('drafts_', ''), 10);
                    const numB = parseInt(b.replace('drafts_', ''), 10);
                    return numA - numB; // Ascending for historical context
                });
            
            for (const folder of folders) {
                await this.reviewTarget(path.join('artifacts', folder));
            }
        } else {
            // Default: process only the latest drafts_N
            const latestFolder = this.getLatestDraftFolder();
            if (latestFolder) {
                await this.reviewTarget(path.join('artifacts', latestFolder));
            } else {
                console.warn('No drafts folders found.');
            }
        }

        // v0.5.13: 同步进行视频审查
        await this.reviewVideos();
    }

    /**
     * Review a specific directory or jobs.json file
     */
    public async reviewTarget(targetPath: string): Promise<void> {
        const fullPath = path.resolve(this.projectRoot, targetPath);
        if (!fs.existsSync(fullPath)) {
            console.error(`Error: Path not found: ${fullPath}`);
            return;
        }

        let jobsJsonPath = '';
        if (fs.statSync(fullPath).isDirectory()) {
            jobsJsonPath = path.join(fullPath, 'jobs.json');
        } else if (fullPath.endsWith('.json')) {
            jobsJsonPath = fullPath;
        }

        if (fs.existsSync(jobsJsonPath)) {
            console.log(`\n🔍 Reviewing via task manifest: ${path.relative(this.projectRoot, jobsJsonPath)}`);
            await this.processJobsJson(jobsJsonPath);
        } else {
            // Fallback for legacy or manual scanning (less common in 0.3.2)
            console.log(`\n📂 Scanning directory: ${path.relative(this.projectRoot, fullPath)}`);
            await this.legacyScanReview(fullPath);
        }
    }

    /**
     * Process based on jobs.json (Standard for 0.3.2)
     */
    private async processJobsJson(jsonPath: string): Promise<void> {
        let jobs: any[] = [];
        try {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            jobs = Array.isArray(data) ? data : (data.jobs || []);
        } catch (e) {
            console.error(`Failed to parse ${jsonPath}:`, e);
            return;
        }

        const draftDir = path.dirname(jsonPath);
        const mapDocToImages: Map<string, string[]> = new Map();

        for (const job of jobs) {
            if (job.outputPath && job.id) {
                const targetDoc = await this.findSourceDocForId(job.id);
                if (targetDoc) {
                    const images = mapDocToImages.get(targetDoc) || [];
                    images.push(job.outputPath);
                    mapDocToImages.set(targetDoc, images);
                }
            }
        }

        for (const [docPath, images] of mapDocToImages.entries()) {
            await this.updateDocument(docPath, images);
        }
    }

    private async findSourceDocForId(id: string): Promise<string | null> {
        // IDs can be shot_1, role_K, scene_bar, etc.
        const cleanId = id.replace(/_last$/, '').replace(/_draft$/, '');
        
        const searchPaths = [
            path.join(this.projectRoot, 'videospec/shots', 'Script.md'),
            path.join(this.projectRoot, 'videospec/elements', `${cleanId}.md`),
            path.join(this.projectRoot, 'videospec/scenes', `${cleanId}.md`),
            // Also check for shot specific files if they exist (though 0.3 prefers Script.md)
            path.join(this.projectRoot, 'videospec/shots', `${cleanId}.md`)
        ];

        for (const p of searchPaths) {
            if (fs.existsSync(p)) return p;
        }

        // Special case: if it's a shot, it's likely in Script.md
        if (id.startsWith('shot_') || id.startsWith('shot')) {
            const scriptPath = path.join(this.projectRoot, 'videospec/shots', 'Script.md');
            if (fs.existsSync(scriptPath)) return scriptPath;
        }

        return null;
    }

    private async updateDocument(docPath: string, newImages: string[]): Promise<void> {
        let content = fs.readFileSync(docPath, 'utf-8');
        const fileName = path.basename(docPath);
        let modified = false;

        // 1. Resolve @ references to markdown links
        const atRefRegex = /(?<!\[)@([a-zA-Z0-9_-]+)/g;
        if (atRefRegex.test(content)) {
            content = content.replace(atRefRegex, (match, entity) => {
                const entityPath = this.findEntityDoc(entity);
                if (entityPath) {
                    const rel = path.relative(path.dirname(docPath), entityPath).replace(/\\/g, '/');
                    return `[@${entity}](${rel})`;
                }
                return match;
            });
            modified = true;
        }

        // 2. Inject Images
        const docDir = path.dirname(docPath);
        
        for (const imgPath of newImages) {
            const relImgPath = path.relative(docDir, imgPath).replace(/\\/g, '/');
            const imgFileName = path.basename(imgPath);
            const isTarget = imgFileName.includes('_target_');
            const label = isTarget ? '🎯 定向补帧' : '🖼️ 草图';

            // Check if already in doc
            const searchStr = path.basename(imgPath);
            if (!content.includes(searchStr)) {
                // Determine insertion point
                if (fileName === 'Script.md') {
                    // Try to find the specific shot header
                    const shotId = path.basename(imgPath).split('_')[0] + '_' + path.basename(imgPath).split('_')[1]; // e.g. shot_1
                    const shotNum = shotId.replace(/shot_?/i, '');
                    
                    const headerRegex = new RegExp(`^#+\\s+Shot\\s+${shotNum}\\b`, 'im');
                    const match = content.match(headerRegex);
                    if (match) {
                        const index = match.index! + match[0].length;
                        content = content.slice(0, index) + `\n\n![${label}](${relImgPath})` + content.slice(index);
                    } else {
                        content += `\n\n### ${shotId} Review\n![${label}](${relImgPath})\n`;
                    }
                } else {
                    // Elements/Scenes: Insert under ## 参考图
                    const refHeaderRegex = /##\s*参考图\s*\n/i;
                    if (refHeaderRegex.test(content)) {
                        content = content.replace(refHeaderRegex, `$&![${label}](${relImgPath})\n`);
                    } else {
                        content += `\n\n## 参考图\n![${label}](${relImgPath})\n`;
                    }
                }
                modified = true;
                console.log(`  [Review] Attached ${imgFileName} to ${fileName}`);
            }
        }

        if (modified) {
            fs.writeFileSync(docPath, content, 'utf-8');
        }
    }

    private findEntityDoc(entity: string): string | null {
        const dirs = [
            path.join(this.projectRoot, 'videospec/elements'),
            path.join(this.projectRoot, 'videospec/scenes')
        ];
        for (const d of dirs) {
            const p = path.join(d, `${entity}.md`);
            if (fs.existsSync(p)) return p;
        }
        return null;
    }

    private getLatestDraftFolder(): string | null {
        const artifactsDir = path.join(this.projectRoot, 'artifacts');
        if (!fs.existsSync(artifactsDir)) return null;

        const folders = fs.readdirSync(artifactsDir)
            .filter(f => f.startsWith('drafts_'))
            .sort((a, b) => {
                const numA = parseInt(a.replace('drafts_', ''), 10);
                const numB = parseInt(b.replace('drafts_', ''), 10);
                return numB - numA;
            });
        
        return folders[0] || null;
    }

    /**
     * Legacy mode: scans directory for images by naming pattern
     */
    private async legacyScanReview(dirPath: string): Promise<void> {
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
        const mapDocToImages: Map<string, string[]> = new Map();

        for (const file of files) {
            const id = file.split('_')[0] + (file.includes('_draft') || file.includes('_target') ? '' : ''); 
            // This is messy in legacy, exactly why 0.3.2 uses JSON
            const shotMatch = file.match(/shot_(\d+)/i);
            const targetId = shotMatch ? shotMatch[0] : file.split('_')[0];

            const targetDoc = await this.findSourceDocForId(targetId);
            if (targetDoc) {
                const images = mapDocToImages.get(targetDoc) || [];
                images.push(path.join(dirPath, file));
                mapDocToImages.set(targetDoc, images);
            }
        }

        for (const [docPath, images] of mapDocToImages.entries()) {
            await this.updateDocument(docPath, images);
        }
    }

    /**
     * Scanner specifically for Video tracking in Shotlist (v0.5.13)
     */
    public async reviewVideos(): Promise<void> {
        const videosDir = path.join(this.projectRoot, 'artifacts', 'videos');
        if (!fs.existsSync(videosDir)) return;

        const shotlistPath = path.join(this.projectRoot, 'videospec/shots/Shotlist.md');
        if (!fs.existsSync(shotlistPath)) return;

        const files = fs.readdirSync(videosDir).filter(f => f.endsWith('.mp4'));
        if (files.length === 0) return;

        let content = fs.readFileSync(shotlistPath, 'utf-8');
        let modified = false;

        const docDir = path.dirname(shotlistPath);

        for (const file of files) {
            const shotMatch = file.match(/shot_(\d+)/i);
            if (!shotMatch) continue;
            
            const relVideoPath = path.relative(docDir, path.join(videosDir, file)).replace(/\\/g, '/');
            const targetId = `shot_${shotMatch[1]}`;

            // We must locate the corresponding ## Shot section and its YAML
            // Match pattern for the specific shot's YAML block
            const shotSectionRegex = new RegExp(`(##\\s+Shot\\s+0*${parseInt(shotMatch[1], 10)}\\b[\\s\\S]*?)(##\\s+Shot|$)`, 'i');
            const sectionMatch = content.match(shotSectionRegex);
            
            if (sectionMatch) {
                let sectionContent = sectionMatch[1];
                let changedSection = false;

                // 1. Update YAML block status to completed and set video_path
                const yamlRegex = /```yaml\s*([\s\S]*?)\s*```/;
                const yamlMatch = sectionContent.match(yamlRegex);
                if (yamlMatch) {
                    try {
                        const state = yaml.load(yamlMatch[1]) as Record<string, any> || {};
                        if (state.status !== 'completed' || state.video_path !== relVideoPath) {
                            state.status = 'completed';
                            state.video_path = relVideoPath;
                            
                            // Check if last_frame has been generated by video completion process
                            const expectedLastFrame = path.resolve(this.projectRoot, `artifacts/drafts_frame_cache/${targetId}_last.jpg`);
                            if (fs.existsSync(expectedLastFrame) && !state.last_frame) {
                                state.last_frame = path.relative(docDir, expectedLastFrame).replace(/\\/g, '/');
                            }
                            
                            const newYaml = yaml.dump(state, { indent: 2 }).trim();
                            sectionContent = sectionContent.replace(yamlMatch[0], `\`\`\`yaml\n${newYaml}\n\`\`\``);
                            changedSection = true;
                        }
                    } catch (err) {
                        console.error(`Failed to update YAML state for ${targetId}`);
                    }
                }

                // 2. Inject Markdown Link for Reviewers
                const reviewLinkStr = `[✅ 视频草案 (${file})](${relVideoPath})`;
                // If the link is not already there
                if (!sectionContent.includes(file) && !sectionContent.includes(reviewLinkStr)) {
                    const reviewAreaRegex = /\*\*\[Review 审查区\]\*\*[\s\S]*?(?=(?:##\s+Shot|$))/;
                    const reviewMatch = sectionContent.match(/\*\*\[Review 审查区\]\*\*/);
                    if (reviewMatch) {
                        // Append after the review marker
                        sectionContent = sectionContent.replace(/\*\*\[Review 审查区\]\*\*/, `**[Review 审查区]**\n> ${reviewLinkStr}`);
                        changedSection = true;
                    } else {
                        // fallback, append to end of section
                        sectionContent = sectionContent.trimEnd() + `\n\n**[Review 审查区]**\n> ${reviewLinkStr}\n\n`;
                        changedSection = true;
                    }
                }

                if (changedSection) {
                    content = content.replace(sectionMatch[1], sectionContent);
                    modified = true;
                    console.log(`  [Review] Link video ${file} to Shotlist.md and updated state.`);
                }
            }
        }

        if (modified) {
            fs.writeFileSync(shotlistPath, content, 'utf-8');
        }
    }
}
