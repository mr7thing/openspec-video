import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';
import { projectAgentTemplates } from '../utils/projector';

const TEMPLATE_DIR = path.join(__dirname, '../../templates');

export function registerInitCommand(program: Command, VERSION: string) {
    program
        .command('init [projectName]')
        .description('Initialize a new OpenSpec-Video project')
        .option('-g, --gemini', 'Initialize with Gemini support (GEMINI.md)')
        .option('-c, --claude', 'Initialize with Claude Code support (CLAUDE_INSTRUCTIONS.md)')
        .option('-x, --codex', 'Initialize with Codex/Cursor support (.cursorrules)')
        .option('-o, --opencode', 'Initialize with OpenCode support (AGENTS.md + .opencode)')
        .option('-t, --trae', 'Initialize with Trae support (AGENTS.md + .trae)')
        .action(async (projectName, options) => {
            let targetDir = process.cwd();
            if (projectName && projectName !== '.') {
                targetDir = path.resolve(process.cwd(), projectName);
            }

            if (projectName && projectName !== '.') {
                const targetExists = await fs.access(targetDir).then(() => true).catch(() => false);
                if (targetExists) {
                    console.error(`Error: Directory ${projectName} already exists.`);
                    return;
                }
            }

            const templateDirExists = await fs.access(TEMPLATE_DIR).then(() => true).catch(() => false);
            if (!templateDirExists) {
                console.error(`CRITICAL ERROR: Template directory not found at ${TEMPLATE_DIR}`);
                return;
            }

            let tools: string[] = [];

            // 1. Check for CLI flags for automated/non-interactive use
            if (options.gemini) tools.push('gemini');
            if (options.claude) tools.push('claude');
            if (options.codex) tools.push('codex');
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
                            { name: 'Claude Code (CLAUDE_INSTRUCTIONS.md)', value: 'claude', checked: true },
                            { name: 'Codex / Cursor (.cursorrules)', value: 'codex', checked: true },
                            { name: 'Trae (AGENTS.md + .trae)', value: 'trae' },
                            { name: 'OpenCode (AGENTS.md + .opencode)', value: 'opencode' },
                            { name: 'Gemini (Deprecated - GEMINI.md)', value: 'gemini' }
                        ]
                    }
                ]);
                tools = response.tools;
            }

            console.log(`Initializing project in ${targetDir}...`);

            try {
                await fs.mkdir(targetDir, { recursive: true });

                // 1. Core Projection (All core genes from .agent are projected here)
                await projectAgentTemplates(targetDir, tools, TEMPLATE_DIR);

                const templateEnvExists = await fs.access(path.join(TEMPLATE_DIR, '.env')).then(() => true).catch(() => false);
                if (templateEnvExists) {
                    await fs.cp(path.join(TEMPLATE_DIR, '.env'), path.join(targetDir, '.env'), { recursive: true, force: true });
                }

                // 2. Selective copy based on tools (Legacy & Metadata)
                if (tools.includes('gemini')) {
                    const geminiExists = await fs.access(path.join(TEMPLATE_DIR, 'GEMINI.md')).then(() => true).catch(() => false);
                    if (geminiExists) {
                        await fs.copyFile(path.join(TEMPLATE_DIR, 'GEMINI.md'), path.join(targetDir, 'GEMINI.md'));
                    }
                }

                if (tools.includes('opencode') || tools.includes('trae')) {
                    const agentsExists = await fs.access(path.join(TEMPLATE_DIR, 'AGENTS.md')).then(() => true).catch(() => false);
                    if (agentsExists) {
                        await fs.copyFile(path.join(TEMPLATE_DIR, 'AGENTS.md'), path.join(targetDir, 'AGENTS.md'));
                    }
                }

                if (tools.includes('opencode')) {
                    // Still ensuring the physical directory exists for OpenCode specific reasons
                    await fs.mkdir(path.join(targetDir, '.opencode'), { recursive: true });
                }

                // 3. Create normative videospec structure
                const specDir = path.join(targetDir, 'videospec');
                await fs.mkdir(specDir, { recursive: true });
                await fs.mkdir(path.join(specDir, 'stories'), { recursive: true });
                await fs.mkdir(path.join(specDir, 'elements'), { recursive: true });
                await fs.mkdir(path.join(specDir, 'scenes'), { recursive: true });
                await fs.mkdir(path.join(specDir, 'shots'), { recursive: true });

                // 4. Create operational directories
                await fs.mkdir(path.join(targetDir, 'opsv-queue'), { recursive: true });
                await fs.mkdir(path.join(targetDir, '.opsv'), { recursive: true });

                // 5. Create .gitignore and initialize Git
                const defaultGitignore = `# System Files
.DS_Store
Thumbs.db

# Dependencies & Build
node_modules/
dist/

# Runtime Data & Artifacts
opsv-queue/
.opsv/

# OpenCode & Trae 
.opencode/
.trae/
`;
                const gitignoreDest = path.join(targetDir, '.gitignore');
                await fs.writeFile(gitignoreDest, defaultGitignore);

                const { execSync } = require('child_process');
                try {
                    // Check if git is installed
                    execSync('git --version', { stdio: 'ignore' });
                    
                    const gitExists = await fs.access(path.join(targetDir, '.git')).then(() => true).catch(() => false);
                    if (!gitExists) {
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
