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

    async createNew(type: string, name?: string, options?: { from?: string, target?: string, variants?: number }) {
        if (!type || !['story', 'character', 'scene', 'shot'].includes(type)) {
            console.log('🎬 Welcome to OpenSpec-Video Director Mode');
            const answers = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'type',
                    message: 'What would you like to create?',
                    choices: [
                        { name: '📖 New Story Script', value: 'story' },
                        { name: '👤 New Character Asset', value: 'character' },
                        { name: '🏞️  New Scene Asset', value: 'scene' },
                        { name: '🎥 New Shot Script', value: 'shot' },
                        new inquirer.Separator(),
                        { name: '❌ Cancel', value: 'cancel' }
                    ]
                }
            ]);
            if (answers.type === 'cancel') return;
            type = answers.type;
        }

        if (options?.from || (options?.variants && options.variants > 1)) {
            // Document-Driven Agent Scaffold
            this.scaffoldAgentTask(type, name, options);
        } else {
            // Legacy Interactive fallback
            if (type === 'story') {
                await this.createStory(name);
            } else if (type === 'character' || type === 'scene') {
                await this.createAsset(type as 'characters' | 'scenes', name);
            } else if (type === 'shot') {
                console.log("Shot creation via legacy mode not supported yet. Use --from.");
            }
        }
    }

    private scaffoldAgentTask(type: string, name?: string, options?: { from?: string, target?: string, variants?: number }) {
        const title = name || `New ${type}`;
        const variants = options?.variants || 1;
        const fromDoc = options?.from ? `using "${options.from}" as reference` : "using standard generation";
        const targetOutput = options?.target ? options.target : `Standard ${type} file`;

        console.log(`\n🤖 **OpsV Director Agent Task Scaffolded**`);
        console.log(`---------------------------------------------------`);
        console.log(`I am your AI Director. You have requested to generate a **${type}** titled "${title}".`);
        console.log(`*   **Reference**: ${fromDoc}`);
        console.log(`*   **Target Output**: ${targetOutput}`);
        console.log(`*   **Variants**: Generate ${variants} different proposals.`);
        console.log(`\n**Agent Instructions:**`);

        let step = 1;
        console.log(`${step++}. Check the \`artifacts/scripts/${type}/\` directory to see if a drafted version of this task already exists. If yes, ask the user if they want to resume/modify it.`);
        if (options?.from) {
            console.log(`${step++}. Read the reference document: \`${options.from}\` (and any other files it references).`);
        }

        console.log(`${step++}. Generate ${variants} drafted options for \`${targetOutput}\`. Do NOT write the final file yet.`);
        console.log(`${step++}. Save each draft to \`artifacts/scripts/${type}/<date>-variant-[n].md\`.`);
        console.log(`${step++}. Present the options to the user and ask them to pick one or provide feedback.`);
        console.log(`${step++}. Once confirmed, promote the chosen option into \`${targetOutput}\` in the project directory.`);

        if (options?.target === 'shotslist.md' || type === 'story') {
            console.log(`${step++}. After generating the story/shots, ensure the shot list status is updated / initialized.`);
            // Auto-init shotslist.md just in case
            this.shotManager.initShotsList();
        }
        console.log(`---------------------------------------------------\n`);
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
