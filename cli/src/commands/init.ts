// ============================================================================
// OpsV opsv init
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { execSync } from 'child_process';
import yaml from 'js-yaml';
import { logger } from '../utils/logger';

interface InitCommandOptions {
  dir?: string;
}

export function registerInitCommand(program: Command, version: string): void {
  program
    .command('init [name]')
    .description('Scaffold a new OpsV project')
    .option('--dir <path>', 'Target directory')
    .action(async (name?: string, options?: InitCommandOptions) => {
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
        const existingMarker = path.join(targetDir, 'videospec');
        if (fs.existsSync(existingMarker)) {
          console.error(chalk.red(`videospec/ already exists in ${targetDir}`));
          process.exit(1);
        }

        console.log(chalk.cyan(`Initializing OpsV project: ${projectName}`));

        // Create directory structure
        const dirs = [
          path.join(targetDir, 'videospec', 'elements'),
          path.join(targetDir, 'videospec', 'scenes'),
          path.join(targetDir, 'videospec', 'shots'),
          path.join(targetDir, 'opsv-queue'),
          path.join(targetDir, '.opsv'),
        ];

        for (const dir of dirs) {
          fs.mkdirSync(dir, { recursive: true });
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
        } catch (err: any) {
          gitInitFailed = true;
          logger.debug(`git init failed: ${err.message}`);
        }

        // Copy built-in .opsv configs as .sample files
        const builtinOpsvDir = path.join(__dirname, '..', '..', '.opsv');
        const projectOpsvDir = path.join(targetDir, '.opsv');
        const sampleFiles = ['api_config.yaml', 'category_validate.yaml', 'input_types.yaml'];

        for (const file of sampleFiles) {
          const src = path.join(builtinOpsvDir, file);
          if (fs.existsSync(src)) {
            const dest = path.join(projectOpsvDir, `${file}.sample`);
            fs.copyFileSync(src, dest);
            console.log(chalk.gray(`  Created ${path.relative(targetDir, dest)}`));
          }
        }

        // Generate .env.sample with all required_env vars extracted from built-in api_config
        const apiConfigPath = path.join(builtinOpsvDir, 'api_config.yaml');
        if (fs.existsSync(apiConfigPath)) {
          const raw = fs.readFileSync(apiConfigPath, 'utf8');
          const parsed = yaml.load(raw) as any;
          const models = parsed?.models || {};
          const envVars = new Set<string>();
          for (const modelKey of Object.keys(models)) {
            const req = models[modelKey]?.required_env;
            if (Array.isArray(req)) {
              req.forEach((v: string) => envVars.add(v));
            }
          }

          if (envVars.size > 0) {
            const envSampleLines = [
              '# .env.sample — 由 opsv init 自动生成',
              '# 复制为 .env 并填入你的 API Key',
              '',
            ];
            for (const envVar of envVars) {
              envSampleLines.push(`${envVar}=your_key_here`);
            }
            envSampleLines.push('');
            fs.writeFileSync(path.join(targetDir, '.env.sample'), envSampleLines.join('\n'));
            console.log(chalk.gray('  Created .env.sample'));
          }
        }

        console.log(chalk.green(`\nProject initialized at ${targetDir}`));
        if (gitInitFailed) {
          console.log(chalk.yellow('Warning: git init failed. Run "git init" manually to enable version control.'));
        }
        console.log(chalk.cyan('\nNext steps:'));
        if (name) {
          console.log(`  cd ${name}`);
        }
        console.log('  cp .env.sample .env        # Edit to add your API keys');
        console.log('  opsv circle create --dir videospec');
        console.log('  opsv imagen --model volcengine.seadream');
        console.log('  opsv run opsv-queue/videospec_circle1/volcengine.seadream_001/');
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}
