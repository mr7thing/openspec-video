import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export class Reviewer {
    private projectRoot: string;

    constructor(projectRoot: string) {
        this.projectRoot = path.resolve(projectRoot);
    }

    public async reviewAll(options: { allDrafts?: boolean } = {}): Promise<void> {
        const targets = [
            path.join(this.projectRoot, 'videospec/elements'),
            path.join(this.projectRoot, 'videospec/scenes'),
            path.join(this.projectRoot, 'videospec/shots') // optional if shots have reviews
        ];

        let processedCount = 0;
        for (const target of targets) {
            if (!fs.existsSync(target)) continue;

            const stats = fs.statSync(target);
            if (stats.isDirectory()) {
                const files = fs.readdirSync(target).filter(f => f.endsWith('.md'));
                for (const file of files) {
                    const filePath = path.join(target, file);
                    await this.processFile(filePath, options.allDrafts);
                    processedCount++;
                }
            } else if (stats.isFile() && target.endsWith('.md')) {
                await this.processFile(target, options.allDrafts);
                processedCount++;
            }
        }
        console.log(`\nReview complete. Processed ${processedCount} markdown files.`);
        console.log(`Please open the markdown files in your editor to preview the generated drafts.`);
        console.log(`Delete the ![draft]() links of the images you do not want to keep.`);
    }

    public async reviewTarget(targetPath: string, options: { allDrafts?: boolean } = {}): Promise<void> {
        const fullPath = path.resolve(this.projectRoot, targetPath);
        if (!fs.existsSync(fullPath)) {
            console.error(`Error: File or directory not found: ${fullPath}`);
            return;
        }

        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
            const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.md'));
            for (const file of files) {
                await this.processFile(path.join(fullPath, file), options.allDrafts);
            }
        } else if (stats.isFile() && fullPath.endsWith('.md')) {
            await this.processFile(fullPath, options.allDrafts);
        } else {
            console.error(`Error: Target is not a markdown file or directory: ${fullPath}`);
        }
    }

    private async processFile(filePath: string, allDrafts: boolean = false): Promise<void> {
        let content = fs.readFileSync(filePath, 'utf-8');
        const fileName = path.basename(filePath);
        const parts = content.split(/^---$/m);

        if (parts.length < 3) return; // Not a valid frontmatter markdown file

        let frontmatter: any;
        try {
            frontmatter = yaml.load(parts[1]);
        } catch {
            return;
        }

        let bodyContent = parts.slice(2).join('---');

        // --- 1. LEGACY LINK FIXING ---
        let modified = false;
        // Fix markdown links that are missing the '!' prefix (e.g. [name](path) -> ![name](path))
        // But only if they link to .png/.jpg/.jpeg/.webp in our artifacts folders
        const legacyLinkRegex = /(?<!\!)\[(.*?)\]\((.*?artifacts[\\/].*?\.(?:png|jpg|jpeg|webp))\)/gi;
        if (legacyLinkRegex.test(bodyContent)) {
            bodyContent = bodyContent.replace(legacyLinkRegex, '![$1]($2)');
            modified = true;
            console.log(`  [Fix] Converted plain text links to image links in body of ${fileName}`);
        }

        // Convert backslashes to forward slashes inside image parentheses for better markdown preview compatibility
        const backslashRegex = /(!\[.*?\])\((.*?\\.*?)\)/g;
        if (backslashRegex.test(bodyContent)) {
            bodyContent = bodyContent.replace(backslashRegex, (match, p1, p2) => {
                return `${p1}(${p2.replace(/\\/g, '/')})`;
            });
            modified = true;
            console.log(`  [Fix] Normalized path slashes for image links in body of ${fileName}`);
        }

        // --- 2. EXTRACT IDs TO PROCESS ---
        const idsToProcess: { id: string, type: 'asset' | 'shot' }[] = [];

        if (frontmatter.shots && Array.isArray(frontmatter.shots)) {
            for (const shot of frontmatter.shots) {
                if (shot.id) idsToProcess.push({ id: shot.id, type: 'shot' });
            }
        } else {
            const id = frontmatter.name?.replace(/^@/, '') || path.parse(filePath).name;
            idsToProcess.push({ id, type: 'asset' });
        }

        // --- 3. PROCESS EACH ID ---
        for (const target of idsToProcess) {
            const drafts = this.findAllDrafts(target.id);
            if (drafts.length === 0) continue;

            const draftsToProcess = allDrafts ? drafts : [drafts[0]]; // index 0 is newest

            let appendedLinks = "";
            let linksAddedCount = 0;

            for (const draft of draftsToProcess) {
                const draftBasename = path.basename(draft.path);
                const draftDirName = path.basename(path.dirname(draft.path));

                // Just checking if "drafts_N/ID.png" exists in the text
                const searchStr = `${draftDirName}/${draftBasename}`;

                if (!bodyContent.includes(searchStr)) {
                    // Determine relative path from the markdown file to the image, ensure forward slashes
                    const relativePath = path.relative(path.dirname(filePath), draft.path).replace(/\\/g, '/');
                    appendedLinks += `\n![Draft ${draft.batchIndex}](${relativePath})`;
                    linksAddedCount++;
                    console.log(`  [Add] Attached reference image [Draft ${draft.batchIndex}] for ${target.id} in ${fileName}`);
                }
            }

            if (linksAddedCount > 0) {
                modified = true;

                if (target.type === 'asset') {
                    // Assets: Try to inject under "## 参考图"
                    const refHeaderRegex = /##\s*参考图\s*\n/i;
                    if (refHeaderRegex.test(bodyContent)) {
                        bodyContent = bodyContent.replace(refHeaderRegex, `$&${appendedLinks}\n`);
                    } else {
                        // Append to bottom if heading missing
                        bodyContent += `\n\n## 参考图\n${appendedLinks}\n`;
                    }
                } else if (target.type === 'shot') {
                    // Shots: Try to inject under the shot bullet point
                    const normalizedNum = target.id.replace(/shot_?/i, '');
                    const lines = bodyContent.split('\n');
                    let injected = false;
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (/^[-*#]/.test(line.trim()) && (line.toLowerCase().includes(`shot ${normalizedNum}`) || line.toLowerCase().includes(`shot_${normalizedNum}`))) {
                            // Inject below this line
                            lines.splice(i + 1, 0, `  ${appendedLinks.replace(/\n/g, '\n  ')}`);
                            bodyContent = lines.join('\n');
                            injected = true;
                            break;
                        }
                    }
                    if (!injected) {
                        bodyContent += `\n\n<!-- ${target.id} References -->${appendedLinks}\n`;
                    }
                }
            }
        }

        // --- 4. UPDATE FRONTMATTER IF NEEDED ---
        let finalContent = content; // fallback if modifying only the overall structure fails elsewhere
        if (modified) {
            if (filePath.includes('/elements/') || filePath.includes('/scenes/')) {
                if (frontmatter.has_image !== true) {
                    const hasAnyImgLink = /!\[.*?\]\(.*?\)/.test(bodyContent);
                    if (hasAnyImgLink) {
                        frontmatter.has_image = true;
                        console.log(`  [Update] Set has_image to true for ${fileName}`);
                    }
                }
            }
            const newFrontmatterStr = yaml.dump(frontmatter).trim();
            finalContent = `---\n${newFrontmatterStr}\n---${bodyContent}`;
            fs.writeFileSync(filePath, finalContent, 'utf-8');
        }
    }

    // Returns all matching drafts sorted from newest to oldest
    private findAllDrafts(baseName: string): { path: string, batchIndex: number }[] {
        const artifactsDir = path.join(this.projectRoot, 'artifacts');
        if (!fs.existsSync(artifactsDir)) return [];

        const folders = fs.readdirSync(artifactsDir)
            .filter(f => f.startsWith('drafts_'))
            .sort((a, b) => {
                const numA = parseInt(a.replace('drafts_', ''), 10);
                const numB = parseInt(b.replace('drafts_', ''), 10);
                return numB - numA; // Sort descending (newest first)
            });

        const foundDrafts = [];

        for (const folder of folders) {
            const batchIndex = parseInt(folder.replace('drafts_', ''), 10);
            const p = path.join(artifactsDir, folder, `${baseName}.png`);
            if (fs.existsSync(p)) {
                foundDrafts.push({ path: p, batchIndex });
            }
            // also look for ID_1, ID_2 etc.
            let counter = 1;
            while (true) {
                const pVariant = path.join(artifactsDir, folder, `${baseName}_${counter}.png`);
                if (fs.existsSync(pVariant)) {
                    foundDrafts.push({ path: pVariant, batchIndex });
                    counter++;
                } else {
                    break;
                }
            }
        }

        return foundDrafts;
    }
}
