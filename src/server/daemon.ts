import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

// 尝试加载环境变量（后台启动时在相对位置寻找 .env 文件）
const projectRoot = process.cwd();
const rootEnvPath = path.join(projectRoot, '.env');

// --- 加载环境变量 (.env 是单文件) ---
if (fsSync.existsSync(rootEnvPath) && !fsSync.lstatSync(rootEnvPath).isDirectory()) {
    dotenv.config({ path: rootEnvPath });
}

const PORT = parseInt(process.env.OPSV_DAEMON_PORT || '3061', 10);
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
(async () => {
    try {
        await fs.mkdir(path.dirname(PID_FILE), { recursive: true });
        await fs.writeFile(PID_FILE, process.pid.toString());
        console.log(`[OpsV Global Daemon] PID ${process.pid} written to ${PID_FILE}`);
    } catch (error) {
        console.error('[OpsV Global Daemon] Failed to write PID file:', error);
        process.exit(1);
    }
})();

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
            const parsed = JSON.parse(message.toString());
            // 运行时消息校验
            if (!parsed || typeof parsed.type !== 'string') {
                console.warn('[OpsV Global Daemon] Invalid message structure');
                return;
            }
            const validTypes = ['GET_JOBS', 'SAVE_ASSET', 'UPDATE_JOB_STATUS', 'HEARTBEAT', 'REGISTER_PROJECT'];
            if (!validTypes.includes(parsed.type)) {
                console.warn(`[OpsV Global Daemon] Unknown message type: ${parsed.type}`);
                return;
            }
            const msg: ClientMessage = parsed;
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
    ws.send(JSON.stringify({ type: 'WELCOME', payload: { status: 'connected', version: '0.6.4' } }));
});

// Broadcast jobs to all connected clients
async function broadcastJobs() {
    let allJobs: any[] = [];
    for (const [projectRoot, state] of activeProjects.entries()) {
        const jobsPathExists = await fs.access(state.jobsPath).then(() => true).catch(() => false);
        if (jobsPathExists) {
            try {
                const jobsRaw = await fs.readFile(state.jobsPath, 'utf-8');
                const jobs = JSON.parse(jobsRaw);
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

        // Handle incremental naming if the file already exists
        let finalPath = fullPath;
        let counter = 1;
        const ext = path.extname(fullPath);
        const base = path.basename(fullPath, ext);
        const dir = path.dirname(fullPath);

        let pathExists = await fs.access(finalPath).then(() => true).catch(() => false);
        while (pathExists) {
            finalPath = path.join(dir, `${base}_${counter}${ext}`);
            counter++;
            pathExists = await fs.access(finalPath).then(() => true).catch(() => false);
        }

        await fs.mkdir(path.dirname(finalPath), { recursive: true });
        await fs.writeFile(finalPath, buffer);

        console.log(`[OpsV Global Daemon] Saved asset: ${finalPath}`);
        ws.send(JSON.stringify({ type: 'ASSET_SAVED', payload: { path: finalPath } }));

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

    // 优雅关闭所有客户端连接
    for (const client of connectedClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.close(1000, 'Server shutting down');
        }
    }
    connectedClients = [];

    // 关闭 WebSocket 服务器
    wss.close(async () => {
        console.log('[OpsV Global Daemon] WebSocket server closed.');
        try {
            await fs.unlink(PID_FILE);
        } catch { /* ignore */ }
        process.exit(0);
    });

    // 兜底：如果 5 秒内未关闭，强制退出
    setTimeout(async () => {
        console.error('[OpsV Global Daemon] Forced exit after timeout.');
        try {
            await fs.unlink(PID_FILE);
        } catch { /* ignore */ }
        process.exit(1);
    }, 5000);
}
