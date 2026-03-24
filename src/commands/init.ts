import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';

const TEMPLATE_DIR = path.join(__dirname, '../../templates');

export function registerInitCommand(program: Command, VERSION: string) {
    program
        .command('init [projectName]')
        .description('Initialize a new OpenSpec-Video project')
        .action(async (projectName) => {
            let targetDir = process.cwd();
            if (projectName && projectName !== '.') {
                targetDir = path.resolve(process.cwd(), projectName);
            }

            if (projectName && projectName !== '.' && fs.existsSync(targetDir)) {
                console.error(`Error: Directory ${projectName} already exists.`);
                return;
            }

            if (!fs.existsSync(TEMPLATE_DIR)) {
                console.error(`CRITICAL ERROR: Template directory not found at ${TEMPLATE_DIR}`);
                return;
            }

            const { tools } = await inquirer.prompt([
                {
                    type: 'checkbox',
                    name: 'tools',
                    message: 'Select the AI assistants you want to support:',
                    choices: [
                        { name: 'Gemini (Legacy - GEMINI.md)', value: 'gemini', checked: true },
                        { name: 'OpenCode (AGENTS.md + .opencode)', value: 'opencode' },
                        { name: 'Trae (AGENTS.md + .trae)', value: 'trae' }
                    ]
                }
            ]);

            console.log(`Initializing project in ${targetDir}...`);

            try {
                await fs.ensureDir(targetDir);

                // 1. Copy mandatory base templates (.agent skills, .antigravity workflows, and .env config)
                await fs.copy(path.join(TEMPLATE_DIR, '.agent'), path.join(targetDir, '.agent'));
                await fs.copy(path.join(TEMPLATE_DIR, '.antigravity'), path.join(targetDir, '.antigravity'));
                if (fs.existsSync(path.join(TEMPLATE_DIR, '.env'))) {
                    await fs.copy(path.join(TEMPLATE_DIR, '.env'), path.join(targetDir, '.env'));
                }

                // 2. Selective copy based on tools
                if (tools.includes('gemini')) {
                    if (fs.existsSync(path.join(TEMPLATE_DIR, 'GEMINI.md'))) {
                        await fs.copy(path.join(TEMPLATE_DIR, 'GEMINI.md'), path.join(targetDir, 'GEMINI.md'));
                    }
                }

                if (tools.includes('opencode') || tools.includes('trae')) {
                    // Both use AGENTS.md as the primary instruction file
                    if (fs.existsSync(path.join(TEMPLATE_DIR, 'AGENTS.md'))) {
                        await fs.copy(path.join(TEMPLATE_DIR, 'AGENTS.md'), path.join(targetDir, 'AGENTS.md'));
                    }
                }

                if (tools.includes('opencode')) {
                    const opencodeDir = path.join(TEMPLATE_DIR, '.opencode');
                    if (fs.existsSync(opencodeDir)) {
                        await fs.copy(opencodeDir, path.join(targetDir, '.opencode'));
                    } else {
                        await fs.ensureDir(path.join(targetDir, '.opencode'));
                    }
                }

                if (tools.includes('trae')) {
                    const traeDir = path.join(TEMPLATE_DIR, '.trae');
                    if (fs.existsSync(traeDir)) {
                        await fs.copy(traeDir, path.join(targetDir, '.trae'));
                    } else {
                        await fs.ensureDir(path.join(targetDir, '.trae'));
                    }
                }

                // 3. Create normative videospec structure
                const specDir = path.join(targetDir, 'videospec');
                await fs.ensureDir(specDir);
                await fs.ensureDir(path.join(specDir, 'stories'));
                await fs.ensureDir(path.join(specDir, 'elements'));
                await fs.ensureDir(path.join(specDir, 'scenes'));
                await fs.ensureDir(path.join(specDir, 'shots'));

                // 4. Create operational directories
                await fs.ensureDir(path.join(targetDir, 'artifacts'));
                await fs.ensureDir(path.join(targetDir, 'queue'));

                console.log('Project structure created successfully.');
                console.log(`Tools configured: ${tools.join(', ')}`);
            } catch (err) {
                console.error('Failed to initialize project:', err);
            }
        });
}
