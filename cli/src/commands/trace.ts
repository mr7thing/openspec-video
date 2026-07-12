// ============================================================================
// OpsV opsv trace
// Trace an asset back from output to source document
// ============================================================================

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { AssetManager } from '../core/AssetManager';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { ManifestReader } from '../core/ManifestReader';
import { getProjectDir } from '../utils/configLoader';
import { logger } from '../utils/logger';

interface TraceResult {
  assetId: string;
  sourceDoc: string | null;
  category: string;
  status: string;
  outputs: Array<{
    circle: string;
    file: string;
    approved: boolean;
  }>;
  refs: Record<string, string[]>;
  reviewHistory: Array<{
    timestamp: string;
    action: string;
    outputFile?: string;
  }>;
}

export function registerTraceCommand(program: Command): void {
  program
    .command('trace <assetId>')
    .description('Trace an asset from output back to source document')
    .option('--circle <name>', 'Limit trace to specific circle')
    .action(async (assetId: string, options: { circle?: string }) => {
      try {
        const projectRoot = process.cwd();
        const queueRoot = getProjectDir(projectRoot, 'queue');
        const videospecDir = getProjectDir(projectRoot, 'videospec');

        // 1. Find source document
        const sourceDoc = AssetManager.findAssetFilePathUnder(videospecDir, assetId);

        if (!sourceDoc) {
          console.log(chalk.red(`Asset "${assetId}" not found under videospec/`));
          return;
        }

        console.log(chalk.cyan.bold(`Trace: ${assetId}`));
        console.log(chalk.gray('─'.repeat(50)));

        // 2. Read source document
        const content = fs.readFileSync(sourceDoc, 'utf-8');
        const { frontmatter, body } = FrontmatterParser.parseRaw(content);

        console.log(`\n${chalk.bold('Source Document')}: ${sourceDoc}`);
        console.log(`  Category: ${frontmatter.category || 'unknown'}`);
        const statusColor = frontmatter.status === 'approved' ? chalk.green
          : frontmatter.status === 'syncing' ? chalk.yellow
          : chalk.gray;
        console.log(`  Status: ${statusColor(frontmatter.status)}`);

        // 3. Show refs
        const refs = (frontmatter.refs || {}) as Record<string, Record<string, string[]>>;
        const refCount = Object.values(refs).reduce((sum, typeMap) =>
          sum + Object.keys(typeMap || {}).length, 0);

        if (refCount > 0) {
          console.log(`\n${chalk.bold('References')} (${refCount}):`);
          for (const [type, typeMap] of Object.entries(refs)) {
            if (!typeMap) continue;
            for (const [key, paths] of Object.entries(typeMap)) {
              console.log(`  ${chalk.gray(type)} ${key} → ${paths[0] || '(empty)'}`);
            }
          }
        }

        // 4. Find output files across circles
        if (fs.existsSync(queueRoot)) {
          const circleDirs = fs.readdirSync(queueRoot)
            .filter(d => /_circle\d+$/.test(d))
            .filter(d => !options.circle || d.includes(options.circle));

          const outputs: TraceResult['outputs'] = [];

          for (const circleDir of circleDirs) {
            const circlePath = path.join(queueRoot, circleDir);
            findOutputsRecursive(circlePath, circleDir, assetId, outputs);
          }

          if (outputs.length > 0) {
            console.log(`\n${chalk.bold('Output Files')} (${outputs.length}):`);
            for (const output of outputs) {
              const statusIcon = output.approved ? chalk.green('✓') : chalk.gray('○');
              console.log(`  ${statusIcon} ${output.circle}/${output.file}`);
            }
          } else {
            console.log(`\n${chalk.yellow('No output files found.')}`);
          }
        }

        // 5. Show review history
        const reviews = (frontmatter.reviews || []) as Array<{
          timestamp: string;
          action: string;
          outputFile?: string;
        }>;

        if (reviews.length > 0) {
          console.log(`\n${chalk.bold('Review History')} (${reviews.length}):`);
          for (const review of reviews.slice(-5)) {
            const date = new Date(review.timestamp).toLocaleString();
            console.log(`  ${chalk.gray(date)} ${review.action}${review.outputFile ? ` → ${review.outputFile}` : ''}`);
          }
          if (reviews.length > 5) {
            console.log(chalk.gray(`  ... and ${reviews.length - 5} more`));
          }
        }

        console.log(chalk.gray('─'.repeat(50)));
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

// Need to add this as a method or standalone function
function findOutputsRecursive(
  dir: string,
  circleName: string,
  assetId: string,
  results: Array<{ circle: string; file: string; approved: boolean }>,
): void {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findOutputsRecursive(fullPath, circleName, assetId, results);
    } else if (entry.isFile() && entry.name.startsWith(assetId)) {
      if (entry.name.endsWith('.json') || entry.name.endsWith('.log')) continue;
      results.push({
        circle: circleName,
        file: entry.name,
        approved: false, // Would need manifest check for accurate status
      });
    }
  }
}
