import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { JobGenerator } from '../automation/JobGenerator';

// Start Daemon logic is needed if Daemon is to be started inline. 
// We will import it from a new daemon utility.
import { isDaemonRunning, startDaemon, registerProject } from '../utils/daemonUtils';

export function registerGenerateCommand(program: Command, VERSION: string) {
    program
        .command('generate [targets...]')
        .description('Generate jobs from specific files, directories, or all normative folders by default')
        .option('-p, --preview', 'Generate preview only (key shots / single char sheet)', false)
        .option('--shots <list>', 'Comma-separated list of shot IDs (e.g. 1,5,12)', (val) => val.split(','))
        .action(async (targets, options) => {
            try {
                const projectRoot = process.cwd();

                console.log(`Generating jobs for targets: ${targets && targets.length > 0 ? targets.join(', ') : 'All normative folders'}...`);
                if (options.preview) console.log('👀 Preview Mode Active');
                if (options.shots) console.log(`🎯 Generating specific shots: ${options.shots.join(', ')}`);

                const generator = new JobGenerator(projectRoot);

                const jobs = await generator.generateJobs(targets, {
                    preview: options.preview,
                    shots: options.shots
                });

                console.log(`Successfully generated ${jobs.length} jobs in queue/jobs.json`);

                if (!isDaemonRunning()) {
                    console.log('Auto-starting OpsV Global Server for processing...');
                    startDaemon();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    console.log('OpsV Global Server is already running. Ready for browser extension.');
                }

                registerProject(projectRoot);

            } catch (err) {
                console.error('Generation failed:', err);
            }
        });
}
