import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';
import { spawn } from 'child_process';

const PID_FILE = path.join(os.homedir(), '.opsv', 'daemon.pid');
const DAEMON_SCRIPT = path.join(__dirname, '..', 'server', 'daemon.js');

export async function isDaemonRunning(): Promise<boolean> {
    const pidExists = await fs.access(PID_FILE).then(() => true).catch(() => false);
    if (!pidExists) return false;
    try {
        const pid = parseInt(await fs.readFile(PID_FILE, 'utf-8'));
        process.kill(pid, 0); // Check if process exists
        return true;
    } catch (e) {
        return false;
    }
}

export async function startDaemon() {
    if (await isDaemonRunning()) {
        console.log('Server is already running.');
        return;
    }

    console.log('Starting OpsV Server...');
    const subprocess = spawn('node', [DAEMON_SCRIPT], {
        detached: true,
        stdio: 'ignore', // 'ignore' for true background, or open file for logs
        cwd: process.cwd(),
        env: process.env
    });

    subprocess.unref();
    console.log(`Server started. (PID: ${subprocess.pid})`);
}

export async function stopDaemon() {
    const pidExists = await fs.access(PID_FILE).then(() => true).catch(() => false);
    if (!pidExists) {
        console.log('Server is not running.');
        return;
    }

    try {
        const pid = parseInt(await fs.readFile(PID_FILE, 'utf-8'));
        process.kill(pid);
        await fs.unlink(PID_FILE);
        console.log(`Server stopped (PID: ${pid}).`);
    } catch (e) {
        console.error('Failed to stop server:', e);
    }
}

export function registerProject(projectRoot: string) {
    const port = process.env.OPSV_DAEMON_PORT || '3061';
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => {
        const payload = JSON.stringify({
            type: 'REGISTER_PROJECT',
            payload: {
                name: path.basename(projectRoot),
                root: projectRoot,
                queueDir: path.join(projectRoot, 'opsv-queue')
            }
        });
        ws.send(payload, (err) => {
            if (err) console.error('Failed to register project:', err);
            else console.log(`Project '${path.basename(projectRoot)}' registered with Global Daemon.`);

            // Give Node time to flush the TCP buffer before killing the socket
            setTimeout(() => ws.close(), 100);
        });
    });
    ws.on('error', (err) => {
        console.warn(`Failed to connect to Global Daemon at ${port}: ${err.message}. Ensure it is running to use the extension.`);
    });
}
