// ============================================================================
// OpsV v0.8 — opsv audio [planned]
// ============================================================================

import { Command } from 'commander';

export function registerAudioCommand(program: Command): void {
  program
    .command('audio')
    .description('[planned] Compile audio generation tasks for a specific model')
    .requiredOption('--model <model>', 'Audio model key')
    .option('--dir <path>', 'Project videospec directory', 'videospec')
    .action(async (options: any) => {
      console.log('[opsv audio] [planned] not yet implemented');
    });
}
