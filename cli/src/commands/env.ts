// ============================================================================
// OpsV `opsv env` — Environment management
// Subcommands: load, list, init-key
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { resolveProjectRoot } from '../utils/projectResolver';
import {
  resolveUserEnvPath,
  hasMasterKey,
  ensureMasterKey,
  getMasterKeyPath,
  migrateEnvToEncrypted,
} from '../utils/envManager';
import { decryptEnvFile, decryptEnvContent } from '../utils/envCipher';

function getTiers(projectRoot: string): Array<{ label: string; path: string }> {
  return [
    { label: 'User (~/.opsv/.env)', path: resolveUserEnvPath() },
    { label: 'Project (.env)', path: path.join(projectRoot, '.env') },
    { label: 'Project (.opsv/.env)', path: path.join(projectRoot, '.opsv', '.env') },
  ];
}

export function registerEnvCommands(program: Command): void {
  const env = program.command('env').description('Environment variable management');

  // ── opsv env load ──
  env
    .command('load')
    .description('Reload .env files into process.env')
    .option('--dry-run', 'Show what would be loaded without actually setting')
    .action(async (options: { dryRun?: boolean }) => {
      const projectRoot = resolveProjectRoot(process.cwd());
      const tiers = getTiers(projectRoot);

      let totalLoaded = 0;
      const allKeys = new Set<string>();
      const loadedKeys = new Set<string>();

      for (const tier of tiers) {
        if (!fs.existsSync(tier.path)) continue;

        // Read and decrypt if needed
        let plaintext: string | null;
        if (hasMasterKey()) {
          plaintext = decryptEnvFile(tier.path);
        } else {
          plaintext = fs.readFileSync(tier.path, 'utf-8');
        }
        if (!plaintext) continue;

        const parsed = dotenv.parse(plaintext);
        const keys = Object.keys(parsed);
        if (keys.length === 0) continue;

        if (options.dryRun) {
          console.log(chalk.cyan(`\n  ${tier.label}  (${keys.length} keys):`));
          for (const key of keys) {
            const already = loadedKeys.has(key) ? chalk.yellow('  (overrides lower tier)') : '';
            console.log(`    ${key}=${parsed[key]}${already}`);
            loadedKeys.add(key);
          }
        } else {
          for (const [key, value] of Object.entries(parsed)) {
            process.env[key] = value;
            loadedKeys.add(key);
          }
          console.log(chalk.gray(`  Loaded ${keys.length} key(s) from ${tier.label}`));
        }
        totalLoaded += keys.length;
        for (const k of keys) allKeys.add(k);
      }

      if (totalLoaded === 0) {
        console.log(chalk.yellow('No .env files found.'));
        return;
      }

      if (options.dryRun) {
        const fileCount = tiers.filter((t) => fs.existsSync(t.path)).length;
        console.log(chalk.gray(`\n  Total: ${allKeys.size} unique key(s) across ${fileCount} file(s)`));
      } else {
        console.log(chalk.green(`\n✅ Reloaded ${loadedKeys.size} unique key(s) into process.env`));
      }
    });

  // ── opsv env list ──
  env
    .command('list')
    .description('Show env keys defined in .env files (values hidden for security)')
    .action(() => {
      const projectRoot = resolveProjectRoot(process.cwd());
      const tiers = getTiers(projectRoot);

      let anyFound = false;
      for (const tier of tiers) {
        if (!fs.existsSync(tier.path)) continue;

        // Read and decrypt if needed
        let plaintext: string | null;
        if (hasMasterKey()) {
          plaintext = decryptEnvFile(tier.path);
        } else {
          plaintext = fs.readFileSync(tier.path, 'utf-8');
        }
        if (!plaintext) continue;

        const parsed = dotenv.parse(plaintext);
        const keys = Object.keys(parsed);
        if (keys.length === 0) continue;
        anyFound = true;
        console.log(chalk.cyan(`\n${tier.label}:`));
        for (const key of keys) {
          const status = key in process.env && process.env[key]
            ? chalk.green('✅ active')
            : chalk.red('❌ missing');
          console.log(`  ${status}  ${key}`);
        }
      }

      if (!anyFound) {
        console.log(chalk.yellow('No .env files found.'));
      }
    });

  // ── opsv env init-key ──
  env
    .command('init-key')
    .description('Initialize master.key and migrate .env files to encrypted format')
    .option('--dry-run', 'Show which files would be migrated without actually doing it')
    .action(async (options: { dryRun?: boolean }) => {
      if (hasMasterKey()) {
        console.log(chalk.yellow(`master.key already exists at ${getMasterKeyPath()}`));
        if (!options.dryRun) {
          console.log(chalk.gray('Use --dry-run to see migration status.'));
        }
      } else if (!options.dryRun) {
        ensureMasterKey();
        console.log(chalk.green(`✅ master.key created at ${getMasterKeyPath()}`));
      }

      // Scan all three-tier .env files
      const projectRoot = resolveProjectRoot(process.cwd());
      const envFiles = [
        { label: 'User (~/.opsv/.env)', path: resolveUserEnvPath() },
        { label: 'Project (.env)', path: path.join(projectRoot, '.env') },
        { label: 'Project (.opsv/.env)', path: path.join(projectRoot, '.opsv', '.env') },
      ];

      let migrated = 0;
      for (const { label, path: envPath } of envFiles) {
        if (!fs.existsSync(envPath)) {
          if (options.dryRun) {
            console.log(chalk.gray(`  ${label}  — not found, skipped`));
          }
          continue;
        }
        const content = fs.readFileSync(envPath, 'utf-8').trim();
        if (content.startsWith('{')) {
          console.log(chalk.gray(`  ${label}  — already encrypted`));
          continue;
        }
        if (options.dryRun) {
          console.log(chalk.yellow(`  ${label}  → will be migrated`));
          migrated++;
        } else {
          migrateEnvToEncrypted(envPath);
          console.log(chalk.green(`  ${label}  → encrypted ✅`));
          migrated++;
        }
      }

      if (migrated === 0 && !options.dryRun) {
        console.log(chalk.gray('No plaintext .env files to migrate.'));
      } else if (migrated === 0 && options.dryRun) {
        console.log(chalk.gray('All .env files already encrypted.'));
      }
    });
}
