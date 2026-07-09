// ============================================================================
// OpsV `opsv approve` — Approve a single generated output file
//
// Usage:
//   opsv approve queue/circle/volcengine.seedance_002/dragon_pearl_3.png
//   opsv approve queue/circle/volcengine.seedance_002/dragon_pearl_3.png --action design_feedback
//   opsv approve queue/circle/volcengine.seedance_002/dragon_pearl_m1_1.png --dry-run
//
// Each call adds exactly ONE output to the source document's
// ## Approved References section. No batch — approve one file at a time.
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { ApproveService, ReviewAction } from '../core/ApproveService';
import { AssetManager } from '../core/AssetManager';
import { ManifestReader } from '../core/ManifestReader';
import { getProjectDir } from '../utils/configLoader';
import { parseOutputFilename } from '../executor/naming';
import { logger } from '../utils/logger';

const VALID_ACTIONS: ReviewAction[] = ['approve', 'design_feedback', 'revise_prompt'];

export function registerApproveCommand(program: Command): void {
  program
    .command('approve')
    .description(
      'Approve a single generated output file — adds it to the source document\'s ## Approved References.\n' +
      'One call = one output. Approve files one at a time.'
    )
    .argument(
      '<output-file>',
      'Path to a generated output file, e.g. queue/circle/volcengine.seedance_002/dragon_pearl_3.png'
    )
    .option(
      '--action <action>',
      `Review action: ${VALID_ACTIONS.join(', ')} (default: approve)`,
      'approve',
    )
    .option('--dry-run', 'Preview which output would be approved without writing changes')
    .option('--note <text>', 'Optional note attached to the review entry')
    .action(async (outputFile: string, options: { action?: string; dryRun?: boolean; note?: string }) => {
      try {
        const projectRoot = process.cwd();

        // ── Validate action ──
        const action = options.action as ReviewAction;
        if (!VALID_ACTIONS.includes(action)) {
          console.error(
            chalk.red(`Invalid action: "${options.action}". Must be one of: ${VALID_ACTIONS.join(', ')}`),
          );
          process.exit(1);
        }

        // ── resolve output file path ──
        const absPath = path.resolve(projectRoot, outputFile);
        if (!fs.existsSync(absPath)) {
          console.error(chalk.red(`Output file not found: ${absPath}`));
          process.exit(1);
        }
        if (!fs.statSync(absPath).isFile()) {
          console.error(chalk.red(`Not a file: ${absPath}`));
          process.exit(1);
        }

        const filename = path.basename(absPath);

        // ── parse output filename → trace back to task JSON ──
        const parsed = parseOutputFilename(filename);
        const taskJsonDir = path.dirname(absPath);
        const taskJsonPath = path.join(taskJsonDir, parsed.taskJsonName);

        if (!fs.existsSync(taskJsonPath)) {
          console.error(chalk.red(`Corresponding task JSON not found: ${taskJsonPath}`));
          process.exit(1);
        }

        // ── read task JSON → get shotId (asset ID) ──
        let taskJson: any;
        try {
          taskJson = JSON.parse(fs.readFileSync(taskJsonPath, 'utf-8'));
        } catch (e: any) {
          console.error(chalk.red(`Failed to parse task JSON: ${e.message}`));
          process.exit(1);
        }

        const shotId: string | undefined = taskJson._opsv?.shotId;
        if (!shotId) {
          console.error(chalk.red(`Task JSON missing _opsv.shotId: ${taskJsonPath}`));
          process.exit(1);
        }

        // ── trace back to source document ──
        const videospecDir = getProjectDir(projectRoot, 'videospec');
        const sourceDocPath = AssetManager.findAssetFilePathUnder(videospecDir, shotId);
        if (!sourceDocPath) {
          console.error(chalk.red(`Source document not found for asset "${shotId}" under ${videospecDir}`));
          process.exit(1);
        }

        // ── derive circle name from path structure ──
        // Path layout: <queueRoot>/<circleName>/<modelKey_NNN>/<outputFile>
        const queueRoot = getProjectDir(projectRoot, 'queue');
        if (!fs.existsSync(queueRoot)) {
          console.error(chalk.red('Queue directory not found. Run "opsv circle create" first.'));
          process.exit(1);
        }
        const relativeToQueue = path.relative(queueRoot, absPath);
        const pathParts = relativeToQueue.split(path.sep);
        if (pathParts.length < 2) {
          console.error(chalk.red(`Output file is not inside a circle queue directory: ${absPath}`));
          process.exit(1);
        }
        const circleName = pathParts[0];

        // ── summary ──
        console.log(chalk.cyan(`Output:    ${filename}`));
        console.log(chalk.cyan(`Asset:     ${shotId}`));
        console.log(chalk.cyan(`Document:  ${sourceDocPath}`));
        console.log(chalk.cyan(`Circle:    ${circleName}`));
        console.log(chalk.cyan(`Action:    ${action}`));
        if (parsed.isModified) {
          console.log(chalk.yellow(`Task:      ${parsed.taskJsonName} (modified/iterated)`));
        }

        if (options.dryRun) {
          console.log(chalk.yellow('\n[DRY RUN] No changes written.'));
          return;
          }

        // ── execute ──
        console.log('');
        const approveService = new ApproveService(projectRoot, queueRoot, new ManifestReader());
        const result = await approveService.executeFile(absPath, circleName, action, options.note);

        const icon =
          result.status === 'approved' ? '✅' : result.status === 'syncing' ? '🔄' : '📝';
        console.log(chalk.green(`${icon} ${result.status}: ${result.note}`));
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}
