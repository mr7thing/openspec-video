import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';

export class Reviewer {
    private projectRoot: string;

    constructor(projectRoot: string) {
        this.projectRoot = path.resolve(projectRoot);
    }

    async review(type: string) {
        // Validate Type
        const validTypes = ['characters', 'scenes'];
        if (!validTypes.includes(type)) {
            console.error(`Invalid review type '${type}'. Valid options: ${validTypes.join(', ')}`);
            return;
        }

        const artifactsDir = path.join(this.projectRoot, 'Project-mv/artifacts', type);
        const assetsDir = path.join(this.projectRoot, 'videospec/assets', type);

        if (!fs.existsSync(artifactsDir)) {
            console.error(`Artifacts directory not found: ${artifactsDir}`);
            console.error('Have you run `opsv generate` yet?');
            return;
        }

        const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.png'));

        if (files.length === 0) {
            console.log(`No artifacts found to review in ${artifactsDir}`);
            return;
        }

        console.log(`Found ${files.length} artifacts to review.`);

        for (const file of files) {
            const artifactPath = path.join(artifactsDir, file);
            const assetName = path.basename(file, '.png'); // Assuming id.png matches id.md

            // Try to find matching MD file to get human readable name
            // This is a naive lookup, assuming file name matches ID. 
            // In JobGenerator we use IDs for filenames, so this should hold.

            console.log(`\n----------------------------------------`);
            console.log(`Reviewing: ${file}`);
            console.log(`Path: ${artifactPath}`);

            const answers = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'action',
                    message: 'What do you want to do with this image?',
                    choices: [
                        { name: '✅ Approve (Move to Assets & Link)', value: 'approve' },
                        { name: '❌ Discard (Delete)', value: 'discard' },
                        { name: '⏭️  Skip', value: 'skip' }
                    ]
                }
            ]);

            if (answers.action === 'approve') {
                await this.approveArtifact(artifactPath, type, assetName);
            } else if (answers.action === 'discard') {
                fs.unlinkSync(artifactPath);
                console.log(`Deleted ${file}`);
            } else {
                console.log('Skipped.');
            }
        }
    }

    private async approveArtifact(artifactPath: string, type: string, assetId: string) {
        const assetsBaseDir = path.join(this.projectRoot, 'videospec/assets', type);

        // 1. Find the markdown file
        // We have to scan because filename might not strictly match ID if user renamed things, 
        // but for now let's assume we can search by ID in content or filename.
        // Let's rely on the convention that we generated the artifact FROM the asset, 
        // implies we can look up the asset by the ID used to generate filename.

        // Naive 1: Look for id.md
        let mdPath = path.join(assetsBaseDir, `${assetId}.md`);

        // Naive 2: If not found, scan all MDs for `id: "assetId"`
        if (!fs.existsSync(mdPath)) {
            const files = fs.readdirSync(assetsBaseDir).filter(f => f.endsWith('.md'));
            for (const f of files) {
                const p = path.join(assetsBaseDir, f);
                const content = fs.readFileSync(p, 'utf-8');
                if (content.includes(`id: "${assetId}"`) || content.includes(`id: ${assetId}`)) {
                    mdPath = p;
                    break;
                }
            }
        }

        if (!fs.existsSync(mdPath)) {
            console.error(`❌ Could not find matching asset definition for ID: ${assetId}`);
            console.log(`Artifact kept at: ${artifactPath}`);
            return;
        }

        // 2. Move File
        const targetFileName = `${assetId}_ref.png`; // Canonical reference name
        const targetPath = path.join(assetsBaseDir, targetFileName);

        // Ensure we don't overwrite blindly without asking? Or just overwrite is fine for "Update"?
        // Let's overwrite for now as "Approve" implies latest valid state.
        fs.moveSync(artifactPath, targetPath, { overwrite: true });
        console.log(`✅ Moved image to: ${targetPath}`);

        // 3. Update Markdown
        let content = fs.readFileSync(mdPath, 'utf-8');

        // Check if link already exists
        const linkRegex = /!\[.*?\]\((.*?)\)/;

        if (linkRegex.test(content)) {
            // Update existing link
            // We want to replace the FIRST image link found? Or specific one?
            // Usually the first image is the reference.
            content = content.replace(linkRegex, `![Reference](./${targetFileName})`);
            console.log(`🔄 Updated existing reference link in ${path.basename(mdPath)}`);
        } else {
            // Insert new link after Frontmatter
            const parts = content.split('---');
            if (parts.length >= 3) {
                // Insert after second ---
                parts[2] = `\n\n![Reference](./${targetFileName})\n` + parts[2];
                content = parts.join('---');
                console.log(`Ref injected into ${path.basename(mdPath)}`);
            } else {
                // Formatting is weird, just append?
                content = `![Reference](./${targetFileName})\n\n` + content;
            }
        }

        fs.writeFileSync(mdPath, content, 'utf-8');
        console.log(`✅ Asset Spec updated!`);
    }
}
