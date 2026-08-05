import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { checkPack, PackCheckReport } from '../core/PackChecker';
import { loadProjectConfig, readPackLock, resolvePacks, syncPackSkillShims, writePackLock } from '../core/ProjectConfig';
import { logger } from '../utils/logger';

function renderReport(report: PackCheckReport): void {
  const label = report.pack.id ? `${report.pack.id}@${report.pack.version ?? '?'}` : report.pack.root;
  if (report.issues.length === 0) {
    console.log(chalk.green(`${label}: 0 issues`));
    return;
  }
  for (const issue of report.issues) {
    const color = issue.severity === 'error' ? chalk.red : chalk.yellow;
    console.log(color(`${issue.severity.toUpperCase()} ${issue.code} ${issue.path}: ${issue.message}`));
  }
  const errors = report.issues.filter(i => i.severity === 'error').length;
  const warnings = report.issues.length - errors;
  console.log((errors ? chalk.red : chalk.yellow)(`${label}: ${errors} error(s), ${warnings} warning(s)`));
}

export function registerPackCommands(program: Command): void {
  const pack = program.command('pack').description('Inspect and lock declarative OPSV Packs');

  pack.command('list').description('List resolved project Packs').action(() => {
    try {
      const packs = resolvePacks(process.cwd());
      if (packs.length === 0) {
        console.log(chalk.yellow('No Packs declared in .opsv/project.yaml.'));
        return;
      }
      for (const item of packs) {
        console.log(`${item.manifest.id}@${item.manifest.version}  ${item.root}`);
      }
      const lockResult = readPackLock(process.cwd());
      if (lockResult?.diagnostic) {
        console.log(chalk.yellow(`${lockResult.diagnostic.code}: ${lockResult.diagnostic.message}`));
      }
    } catch (error: any) {
      logger.error(error.message);
      process.exitCode = 1;
    }
  });

  pack.command('check [path]')
    .description('Validate Pack schemas and cross-file contracts')
    .option('--json', 'Print machine-readable JSON report on stdout')
    .action((packPath: string | undefined, options: { json?: boolean }) => {
      try {
        const reports: PackCheckReport[] = packPath
          ? [checkPack(path.resolve(process.cwd(), packPath))]
          : resolvePacks(process.cwd()).map(resolved => checkPack(resolved.root));
        if (reports.length === 0) throw new Error('No Packs declared in .opsv/project.yaml and no path given.');
        if (options.json) {
          // stdout carries machine JSON only; human diagnostics stay on stderr.
          console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
        } else {
          for (const report of reports) renderReport(report);
        }
        if (reports.some(report => !report.ok)) process.exitCode = 1;
      } catch (error: any) {
        logger.error(error.message);
        process.exitCode = 1;
      }
    });

  pack.command('lock').description('Resolve Packs and write .opsv/pack-lock.yaml').action(() => {
    try {
      const projectRoot = process.cwd();
      const config = loadProjectConfig(projectRoot);
      const packs = resolvePacks(projectRoot, config);
      const invalid = packs.map(resolved => checkPack(resolved.root)).filter(report => !report.ok);
      if (invalid.length > 0) {
        for (const report of invalid) renderReport(report);
        logger.error('Pack contract errors must be fixed before locking. Run: opsv pack check --json');
        process.exitCode = 1;
        return;
      }
      const lockPath = writePackLock(projectRoot, packs);
      console.log(chalk.green(`Locked ${packs.length} Pack(s): ${lockPath}`));
    } catch (error: any) {
      logger.error(error.message);
      process.exitCode = 1;
    }
  });

  pack.command('sync-skills')
    .description('Synchronize platform discovery shims to canonical Pack Skills')
    .option('--platform <platform>', 'agents or codex', 'agents')
    .action((options: { platform: string }) => {
      try {
        if (options.platform !== 'agents' && options.platform !== 'codex') throw new Error('--platform must be agents or codex');
        const projectRoot = process.cwd();
        const targets = syncPackSkillShims(projectRoot, options.platform, resolvePacks(projectRoot));
        for (const target of targets) console.log(chalk.green(`Linked: ${target}`));
      } catch (error: any) { logger.error(error.message); process.exitCode = 1; }
    });
}
