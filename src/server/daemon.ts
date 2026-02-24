import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const PORT = 3061;
const PID_FILE = path.join(os.homedir(), '.opsv', 'daemon.pid');

// Registry of active projects
interface ProjectState {
    name: string;
    root: string;
    jobsPath: string;
    lastActive: number;
}
const activeProjects = new Map<string, ProjectState>();

// Interface for messages
interface ClientMessage {
    type: 'GET_JOBS' | 'SAVE_ASSET' | 'UPDATE_JOB_STATUS' | 'HEARTBEAT' | 'REGISTER_PROJECT';
    payload?: any;
}

interface AssetPayload {
    path: string; // Absolute path now
    data: string; // Base64 encoded string
}

console.log(`[OpsV Global Daemon] Starting...`);

// 1. Setup global PID file
try {
    fs.ensureDirSync(path.dirname(PID_FILE));
    fs.writeFileSync(PID_FILE, process.pid.toString());
    console.log(`[OpsV Global Daemon] PID ${process.pid} written to ${PID_FILE}`);
} catch (error) {
    console.error('[OpsV Global Daemon] Failed to write PID file:', error);
    process.exit(1);
}

// 2. Start WebSocket Server
const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });

wss.on('listening', () => {
    console.log(`[OpsV Global Daemon] Listening on ws://127.0.0.1:${PORT}`);
});

let connectedClients: WebSocket[] = [];

wss.on('connection', (ws) => {
    console.log('[OpsV Global Daemon] Client connected');
    connectedClients.push(ws);

    ws.on('message', async (message: string) => {
        try {
            const msg: ClientMessage = JSON.parse(message.toString());
            handleMessage(ws, msg);
        } catch (err) {
            console.error('[OpsV Global Daemon] Invalid message:', err);
        }
    });

    ws.on('close', () => {
        console.log('[OpsV Global Daemon] Client disconnected');
        connectedClients = connectedClients.filter(client => client !== ws);
    });

    // Send initial status
    ws.send(JSON.stringify({ type: 'WELCOME', payload: { status: 'connected', version: '0.1.2' } }));
});

// Broadcast jobs to all connected clients
async function broadcastJobs() {
    let allJobs: any[] = [];
    for (const [projectRoot, state] of activeProjects.entries()) {
        if (fs.existsSync(state.jobsPath)) {
            try {
                const jobs = fs.readJsonSync(state.jobsPath);
                allJobs = allJobs.concat(jobs);
            } catch (err) {
                console.error(`[OpsV Global Daemon] Error reading queue for project ${state.name}:`, err);
            }
        }
    }
    const payload = JSON.stringify({ type: 'JOBS_LIST', payload: allJobs });
    for (const client of connectedClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    }
    console.log(`[OpsV Global Daemon] Broadcasted ${allJobs.length} total jobs`);
}

// 3. Message Handlers
async function handleMessage(ws: WebSocket, msg: ClientMessage) {
    switch (msg.type) {
        case 'REGISTER_PROJECT':
            const regPayload = msg.payload;
            if (regPayload && regPayload.root && regPayload.jobsPath) {
                // Clear previous queue so extension only sees current project
                activeProjects.clear();
                activeProjects.set(regPayload.root, {
                    name: regPayload.name || path.basename(regPayload.root),
                    root: regPayload.root,
                    jobsPath: regPayload.jobsPath,
                    lastActive: Date.now()
                });
                console.log(`[OpsV Global Daemon] Registered project: ${regPayload.name}`);
                await broadcastJobs();
            }
            break;
        case 'GET_JOBS':
            await broadcastJobs(); // This will send to all clients, which is fine, or we can just send to 'ws'
            break;
        case 'SAVE_ASSET':
            await handleSaveAsset(ws, msg.payload as AssetPayload);
            break;
        case 'HEARTBEAT':
            ws.send(JSON.stringify({ type: 'HEARTBEAT_ACK' }));
            break;
        default:
            console.warn(`[OpsV Global Daemon] Unknown message type: ${msg.type}`);
    }
}

async function handleSaveAsset(ws: WebSocket, payload: AssetPayload) {
    if (!payload.path || !payload.data) {
        console.error('[OpsV Global Daemon] Save failed: Missing path or data');
        ws.send(JSON.stringify({ type: 'ERROR', payload: 'Missing path or data' }));
        return;
    }

    try {
        const fullPath = payload.path; // Received path is now expected to be absolute

        // Security check: must be absolute and not point to sensitive system dirs
        if (!path.isAbsolute(fullPath)) {
            throw new Error('Invalid path: Must be absolute path');
        }

        // Optional: Check if the path belongs to any registered project, but for now absolute path is trusted enough since it is local daemon.
        let belongsToProject = false;
        for (const root of activeProjects.keys()) {
            if (fullPath.startsWith(root) || fullPath.replace(/\\/g, '/').startsWith(root.replace(/\\/g, '/'))) {
                belongsToProject = true;
                break;
            }
        }

        if (activeProjects.size > 0 && !belongsToProject) {
            console.warn(`[OpsV Global Daemon] Warning: Saving asset to ${fullPath} which is outside registered projects.`);
        }

        // Decode Base64
        const matches = payload.data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            throw new Error('Invalid base64 string');
        }
        const buffer = Buffer.from(matches[2], 'base64');

        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, buffer);

        console.log(`[OpsV Global Daemon] Saved asset: ${fullPath}`);
        ws.send(JSON.stringify({ type: 'ASSET_SAVED', payload: { path: fullPath } }));

    } catch (err: any) {
        console.error('[OpsV Global Daemon] Save failed:', err);
        ws.send(JSON.stringify({ type: 'ERROR', payload: `Save failed: ${err.message}` }));
    }
}

// 4. Cleanup on exit
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

function cleanup() {
    console.log('[OpsV Global Daemon] Shutting down...');
    if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
    }
    process.exit(0);
}
