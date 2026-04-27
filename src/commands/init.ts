// ============================================================================
// OpsV v0.8 — opsv init
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { logger } from '../utils/logger';

export function registerInitCommand(program: Command, version: string): void {
  program
    .command('init [name]')
    .description('Scaffold a new OpsV project')
    .option('--dir <path>', 'Target directory')
    .action(async (name?: string, options?: any) => {
      try {
        const projectName = name || 'my-project';
        const targetDir = options?.dir
          ? path.resolve(options.dir, projectName)
          : path.join(process.cwd(), projectName);

        if (fs.existsSync(targetDir)) {
          console.error(chalk.red(`Directory already exists: ${targetDir}`));
          process.exit(1);
        }

        console.log(chalk.cyan(`Creating OpsV project: ${projectName}`));

        // Create directory structure
        const dirs = [
          path.join(targetDir, 'videospec', 'elements'),
          path.join(targetDir, 'videospec', 'scenes'),
          path.join(targetDir, 'opsv-queue', 'videospec'),
          path.join(targetDir, '.opsv'),
        ];

        for (const dir of dirs) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write project.md
        const projectMd = `---
type: project
status: draft
vision: "${projectName} — a cinematic narrative project"
aspect_ratio: "16:9"
resolution: "1920x1080"
---

# ${projectName}

Describe your project vision here.
`;

        fs.writeFileSync(path.join(targetDir, 'videospec', 'elements', 'project.md'), projectMd);

        // Write .opsv/api_config.yaml
        const apiConfig = `# OpsV v0.8 API Configuration
models:
  volcengine.seadream:
    provider: volcengine
    type: image
    model: seadream
    api_url: https://ark.cn-beijing.volces.com/api/v3/images/generations
    required_env:
      - ARK_API_KEY
    supports_reference_images: true
    max_reference_images: 1

  volcengine.seedance2:
    provider: volcengine
    type: video
    model: seedance-2
    api_url: https://ark.cn-beijing.volces.com/api/v3/contents/generations
    api_status_url: https://ark.cn-beijing.volces.com/api/v3/contents/status
    required_env:
      - ARK_API_KEY
    supports_first_image: true
    supports_last_image: true

  siliconflow.qwenimg:
    provider: siliconflow
    type: image
    model: Qwen/Qwen2.5-VL-72B-Instruct
    api_url: https://api.siliconflow.cn/v1/images/generations
    required_env:
      - SILICONFLOW_API_KEY

  siliconflow.wan:
    provider: siliconflow
    type: video
    model: wan
    api_url: https://api.siliconflow.cn/v1/video/submit
    api_status_url: https://api.siliconflow.cn/v1/video/status
    required_env:
      - SILICONFLOW_API_KEY
    supports_first_image: true

  minimax.minimax-image:
    provider: minimax
    type: image
    model: minimax-image-01
    api_url: https://api.minimax.chat/v1/image_generation
    required_env:
      - MINIMAX_API_KEY

  comfyui.sdxl:
    provider: comfyui
    type: image
    model: sdxl
    api_url: http://127.0.0.1:8188
`;

        fs.writeFileSync(path.join(targetDir, '.opsv', 'api_config.yaml'), apiConfig);

        // Write .env template
        const envTemplate = `# OpsV v0.8 Environment Variables
# Add your API keys here

# ARK_API_KEY=
# SILICONFLOW_API_KEY=
# MINIMAX_API_KEY=
# RUNNINGHUB_API_KEY=
`;

        fs.writeFileSync(path.join(targetDir, '.opsv', '.env'), envTemplate);

        // Write .gitignore
        const gitignore = `node_modules/
dist/
logs/
.env
*.tmp
opsv-queue/
.opsv/
`;

        fs.writeFileSync(path.join(targetDir, '.gitignore'), gitignore);

        console.log(chalk.green(`\nProject created at ${targetDir}`));
        console.log(chalk.cyan('\nNext steps:'));
        console.log(`  cd ${projectName}`);
        console.log('  opsv circle create');
        console.log('  opsv imagen --model volcengine.seadream');
        console.log('  opsv run opsv-queue/videospec/zerocircle/');
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}
