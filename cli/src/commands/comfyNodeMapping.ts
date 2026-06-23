// ============================================================================
// OpsV opsv comfy-node-mapping
// Analyzes a ComfyUI API workflow JSON and extracts opsv- prefixed nodes
// into a node_mappings object ready for api_config.yaml
// ============================================================================

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { logger } from '../utils/logger';

interface ComfyNodeMappingOptions {
  prefix?: string;
  output?: string;
  workflowId?: string;
}

// Read version from package.json
const pkgPath = path.join(__dirname, '../../package.json');
let pkgVersion = '0.9.0';
try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkgVersion = pkg.version || pkgVersion;
} catch {
  // fallback
}

interface NodeMapping {
  nodeId: string;
  fieldName: string;
}

interface MappingResult {
  [key: string]: NodeMapping;
}

/**
 * opsv-workflow.json schema — the canonical record of a workflow's opsv metadata.
 * Saved next to the workflow file (e.g. my_workflow.opsv-workflow.json).
 *
 * For RunningHub cloud workflows: set workflowId, workflowPath may be omitted.
 * For local ComfyUI workflows: set workflowPath, workflowId may be omitted.
 * Both can be set if you have both local and cloud versions of the same workflow.
 */
export interface OpsvWorkflowMeta {
  /** RunningHub workflow ID (for cloud execution). Null if local-only. */
  workflowId: string | null;
  /** Path relative to project root (e.g. workflows/my_workflow.json). Null if cloud-only. */
  workflowPath: string | null;
  /** Extracted node mappings: opsv- prefixed node title → { nodeId, fieldName } */
  nodeMappings: MappingResult;
  /** OpsV version that produced this file */
  opsvVersion: string;
}

export function registerComfyNodeMappingCommand(program: Command): void {
  program
    .command('comfy-node-mapping <workflow-file>')
    .description('Analyze ComfyUI workflow JSON → stdout (or -o file). Embeds workflowId for RunningHub cloud workflows.')
    .option('-o, --output <path>', 'Write JSON to file instead of stdout')
    .option('--prefix <str>', 'Node title prefix to match', 'opsv-')
    .option('--workflow-id <id>', 'RunningHub workflow ID to embed in output (for cloud workflows)')
    .action(async (workflowFile: string, options: ComfyNodeMappingOptions) => {
      try {
        const filePath = path.resolve(workflowFile);
        const workflowDir = path.dirname(filePath);
        const workflowBasename = path.basename(filePath, path.extname(filePath));

        if (!fs.existsSync(filePath)) {
          logger.error(`Workflow file not found: ${filePath}`);
          process.exit(1);
        }

        let workflow: Record<string, any>;
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          workflow = JSON.parse(raw);
        } catch (err: any) {
          logger.error(`Failed to parse workflow JSON: ${err.message}`);
          process.exit(1);
        }

        const prefix = options.prefix || 'opsv-';
        const nodeMappings = extractMappings(workflow, prefix);

        // Detect duplicate nodeId+fieldName targets
        const seenTargets = new Set<string>();
        for (const [key, val] of Object.entries(nodeMappings)) {
          const target = `${val.nodeId}:${val.fieldName}`;
          if (seenTargets.has(target)) {
            logger.warn(`Duplicate mapping target: "${key}" maps to node ${val.nodeId}.${val.fieldName} which is already used by another key`);
          }
          seenTargets.add(target);
        }

        if (Object.keys(nodeMappings).length === 0) {
          logger.warn(`No nodes with title prefix "${prefix}" found in ${path.basename(filePath)}`);
          logger.warn(`Tip: Rename nodes in ComfyUI (right-click → Title) to use prefix "${prefix}"`);
        } else {
          console.log(chalk.cyan(`\nFound ${Object.keys(nodeMappings).length} opsv-mapped node(s):`));
          for (const [key, val] of Object.entries(nodeMappings)) {
            console.log(`  ${chalk.green(key)} → nodeId=${val.nodeId}, fieldName=${val.fieldName}`);
          }
        }

        const output: OpsvWorkflowMeta = {
          workflowId: options.workflowId || null,
          workflowPath: path.relative(process.cwd(), filePath),
          nodeMappings,
          opsvVersion: pkgVersion,
        };

        const json = JSON.stringify(output, null, 2);

        if (options.output) {
          const outPath = path.resolve(options.output);
          fs.writeFileSync(outPath, json + '\n');
          console.log(chalk.green(`\nSaved: ${outPath}`));
        } else {
          console.log(chalk.cyan('\n--- opsv-workflow.json ---'));
          console.log(json);
          console.log(chalk.cyan('----------------------------'));
          console.log(chalk.gray('Save with: opsv comfy-node-mapping <workflow-file> -o <path>.opsv-workflow.json'));
          if (options.workflowId) {
            console.log(chalk.gray('Or add --workflow-id to embed RunningHub ID in the output'));
          }
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

function extractMappings(workflow: Record<string, any>, prefix: string): MappingResult {
  const mappings: MappingResult = {};

  // Fields that carry semantic content (not internal controls)
  const skipFields = new Set(['strip_newlines', 'seed']);

  for (const nodeId in workflow) {
    if (nodeId === '_opsv_workflow') continue;

    const node = workflow[nodeId];
    if (!node || typeof node !== 'object') continue;

    const title = node._meta?.title || node.title || '';
    if (!title || !title.startsWith(prefix)) continue;

    const mappingKey = title.slice(prefix.length);
    if (!mappingKey) {
      logger.warn(`Skipping node ${nodeId}: title "${title}" has empty key after prefix`);
      continue;
    }

    const inputs = node.inputs;
    if (!inputs || typeof inputs !== 'object') {
      logger.warn(`Skipping node ${nodeId} ("${title}"): no inputs`);
      continue;
    }

    const inputKeys = Object.keys(inputs).filter(k => !skipFields.has(k));
    if (inputKeys.length === 0) {
      logger.warn(`Skipping node ${nodeId} ("${title}"): no configurable inputs`);
      continue;
    }

    // Output each input field as a separate mapping entry
    for (const fieldName of inputKeys) {
      const entryKey = inputKeys.length === 1 ? mappingKey : `${mappingKey}.${fieldName}`;
      mappings[entryKey] = { nodeId, fieldName };
    }
  }

  return mappings;
}
