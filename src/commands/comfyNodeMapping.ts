// ============================================================================
// OpsV v0.9 — opsv comfy-node-mapping
// Analyzes a ComfyUI API workflow JSON and extracts opsv- prefixed nodes
// into a node_mappings object ready for api_config.yaml
// ============================================================================

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { logger } from '../utils/logger';

interface NodeMapping {
  nodeId: string;
  fieldName: string;
}

interface MappingResult {
  [key: string]: NodeMapping;
}

const FIELD_PRIORITY = [
  'text', 'image', 'video', 'audio', 'seed', 'width', 'height',
];

export function registerComfyNodeMappingCommand(program: Command): void {
  program
    .command('comfy-node-mapping <workflow-file>')
    .description('Analyze ComfyUI workflow JSON and emit node_mappings for api_config')
    .option('-o, --output <path>', 'Write JSON output to file (default: stdout)')
    .option('--prefix <str>', 'Node title prefix to match', 'opsv-')
    .action(async (workflowFile: string, options: any) => {
      try {
        const filePath = path.resolve(workflowFile);

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
        const mappings = extractMappings(workflow, prefix);

        if (Object.keys(mappings).length === 0) {
          logger.warn(`No nodes with title prefix "${prefix}" found in ${path.basename(filePath)}`);
          logger.warn(`Tip: Rename nodes in ComfyUI (right-click → Title) to use prefix "${prefix}"`);
        } else {
          console.log(chalk.cyan(`\nFound ${Object.keys(mappings).length} opsv-mapped node(s):`));
          for (const [key, val] of Object.entries(mappings)) {
            console.log(`  ${chalk.green(key)} → nodeId=${val.nodeId}, fieldName=${val.fieldName}`);
          }
        }

        const json = JSON.stringify(mappings, null, 2);

        if (options.output) {
          const outPath = path.resolve(options.output);
          fs.writeFileSync(outPath, json + '\n');
          console.log(chalk.green(`\nSaved to ${outPath}`));
        } else {
          console.log(chalk.cyan('\n--- node_mappings JSON ---'));
          console.log(json);
          console.log(chalk.cyan('--------------------------'));
          console.log(chalk.gray('Copy the JSON above into your api_config.yaml under node_mappings:'));
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

function extractMappings(workflow: Record<string, any>, prefix: string): MappingResult {
  const mappings: MappingResult = {};

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

    const fieldName = inferFieldName(node);
    if (!fieldName) {
      logger.warn(`Skipping node ${nodeId} ("${title}"): could not infer fieldName from inputs`);
      continue;
    }

    mappings[mappingKey] = { nodeId, fieldName };
  }

  return mappings;
}

function inferFieldName(node: any): string | null {
  const inputs = node.inputs;
  if (!inputs || typeof inputs !== 'object') return null;

  const keys = Object.keys(inputs);
  if (keys.length === 0) return null;

  for (const priority of FIELD_PRIORITY) {
    if (keys.includes(priority)) return priority;
  }

  return keys[0];
}
