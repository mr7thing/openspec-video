import { Command } from 'commander';
import { AnimateGenerator } from '../automation/AnimateGenerator';
import { isDaemonRunning, startDaemon, registerProject } from '../utils/daemonUtils';

export function registerAnimateCommand(program: Command, VERSION: string) {
    program
        .command('animate')
        .description('Generate video animation jobs from Shotlist.md')
        .action(async () => {
            try {
                const projectRoot = process.cwd();
                const generator = new AnimateGenerator(projectRoot);

                console.log('Compiling video jobs from Shotlist.md...');
                const jobs = await generator.generateAnimationJobs();

                if (jobs.length > 0) {
                    if (!isDaemonRunning()) {
                        console.log('Auto-starting OpsV Global Server for video processing...');
                        startDaemon();
                    } else {
                        console.log('OpsV Global Server is already running. Ready for browser extension.');
                    }
                    registerProject(projectRoot);
                }
            } catch (err) {
                console.error('Animation job generation failed:', err);
            }
        });
}
