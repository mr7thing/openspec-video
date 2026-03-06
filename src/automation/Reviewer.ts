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
        const content = fs.readFileSync(filePath, 'utf-8');
        const fileName = path.basename(filePath);
        const parts = content.split(/^---$/m);

        if (parts.length < 3) return; // Not a valid frontmatter markdown file

        let frontmatter: any;
        try {
            frontmatter = yaml.load(parts[1]);
        } catch {
            return;
        }

        const id = frontmatter.name?.replace(/^@/, '') || path.parse(filePath).name;
        const bodyContent = parts.slice(2).join('---');

        // Find reference drafts
        const drafts = this.findAllDrafts(id);
        if (drafts.length === 0) return;

        let newContent = content;
        let modified = false;

        const draftsToProcess = allDrafts ? drafts : [drafts[0]]; // index 0 is the newest due to sorting

        let appendedLinks = "";

        for (const draft of draftsToProcess) {
            // Check if this specific draft is already in the file
            // Make the check robust against relative path resolutions
            const draftBasename = path.basename(draft.path);
            const draftDirName = path.basename(path.dirname(draft.path));

            // Just checking if "drafts_N/ID.png" exists in the text
            const searchStr = `${draftDirName}/${draftBasename}`;

            if (!content.includes(searchStr)) {
                // Determine relative path from the markdown file to the image
                const relativePath = path.relative(path.dirname(filePath), draft.path).replace(/\\/g, '/');
                appendedLinks += `\n\n![Draft ${draft.batchIndex}](${relativePath})`;
                modified = true;
                console.log(`  Added reference image [Draft ${draft.batchIndex}] to ${fileName}`);
            }
        }

        if (modified) {
            newContent += appendedLinks;

            // Update has_image in frontmatter if it's an element/scene
            if (filePath.includes('/elements/') || filePath.includes('/scenes/')) {
                if (frontmatter.has_image !== true) {
                    frontmatter.has_image = true;
                    // Reconstruct content
                    console.log(`  Set has_image to true for ${fileName}`);

                    const newFrontmatterStr = yaml.dump(frontmatter).trim();
                    newContent = `---\n${newFrontmatterStr}\n---${newContent.substring(parts[0].length + parts[1].length + 6)}`;
                }
            }

            fs.writeFileSync(filePath, newContent, 'utf-8');
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
