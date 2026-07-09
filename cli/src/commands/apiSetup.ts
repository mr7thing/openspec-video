// ============================================================================
// OpsV `opsv api-setup`
// Configure API providers and keys.
// Interactive mode (no flags): show status, prompt for missing keys.
// Agent mode: --list, --set-key, --add-model, --sync-env
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import readline from 'readline';
import { OpsVContext } from '../container/OpsVContext';
import { Container } from '../container/Container';
import { readEnvFile, setEnvKey, getMissingEnvKeys, resolveEnvPath, ensureMasterKey, migrateEnvToEncrypted } from '../utils/envManager';
import { validateModelConfig, appendModelToConfig, resolveConfigPath } from '../utils/configWriter';
import { logger } from '../utils/logger';

interface ApiSetupOptions {
  list?: boolean;
  setKey?: string;
  addModel?: string;
  addModelFile?: string;
  syncEnv?: boolean;
}

/**
 * Build a status table: for each model, check if its required_env keys are set.
 */
function buildStatusTable(ctx: OpsVContext): {
  rows: Array<{ modelKey: string; provider: string; keys: string[]; missing: string[] }>;
  allMissing: Set<string>;
} {
  const config = ctx.config;
  const envPath = resolveEnvPath(ctx.projectRoot);
  const env = readEnvFile(envPath);
  const allMissing = new Set<string>();
  const rows: Array<{ modelKey: string; provider: string; keys: string[]; missing: string[] }> = [];

  for (const [modelKey, modelConfig] of Object.entries(config.models || {})) {
    const required = modelConfig.required_env || [];
    if (required.length === 0) {
      // Models without required_env (like comfylocal) still shown for info
      rows.push({ modelKey, provider: modelConfig.provider, keys: [], missing: [] });
      continue;
    }
    const missing = required.filter((k: string) => !env[k]);
    for (const k of missing) allMissing.add(k);
    rows.push({ modelKey, provider: modelConfig.provider, keys: required, missing });
  }

  return { rows, allMissing };
}

/**
 * Prompt user for a value (with hidden input style).
 */
function promptValue(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Render the status table to console.
 */
function printStatusTable(
  rows: Array<{ modelKey: string; provider: string; keys: string[]; missing: string[] }>,
  allMissing: Set<string>
): void {
  // Group by provider for cleaner output
  const byProvider = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byProvider.has(r.provider)) byProvider.set(r.provider, []);
    byProvider.get(r.provider)!.push(r);
  }

  console.log(chalk.cyan(`\n📋 API Key Status (${rows.length} models, ${allMissing.size} keys missing)\n`));

  for (const [provider, providerRows] of byProvider) {
    console.log(chalk.bold(`  ${provider}:`));
    for (const r of providerRows) {
      if (r.keys.length === 0) {
        console.log(chalk.gray(`    ${r.modelKey}  — no API key required`));
      } else {
        const statusParts = r.keys.map((k) => {
          if (r.missing.includes(k)) return chalk.red(`${k}=❌`);
          return chalk.green(`${k}=✅`);
        });
        console.log(`    ${r.modelKey}  ${statusParts.join('  ')}`);
      }
    }
    console.log('');
  }
}

/**
 * Interactive mode: prompt user for all missing keys.
 */
async function interactiveMode(ctx: OpsVContext): Promise<void> {
  const { rows, allMissing } = buildStatusTable(ctx);
  printStatusTable(rows, allMissing);

  if (allMissing.size === 0) {
    console.log(chalk.green('✅ All API keys are configured.'));
    return;
  }

  const answer = await promptValue(chalk.yellow('补全缺失的 API Key？[Y/n] '));
  if (answer.toLowerCase() === 'n') {
    console.log(chalk.gray('跳过。'));
    return;
  }

  const envPath = resolveEnvPath(ctx.projectRoot);
  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(envPath), { recursive: true });

  // Auto-init master.key + migrate existing plaintext .env
  ensureMasterKey();
  migrateEnvToEncrypted(envPath);

  const sortedMissing = Array.from(allMissing).sort();
  for (const envVar of sortedMissing) {
    const val = await promptValue(chalk.cyan(`  请输入 ${envVar}: `));
    if (val) {
      setEnvKey(envPath, envVar, val);
    }
  }

  console.log(chalk.green(`\n✅ 已写入 ${envPath}`));

  // Show updated status
  const { rows: updatedRows, allMissing: stillMissing } = buildStatusTable(ctx);
  printStatusTable(updatedRows, stillMissing);
  if (stillMissing.size === 0) {
    console.log(chalk.green('✅ 所有 API Key 已配置完成。'));
  } else {
    console.log(chalk.yellow(`⚠  仍有 ${stillMissing.size} 个 key 未设置。`));
  }
  console.log(chalk.yellow('💡 Run "opsv env load" to reload into the current session.'));
}

/**
 * --list mode: output JSON status (agent-friendly).
 */
function listMode(ctx: OpsVContext): void {
  const { rows, allMissing } = buildStatusTable(ctx);
  const output = {
    projectRoot: ctx.projectRoot,
    models: rows.map((r) => ({
      modelKey: r.modelKey,
      provider: r.provider,
      keys: r.keys,
      missing: r.missing,
      configured: r.missing.length === 0,
    })),
    summary: {
      total: rows.length,
      fullyConfigured: rows.filter((r) => r.missing.length === 0 || r.keys.length === 0).length,
      missingKeys: Array.from(allMissing),
    },
  };
  console.log(JSON.stringify(output, null, 2));
}

/**
 * --set-key mode: set a single KEY=VALUE in .env.
 */
function setKeyMode(ctx: OpsVContext, kv: string): void {
  const eqIndex = kv.indexOf('=');
  if (eqIndex === -1) {
    console.error(chalk.red(`Invalid format: "${kv}". Use KEY=VALUE (e.g. RH_API_KEY=sk-xxx)`));
    process.exit(1);
  }
  const key = kv.slice(0, eqIndex).trim();
  const value = kv.slice(eqIndex + 1).trim();
  if (!key || !value) {
    console.error(chalk.red('Key and value must not be empty.'));
    process.exit(1);
  }

  const envPath = resolveEnvPath(ctx.projectRoot);
  fs.mkdirSync(path.dirname(envPath), { recursive: true });

  // Auto-init master.key + migrate existing plaintext .env
  ensureMasterKey();
  migrateEnvToEncrypted(envPath);

  setEnvKey(envPath, key, value);
  console.log(chalk.green(`✅ ${key}=${value}  →  ${envPath}`));
  console.log(chalk.yellow('💡 Run "opsv env load" to reload into the current session.'));
}

/**
 * --add-model mode: add a new comfylocal or runninghub model config.
 */
function addModelMode(ctx: OpsVContext, jsonStr: string): void {
  let input: { modelKey: string; config: Record<string, any> };
  try {
    input = JSON.parse(jsonStr);
  } catch {
    console.error(chalk.red('--add-model requires valid JSON.'));
    process.exit(1);
  }

  if (!input.modelKey || !input.config) {
    console.error(chalk.red('JSON must contain "modelKey" (string) and "config" (object).'));
    process.exit(1);
  }

  // Validate
  const errors = validateModelConfig(input.modelKey, input.config);
  if (errors.length > 0) {
    console.error(chalk.red(`Validation failed for "${input.modelKey}":`));
    for (const e of errors) {
      console.error(chalk.red(`  - ${e}`));
    }
    process.exit(1);
  }

  // Append to project api_config.yaml
  const configPath = resolveConfigPath(ctx.projectRoot);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  const result = appendModelToConfig(configPath, input.modelKey, input.config);
  if (result.success) {
    console.log(chalk.green(`✅ ${result.message}`));

    // If runninghub or rhapi, remind user about API key
    const provider = input.config.provider;
    if (provider === 'runninghub' || provider === 'rhapi') {
      const missingKey = provider === 'runninghub' ? 'RUNNINGHUB_API_KEY' : 'RH_API_KEY';
      const envPath = resolveEnvPath(ctx.projectRoot);
      const env = readEnvFile(envPath);
      if (!env[missingKey]) {
        console.log(chalk.yellow(`⚠  ${missingKey} not set in .env. Run:`));
        console.log(chalk.yellow(`   opsv api-setup --set-key ${missingKey}=your_key`));
      }
    }
  } else {
    console.error(chalk.red(`❌ ${result.message}`));
    process.exit(1);
  }
}

/**
 * --sync-env mode: scan all models and add missing env vars as placeholders.
 */
function syncEnvMode(ctx: OpsVContext): void {
  const config = ctx.config;
  const envPath = resolveEnvPath(ctx.projectRoot);
  fs.mkdirSync(path.dirname(envPath), { recursive: true });

  // Auto-init master.key + migrate existing plaintext .env
  ensureMasterKey();
  migrateEnvToEncrypted(envPath);

  const requiredVars = new Set<string>();
  for (const modelConfig of Object.values(config.models || {})) {
    const required = modelConfig.required_env || [];
    for (const k of required) requiredVars.add(k);
  }

  const env = readEnvFile(envPath);
  let added = 0;
  for (const envVar of requiredVars) {
    if (!env[envVar]) {
      setEnvKey(envPath, envVar, 'your_key_here');
      added++;
    }
  }

  if (added > 0) {
    console.log(chalk.green(`✅ Added ${added} placeholder(s) to ${envPath}`));
    console.log(chalk.gray('   Edit the file to set your actual API keys.'));
    console.log(chalk.yellow('💡 Run "opsv env load" to reload into the current session.'));
  } else {
    console.log(chalk.green('✅ All required env vars are already present.'));
  }
}

export function registerApiSetupCommand(program: Command): void {
  program
    .command('api-setup')
    .description('Configure API providers and keys')
    .option('--list', 'List all models and their key status (JSON output)')
    .option('--set-key <kv>', 'Set/update an API key (e.g. RH_API_KEY=sk-xxx)')
    .option('--add-model <json>', 'Add a new comfylocal or runninghub model config (JSON string)')
    .option('--add-model-file <path>', 'Add a new model config from a JSON file')
    .option('--sync-env', 'Scan api_config and add missing keys to .env as placeholders')
    .action(async (options: ApiSetupOptions) => {
      try {
        const ctx = OpsVContext.create(process.cwd());
        ctx.configLoader.loadConfig(ctx.projectRoot);

        // Mode dispatch
        if (options.list) {
          listMode(ctx);
        } else if (options.setKey) {
          setKeyMode(ctx, options.setKey);
        } else if (options.addModelFile) {
          const filePath = path.resolve(options.addModelFile);
          if (!fs.existsSync(filePath)) {
            console.error(chalk.red(`File not found: ${filePath}`));
            process.exit(1);
          }
          addModelMode(ctx, fs.readFileSync(filePath, 'utf-8'));
        } else if (options.addModel) {
          addModelMode(ctx, options.addModel);
        } else if (options.syncEnv) {
          syncEnvMode(ctx);
        } else {
          await interactiveMode(ctx);
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}
