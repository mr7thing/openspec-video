import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';

const TEMPLATE_DIR = path.join(__dirname, '../../templates');

export function registerInitCommand(program: Command, VERSION: string) {
    program
        .command('init [projectName]')
        .description('Initialize a new OpenSpec-Video project')
        .option('-g, --gemini', 'Initialize with Gemini support (GEMINI.md)')
        .option('-o, --opencode', 'Initialize with OpenCode support (AGENTS.md + .opencode)')
        .option('-t, --trae', 'Initialize with Trae support (AGENTS.md + .trae)')
        .action(async (projectName, options) => {
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

            let tools: string[] = [];

            // 1. Check for CLI flags for automated/non-interactive use
            if (options.gemini) tools.push('gemini');
            if (options.opencode) tools.push('opencode');
            if (options.trae) tools.push('trae');

            // 2. If no flags provided, fall back to interactive prompt
            if (tools.length === 0) {
                const response = await inquirer.prompt([
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
                tools = response.tools;
            }

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

                // 5. Create .gitignore and initialize Git
                const gitignoreSrc = path.join(TEMPLATE_DIR, 'assets/.gitignore');
                const gitignoreDest = path.join(targetDir, '.gitignore');
                if (fs.existsSync(gitignoreSrc)) {
                    await fs.copy(gitignoreSrc, gitignoreDest);
                }

                const { execSync } = require('child_process');
                try {
                    // Check if git is installed
                    execSync('git --version', { stdio: 'ignore' });
                    
                    if (!fs.existsSync(path.join(targetDir, '.git'))) {
                        execSync('git init', { cwd: targetDir, stdio: 'ignore' });
                        execSync('git add .', { cwd: targetDir, stdio: 'ignore' });
                        execSync('git commit -m "chore: initial project structure by OpsV"', { cwd: targetDir, stdio: 'ignore' });
                        console.log('✅ Git repository initialized with .gitignore');
                    }
                } catch (e) {
                    console.warn('⚠️ Git not found or failed to initialize. Please install git for asset tracking.');
                }

                console.log('\n🚀 Project structure created successfully.');
                console.log(`   Tools configured: ${tools.join(', ')}`);
                console.log(`   Location: ${targetDir}\n`);
            } catch (err) {
                console.error('Failed to initialize project:', err);
            }
        });
}
