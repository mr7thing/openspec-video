// ============================================================================
// OpsV `opsv approved` — Agent-driven batch approve from CLI
// Follows the same execution rules as review, but via CLI (no web UI).
// Supports --file, --category, --circle, --dry-run, --action, --note.
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { ManifestReader } from '../core/ManifestReader';
import { ApproveService, ReviewAction } from '../core/ApproveService';
import { AssetManager } from '../core/AssetManager';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { getProjectDir } from '../utils/configLoader';
import { sanitizePathComponent } from '../utils/pathSecurity';
import { logger } from '../utils/logger';

const VALID_ACTIONS: ReviewAction[] = ['approve', 'design_feedback', 'revise_prompt'];

interface ApprovedOptions {
  circle?: string;
  file?: string;
  category?: string;
  action?: string;
  dryRun?: boolean;
  note?: string;
}

/**
 * Recursively scan a circle directory for output files matching the given assetId.
 * Skips .json, .log, and files/dirs starting with `_`.
 * Returns the filename (not full path) for each match.
 */
function scanOutputFiles(circleDir: string, assetId: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('_')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (sanitizePathComponent(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.json') || entry.name.endsWith('.log')) continue;
        // Match: filename starts with assetId followed by `_` or `.`
        if (entry.name.startsWith(assetId + '_') || entry.name.startsWith(assetId + '.')) {
          results.push(entry.name);
        }
      }
    }
  }

  walk(circleDir);
  return results;
}

export function registerApprovedCommand(program: Command): void {
  program
    .command('approved')
    .description('Directly approve assets from CLI — agent-driven batch approve (no web UI required)')
    .option('--circle [name]', 'Target circle name or path (auto-discovers latest if omitted)')
    .option('--file <ids>', 'Comma-separated asset IDs to approve (e.g. "@hero,@temple")')
    .option('--category <name>', 'Filter assets by frontmatter category')
    .option(
      '--action <action>',
      `Review action: ${VALID_ACTIONS.join(', ')} (default: approve)`,
      'approve',
    )
    .option('--dry-run', 'Preview which assets would be approved without making changes')
    .option('--note <text>', 'Optional note attached to the review entry')
    .action(async (options: ApprovedOptions) => {
      try {
        const projectRoot = process.cwd();
        const queueRoot = getProjectDir(projectRoot, 'queue');

        if (!fs.existsSync(queueRoot)) {
          console.error(chalk.red('Queue directory not found. Run "opsv circle create" first.'));
          process.exit(1);
        }

        // ── Validate action ──
        if (!VALID_ACTIONS.includes(options.action as ReviewAction)) {
          console.error(
            chalk.red(`Invalid action: "${options.action}". Must be one of: ${VALID_ACTIONS.join(', ')}`),
          );
          process.exit(1);
        }
        const action = options.action as ReviewAction;

        const manifestReader = new ManifestReader();

        // ── Resolve circle ──
        const circleInfo = manifestReader.resolveForReview(projectRoot, options.circle);
        if (!circleInfo) {
          console.error(chalk.red('No circle found. Run "opsv circle create" first.'));
          process.exit(1);
        }

        const { circleDir, circleName, manifest } = circleInfo;
        const assetsMap = manifest.assets || {};
        const allAssetIds = Object.keys(assetsMap);

        if (allAssetIds.length === 0) {
          console.log(chalk.yellow('Manifest contains no assets. Nothing to approve.'));
          return;
        }

        // ── Filter assets ──
        let targetIds: string[];

        if (options.file) {
          // Parse comma-separated list; strip leading @ for matching
          targetIds = options.file.split(',').map(s => {
            const trimmed = s.trim();
            return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
          });
          const notFound = targetIds.filter(id => !allAssetIds.includes(id));
          if (notFound.length > 0) {
            console.error(chalk.red(`Asset(s) not found in manifest: ${notFound.join(', ')}`));
            console.log(chalk.gray(`Available assets: ${allAssetIds.join(', ')}`));
            process.exit(1);
          }
        } else {
          targetIds = allAssetIds;
        }

        // Filter by category (read from document frontmatter — single source of truth)
        if (options.category) {
          const videospecDir = getProjectDir(projectRoot, 'videospec');
          targetIds = targetIds.filter(id => {
            const docPath = AssetManager.findAssetFilePathUnder(videospecDir, id);
            if (!docPath) return false;
            try {
              const content = fs.readFileSync(docPath, 'utf-8');
              const { frontmatter } = FrontmatterParser.parseRaw(content);
              return frontmatter.category === options.category;
            } catch {
              return false;
            }
          });
        }

        if (targetIds.length === 0) {
          console.log(chalk.yellow('No assets matched the filter criteria.'));
          return;
        }

        // ── Execute ──
        console.log(chalk.cyan(`Circle: ${circleName}`));
        console.log(chalk.cyan(`Assets to ${action}: ${targetIds.length}`));
        if (options.dryRun) {
          console.log(chalk.yellow('[DRY RUN] No changes will be written.\n'));
        } else {
          console.log('');
        }

        const approveService = new ApproveService(projectRoot, queueRoot, manifestReader);

        interface ApproveReport {
          assetId: string;
          success: boolean;
          status: string;
          note: string;
          outputs: string[];
        }

        const reports: ApproveReport[] = [];

        for (const assetId of targetIds) {
          const outputFiles = scanOutputFiles(circleDir, assetId);

          if (outputFiles.length === 0) {
            console.log(chalk.gray(`  ${assetId}: ⏭ skipped — no output files found in ${circleName}`));
            reports.push({
              assetId,
              success: false,
              status: 'drafting',
              note: 'No matching output files found in circle directory',
              outputs: [],
            });
            continue;
          }

          if (options.dryRun) {
            console.log(
              chalk.cyan(`  ${assetId}: would ${action} ${outputFiles.length} output(s): ${outputFiles.slice(0, 5).join(', ')}${outputFiles.length > 5 ? ' ...' : ''}`),
            );
            reports.push({
              assetId,
              success: true,
              status: '(dry-run)',
              note: `Would ${action} ${outputFiles.length} output(s)`,
              outputs: outputFiles,
            });
            continue;
          }

          try {
            const result = await approveService.execute({
              circle: circleName,
              assetId,
              action,
              outputFiles,
              note: options.note,
            });

            const icon =
              result.status === 'approved' ? '✅' : result.status === 'syncing' ? '🔄' : '📝';
            console.log(
              chalk.green(`  ${assetId}: ${icon} ${result.status} — ${result.note}`),
            );
            reports.push({ ...result, assetId, outputs: outputFiles });
          } catch (err: any) {
            console.log(chalk.red(`  ${assetId}: ❌ ${err.message}`));
            reports.push({
              assetId,
              success: false,
              status: 'error',
              note: err.message,
              outputs: outputFiles,
            });
          }
        }

        // ── Summary ──
        const approved = reports.filter(r => r.success && r.status === 'approved');
        const syncing = reports.filter(r => r.status === 'syncing');
        const skipped = reports.filter(
          r => !r.success && r.note?.includes('No matching output'),
        );
        const failed = reports.filter(r => !r.success && r.status !== 'drafting');

        console.log('');
        console.log(chalk.bold('Summary:'));
        if (approved.length > 0) console.log(chalk.green(`  ${approved.length} approved`));
        if (syncing.length > 0) console.log(chalk.yellow(`  ${syncing.length} syncing`));
        if (skipped.length > 0) console.log(chalk.gray(`  ${skipped.length} skipped (no outputs)`));
        if (failed.length > 0) console.log(chalk.red(`  ${failed.length} failed`));

        if (syncing.length > 0) {
          console.log('');
          console.log(chalk.yellow('⚠  Syncing assets — Guardian must align source documents:'));
          for (const s of syncing) {
            console.log(chalk.yellow(`    ${s.assetId} — review record contains modified_task path`));
          }
        }

        if (failed.length > 0) {
          process.exit(1);
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}
