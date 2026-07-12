// ============================================================================
// OpsV opsv produce — unified command for imagen / video / comfy
// Reads from circle manifest, compiles to circle/{model}/
// All type-specific behavior is driven by api_config.yaml (inputs + payload_example)
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import chalk from 'chalk';
import { ProductionPipeline } from '../core/ProductionPipeline';
import { ManifestReader } from '../core/ManifestReader';
import { resolveProjectRoot } from '../utils/projectResolver';
import { logger } from '../utils/logger';

interface ProduceOptions {
  model: string;
  manifest?: string;
  category?: string;
  statusSkip?: string;
  file?: string;
  workflow?: string;
  param?: string;
  promptMode?: 'keep' | 'index' | 'name';
  dryRun?: boolean;
}

export function registerProduceCommand(program: Command): void {
  program
    .command('produce')
    .description('Compile generation tasks from circle manifest (imagen/video/comfy)')
    .requiredOption('--model <model>', 'Provider model key (e.g. volc.seedance2, rh-api.seedance)')
    .option('--manifest <path>', 'Path to _manifest.json (or directory containing it)')
    .option('--category <cat>', 'Filter assets by category (e.g. shot-production, character)')
    .option('--status-skip <statuses>', 'Comma-separated statuses to skip (default: approved)')
    .option('--file <id>', 'Run specific asset by id (from manifest)')
    .option('--workflow <file>', 'Workflow JSON file path (ComfyUI only)')
    .option('--param <json>', 'Override parameters as JSON (injected into payload.extra)')
    .option('--prompt-mode <mode>', 'Prompt @-token compile mode: keep | index | name')
    .option('--dry-run', 'Show compiled tasks without writing files')
    .action(async (options: ProduceOptions) => {
      try {
        const cwd = process.cwd();
        const projectRoot = resolveProjectRoot(cwd);
        const manifestPath = new ManifestReader().resolveForProduce(cwd, options.manifest);
        const circleDir = path.dirname(manifestPath);

        const skipStatuses = options.statusSkip
          ? options.statusSkip === 'none'
            ? []
            : options.statusSkip.split(',').map((s) => s.trim())
          : ['approved'];

        let paramOverrides: Record<string, any> = {};
        if (options.param) {
          try {
            paramOverrides = JSON.parse(options.param);
          } catch {
            console.error(chalk.red('--param must be valid JSON'));
            process.exit(1);
          }
        }

        const pipeline = new ProductionPipeline(projectRoot);
        const result = await pipeline.run({
          modelKey: options.model,
          circleDir,
          category: options.category,
          file: options.file,
          skipStatuses,
          paramOverrides,
          workflowPath: options.workflow,
          promptMode: options.promptMode,
          dryRun: options.dryRun,
        });

        if (result.compiled === 0) {
          console.log(chalk.yellow('No pending assets found in this circle.'));
          return;
        }

        if (result.errors.length > 0) {
          console.log(chalk.yellow(`\n${result.errors.length} asset(s) skipped due to errors:`));
          result.errors.forEach((e) => console.log(chalk.yellow(`  ${e}`)));
        }

        if (options.dryRun) {
          console.log(chalk.cyan('\n[dry-run] Compiled tasks listed above.'));
        } else {
          console.log(chalk.green(`\n${result.compiled} tasks compiled to ${result.outputDir}`));
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}
