import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';
import chalk from 'chalk';

export function registerAddonsCommands(program: Command) {
    const addons = program
        .command('addons')
        .description('Manage OpsV extensions and skill packs');

    addons
        .command('install <zipPath>')
        .description('Install an addon pack (.zip) into the current project')
        .action(async (zipPath: string) => {
            const projectRoot = process.cwd();
            const absZipPath = path.resolve(projectRoot, zipPath);

            // 1. 验证项目环境
            const videospecDir = path.join(projectRoot, 'videospec');
            const videospecExists = await fs.access(videospecDir).then(() => true).catch(() => false);
            if (!videospecExists) {
                console.error(chalk.red('Error: Current directory is not a valid OpsV project. Please run "opsv init" first.'));
                process.exit(1);
            }

            // 2. 验证 Zip 文件
            const zipExists = await fs.access(absZipPath).then(() => true).catch(() => false);
            if (!zipExists) {
                console.error(chalk.red(`Error: Addon file not found: ${absZipPath}`));
                process.exit(1);
            }

            console.log(chalk.blue(`[Addons] Installing ${path.basename(absZipPath)}...`));

            try {
                const zip = new AdmZip(absZipPath);
                
                // 3. 预览解压内容（可选，这里直接执行）
                zip.extractAllTo(projectRoot, true);

                // 4. 解析被安装的组件
                const zipEntries = zip.getEntries();
                const installedSkills = zipEntries
                    .filter(e => e.entryName.includes('.agent/skills/') && e.entryName.endsWith('SKILL.md'))
                    .map(e => path.basename(path.dirname(e.entryName)));
                
                const installedAgents = zipEntries
                    .filter(e => e.entryName.startsWith('.agent/') && e.entryName.endsWith('.md') && !e.entryName.includes('/skills/'))
                    .map(e => path.basename(e.entryName));

                console.log(chalk.green('\n✅ Installation Successful!'));
                
                if (installedSkills.length > 0) {
                    console.log(chalk.cyan('Installed Skills:'));
                    installedSkills.forEach(s => console.log(` - ${s}`));
                }

                if (installedAgents.length > 0) {
                    console.log(chalk.cyan('Installed Agent Profiles:'));
                    installedAgents.forEach(a => console.log(` - ${a}`));
                }

                console.log(chalk.gray('\nYou can now use these skills by referencing them in your project or agent configurations.'));

            } catch (error: any) {
                console.error(chalk.red(`[Addons] Installation failed: ${error.message}`));
                process.exit(1);
            }
        });
}
