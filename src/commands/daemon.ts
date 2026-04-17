import { Command } from 'commander';
import { isDaemonRunning, startDaemon, stopDaemon, registerProject } from '../utils/daemonUtils';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PID_FILE = path.join(os.homedir(), '.opsv', 'daemon.pid');

export function registerDaemonCommands(program: Command, VERSION: string) {
    program
        .command('serve')
        .description('Start the OpsV background server')
        .action(async () => {
            if (!isDaemonRunning()) {
                startDaemon();
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                console.log('Server is already running.');
            }
            registerProject(process.cwd());
        });

    program
        .command('start')
        .description('Alias for serve')
        .action(async () => {
            if (!isDaemonRunning()) {
                startDaemon();
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                console.log('Server is already running.');
            }
            registerProject(process.cwd());
        });

    program
        .command('stop')
        .description('Stop the OpsV background server')
        .action(() => {
            stopDaemon();
        });

    program
        .command('status')
        .description('Check OpsV Server status')
        .action(() => {
            if (isDaemonRunning()) {
                const pid = fs.readFileSync(PID_FILE, 'utf-8');
                const port = process.env.OPSV_DAEMON_PORT || '3061';
                console.log(`✅ OpsV Server is RUNNING (PID: ${pid})`);
                console.log(`   Listening on: ws://127.0.0.1:${port}`);
            } else {
                console.log('🔴 OpsV Server is STOPPED');
            }
        });
}
