// ============================================================================
// OpsV v0.8 — opsv script
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { FileUtils } from '../utils/FileUtils';
import { logger } from '../utils/logger';

export function registerScriptCommand(program: Command): void {
  program
    .command('script')
    .description('Aggregate shot data into script summary')
    .option('-d, --dir <path>', 'Project videospec directory', 'videospec')
    .option('-o, --output <path>', 'Output file path')
    .option('--dry-run', 'Show summary without writing')
    .action(async (options: any) => {
      try {
        const projectRoot = process.cwd();
        const videospecDir = path.resolve(projectRoot, options.dir);

        if (!fs.existsSync(videospecDir)) {
          console.error(chalk.red(`Videospec directory not found: ${videospecDir}`));
          process.exit(1);
        }

        const shots: any[] = [];

        const dirs = ['elements', 'scenes'];
        for (const dir of dirs) {
          const dirPath = path.join(videospecDir, dir);
          if (!fs.existsSync(dirPath)) continue;

          const files = fs.readdirSync(dirPath).filter(
            (f) => f.endsWith('.md')
          );

          for (const file of files) {
            const filePath = path.join(dirPath, file);
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              const { frontmatter } = FrontmatterParser.parseRaw(content);

              if (frontmatter.category === 'shot-design' || frontmatter.category === 'shot-production') {
                shots.push({
                  id: file.replace(/^@/, '').replace(/\.md$/, ''),
                  category: frontmatter.category,
                  title: frontmatter.title,
                  status: frontmatter.status,
                  duration: frontmatter.duration,
                  first_frame: frontmatter.first_frame,
                  last_frame: frontmatter.last_frame,
                });
              }
            } catch {
              // Skip invalid files
            }
          }
        }

        shots.sort((a, b) => {
          const numA = parseInt(a.id.replace(/\D/g, '')) || 0;
          const numB = parseInt(b.id.replace(/\D/g, '')) || 0;
          return numA - numB;
        });

        const totalDuration = shots
          .filter((s) => s.duration)
          .reduce((acc, s) => {
            const seconds = parseDuration(s.duration);
            return acc + seconds;
          }, 0);

        const summary = {
          totalShots: shots.length,
          totalDuration: `${Math.floor(totalDuration / 60)}m ${Math.round(totalDuration % 60)}s`,
          shots,
        };

        if (options.dryRun) {
          console.log(chalk.cyan('\nScript Summary:'));
          console.log(`  Total shots: ${summary.totalShots}`);
          console.log(`  Total duration: ${summary.totalDuration}`);
          for (const shot of shots) {
            console.log(`  ${shot.id}: ${shot.title || '(untitled)'} [${shot.status}] ${shot.duration || ''}`);
          }
          return;
        }

        const targetBasename = path.basename(path.resolve(options.dir));
        const outputPath = options.output || path.join(projectRoot, 'opsv-queue', targetBasename, '_script.json');
        await FileUtils.writeJson(outputPath, summary);

        console.log(chalk.green(`Script summary written to ${outputPath}`));
        console.log(`  Total shots: ${summary.totalShots}`);
        console.log(`  Total duration: ${summary.totalDuration}`);
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

function parseDuration(duration: string): number {
  const match = duration.match(/(\d+)s/);
  if (match) return parseInt(match[1], 10);

  const parts = duration.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  return parseInt(duration, 10) || 5;
}
