import { Command } from 'commander';
import chalk from 'chalk';
import { SyncService } from '../core/SyncService';
import { logger } from '../utils/logger';

export function registerSyncCommand(program: Command): void {
  program
    .command('sync <asset>')
    .description('Validate and finalize a freely reconciled syncing Asset Document')
    .action((asset: string) => {
      try {
        const result = new SyncService(process.cwd()).sync(asset);
        const history = result.snapshotCreated || result.commitCreated ? 'document history committed' : 'document already committed';
        console.log(chalk.green(`Synchronized ${asset}: ${history}`));
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}
