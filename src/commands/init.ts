// ============================================================================
// OpsV v0.8.4 — opsv init
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { logger } from '../utils/logger';

// Resolve templates directory relative to the compiled dist/ directory
const PKG_ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(PKG_ROOT, '..', 'templates');

export function registerInitCommand(program: Command, version: string): void {
  program
    .command('init [name]')
    .description('Scaffold a new OpsV project')
    .option('--dir <path>', 'Target directory')
    .action(async (name?: string, options?: any) => {
      try {
        // No name → init in current directory; with name → create subdirectory
        const projectName = name || path.basename(process.cwd());
        const targetDir = name
          ? (options?.dir
            ? path.resolve(options.dir, name)
            : path.join(process.cwd(), name))
          : (options?.dir
            ? path.resolve(options.dir)
            : process.cwd());

        if (name && fs.existsSync(targetDir)) {
          console.error(chalk.red(`Directory already exists: ${targetDir}`));
          process.exit(1);
        }

        // Guard: prevent overwriting existing project
        const existingMarker = path.join(targetDir, '.opsv', 'api_config.yaml');
        if (fs.existsSync(existingMarker)) {
          console.error(chalk.red(`OpsV project already exists in ${targetDir}`));
          process.exit(1);
        }

        console.log(chalk.cyan(`Initializing OpsV project: ${projectName}`));

        // Create directory structure
        const dirs = [
          path.join(targetDir, 'videospec', 'elements'),
          path.join(targetDir, 'videospec', 'scenes'),
          path.join(targetDir, 'opsv-queue'),
          path.join(targetDir, '.opsv'),
        ];

        for (const dir of dirs) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write project.md
        const projectMd = `---
category: project
status: drafting
vision: "${projectName} — a cinematic narrative project"
aspect_ratio: "16:9"
resolution: "1920x1080"
---

# ${projectName}

Describe your project vision here.
`;

        fs.writeFileSync(path.join(targetDir, 'videospec', 'elements', 'project.md'), projectMd);

        // Copy template files from templates/ directory
        copyTemplateFile(
          path.join(TEMPLATES_DIR, '.opsv', 'api_config.yaml'),
          path.join(targetDir, '.opsv', 'api_config.yaml')
        );

        copyTemplateFile(
          path.join(TEMPLATES_DIR, '.env'),
          path.join(targetDir, '.env')
        );

        // Copy .agent/ directory (skills, agent configs)
        const agentSrc = path.join(TEMPLATES_DIR, '.agent');
        if (fs.existsSync(agentSrc)) {
          copyDirRecursive(agentSrc, path.join(targetDir, '.agent'));
        }

        // Write .gitignore
        const gitignore = `node_modules/
dist/
logs/
.env
*.tmp
opsv-queue/
`;

        fs.writeFileSync(path.join(targetDir, '.gitignore'), gitignore);

        // Initialize git repository
        let gitInitFailed = false;
        try {
          execSync('git init', { cwd: targetDir, stdio: 'ignore' });
          console.log(chalk.green('Git repository initialized'));
        } catch {
          gitInitFailed = true;
        }

        console.log(chalk.green(`\nProject initialized at ${targetDir}`));
        if (gitInitFailed) {
          console.log(chalk.yellow('Warning: git init failed. Run "git init" manually to enable version control.'));
        }
        console.log(chalk.cyan('\nNext steps:'));
        if (name) {
          console.log(`  cd ${name}`);
        }
        console.log('  Edit .env to add your API keys');
        console.log('  opsv circle create --dir videospec');
        console.log('  opsv imagen --model volcengine.seadream');
        console.log('  opsv run opsv-queue/videospec.circle1/volcengine.seadream/');
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

function copyTemplateFile(src: string, dest: string): void {
  if (!fs.existsSync(src)) {
    console.warn(chalk.yellow(`Template file not found: ${src} (skipping)`));
    return;
  }
  fs.copyFileSync(src, dest);
}

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;

  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
