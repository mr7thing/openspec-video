import { Command } from 'commander';
import chalk from 'chalk';
import { loadProjectConfig, resolvePacks, syncPackSkillShims, writePackLock } from '../core/ProjectConfig';
import { logger } from '../utils/logger';

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
