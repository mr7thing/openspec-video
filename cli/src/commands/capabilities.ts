import { Command } from 'commander';
import chalk from 'chalk';
import { discoverCapabilities } from '../canonical/capabilities/CapabilityRegistry';
import { logger } from '../utils/logger';

export function registerCapabilitiesCommand(program: Command): void {
  program
    .command('capabilities')
    .description('List available capabilities and their provider bindings (Capability Registry)')
    .option('--json', 'emit structured JSON')
    .action((opts: any) => {
      try {
        const registry = discoverCapabilities(process.cwd());
        if (opts.json) {
          const output: Record<string, { available: boolean; providers: Array<{ modelKey: string; provider: string; type: string }> }> = {};
          for (const [id, info] of Object.entries(registry)) {
            output[id] = { available: info.available, providers: info.providers };
          }
          console.log(JSON.stringify(output, null, 2));
          return;
        }
        const ids = Object.keys(registry).sort();
        if (ids.length === 0) {
          console.log(chalk.gray('No capabilities discovered. Configure models in api_config.yaml or bindings in .opsv/project.yaml.'));
          return;
        }
        for (const id of ids) {
          const info = registry[id];
          const mark = info.available ? chalk.green('✓') : chalk.yellow('✗');
          const providers = info.providers.map((p) => `${p.modelKey} (${p.provider})`).join(', ') || chalk.gray('(none bound)');
          console.log(`${mark} ${chalk.bold(id)} — ${providers}`);
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}
