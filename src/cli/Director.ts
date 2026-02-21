import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';

import { ShotManager } from '../core/ShotManager';

export class Director {
    private projectRoot: string;
    private shotManager: ShotManager;

    constructor(projectRoot: string) {
        this.projectRoot = path.resolve(projectRoot);
        this.shotManager = new ShotManager(this.projectRoot);
    }

    async createNew(type: string, name?: string) {
        if (type === 'story') {
            await this.createStory(name);
        } else if (type === 'character') {
            await this.createAsset('characters', name);
        } else if (type === 'scene') {
            await this.createAsset('scenes', name);
        } else {
            console.log('🎬 Welcome to OpenSpec-Video Director Mode');
            const answers = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'action',
                    message: 'What would you like to create?',
                    choices: [
                        { name: '📖 New Story Script', value: 'story' },
                        { name: '👤 New Character Asset', value: 'character' },
                        { name: '🏞️  New Scene Asset', value: 'scene' },
                        new inquirer.Separator(),
                        { name: '❌ Cancel', value: 'cancel' }
                    ]
                }
            ]);

            if (answers.action !== 'cancel') {
                await this.createNew(answers.action);
            }
        }
    }

    private async createStory(name?: string) {
        console.log('\n📝 Let\'s draft a new story.');

        let title = name;
        if (!title) {
            const ans = await inquirer.prompt([{
                type: 'input',
                name: 'title',
                message: 'Story Title:',
                default: 'New Story'
            }]);
            title = ans.title;
        }

        const details = await inquirer.prompt([
            { type: 'input', name: 'genre', message: 'Genre (e.g., Sci-Fi, Fantasy):', default: 'Fantasy' },
            { type: 'input', name: 'logline', message: 'Logline (One sentence summary):' },
            { type: 'confirm', name: 'autoGenerate', message: 'Do you want to auto-generate an outline?', default: false }
        ]);

        const safeTitle = title!.replace(/\s+/g, '_');
        const targetPath = path.join(this.projectRoot, 'videospec/stories', `${safeTitle}.md`);

        let content = `# ${title}\n\n**Genre**: ${details.genre}\n**Logline**: ${details.logline}\n\n## Act 1\n**Shot 1**: [Setting the Scene]...\n`;

        if (details.autoGenerate) {
            console.log('🤖 Suggestion: Use your AI Copilot/Antigravity to generate the outline.');
            console.log('Sample Prompt: "Create a Markdown story outline for a ' + details.genre + ' story with logline: ' + details.logline + '"');
            content += `\n*Waiting for AI Agent to fill in...*\n`;
        }

        fs.ensureDirSync(path.dirname(targetPath));
        fs.writeFileSync(targetPath, content);

        // Initialize Shots List if missing
        this.shotManager.initShotsList();

        console.log(`✅ Story draft created at: ${targetPath}`);
    }

    private async createAsset(type: 'characters' | 'scenes', name?: string) {
        console.log(`\n🎨 Creating new ${type === 'characters' ? 'Character' : 'Scene'} asset.`);

        let assetName = name;
        if (!assetName) {
            const ans = await inquirer.prompt([{
                type: 'input',
                name: 'name',
                message: `${type === 'characters' ? 'Character' : 'Scene'} Name:`,
                validate: (input: string) => input ? true : 'Name is required'
            }]);
            assetName = ans.name;
        }

        const id = assetName!.toLowerCase().replace(/\s+/g, '_');
        const targetPath = path.join(this.projectRoot, `videospec/assets/${type}`, `${id}.md`);

        if (fs.existsSync(targetPath)) {
            console.warn(`⚠️  Asset ${id} already exists!`);
            const overwrite = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirm',
                message: 'Overwrite?',
                default: false
            }]);
            if (!overwrite.confirm) return;
        }

        const template = `---
id: "${id}"
name: "${assetName}"
---
![Reference](./${id}_ref.png)

# Description
${type === 'characters' ? 'Physical appearance, clothing, and distinctive features.' : 'Environment details, lighting, and mood.'}
`;

        fs.ensureDirSync(path.dirname(targetPath));
        fs.writeFileSync(targetPath, template);
        console.log(`✅ Asset created at: ${targetPath}`);
        console.log(`👉 Don't forget to add a reference image!`);
    }
}
