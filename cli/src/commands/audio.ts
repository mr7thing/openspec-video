// ============================================================================
// OpsV opsv audio [planned]
// ============================================================================

import { Command } from 'commander';

interface AudioCommandOptions {}

export function registerAudioCommand(program: Command): void {
  program
    .command('audio')
    .description('[planned] Compile audio generation tasks for a specific model')
    .requiredOption('--model <model>', 'Audio model key')
    .option('--dir <path>', 'Project videospec directory', 'videospec')
    .action(async (options: AudioCommandOptions) => {
      console.log('[opsv audio] [planned] not yet implemented');
    });
}
