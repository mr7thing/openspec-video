import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs-extra';
import path from 'path';

const PORT = 3000;
const WORKSPACE_ROOT = process.cwd(); // Daemon is spawned in project root
const PID_FILE = path.join(WORKSPACE_ROOT, '.opsv', 'daemon.pid');
const QUEUE_FILE = path.join(WORKSPACE_ROOT, 'queue', 'jobs.json');

// Interface for messages
interface ClientMessage {
    type: 'GET_JOBS' | 'SAVE_ASSET' | 'UPDATE_JOB_STATUS' | 'HEARTBEAT';
    payload?: any;
}

interface AssetPayload {
    path: string; // Relative to project root, e.g. "videospec/assets/characters/hero.png"
    data: string; // Base64 encoded string
}

console.log(`[OpsV Daemon] Starting in ${WORKSPACE_ROOT}...`);

// 1. Setup PID file
try {
    fs.ensureDirSync(path.dirname(PID_FILE));
    fs.writeFileSync(PID_FILE, process.pid.toString());
    console.log(`[OpsV Daemon] PID ${process.pid} written to ${PID_FILE}`);
} catch (error) {
    console.error('[OpsV Daemon] Failed to write PID file:', error);
    process.exit(1);
}

// 2. Start WebSocket Server
const wss = new WebSocketServer({ port: PORT });

wss.on('listening', () => {
    console.log(`[OpsV Daemon] Listening on ws://localhost:${PORT}`);
});

wss.on('connection', (ws) => {
    console.log('[OpsV Daemon] Client connected');

    ws.on('message', async (message: string) => {
        try {
            const msg: ClientMessage = JSON.parse(message.toString());
            handleMessage(ws, msg);
        } catch (err) {
            console.error('[OpsV Daemon] Invalid message:', err);
        }
    });

    ws.on('close', () => {
        console.log('[OpsV Daemon] Client disconnected');
    });

    // Send initial status
    ws.send(JSON.stringify({ type: 'WELCOME', payload: { status: 'connected', version: '0.1.1' } }));
});

// 3. Message Handlers
async function handleMessage(ws: WebSocket, msg: ClientMessage) {
    switch (msg.type) {
        case 'GET_JOBS':
            await handleGetJobs(ws);
            break;
        case 'SAVE_ASSET':
            await handleSaveAsset(ws, msg.payload as AssetPayload);
            break;
        case 'HEARTBEAT':
            ws.send(JSON.stringify({ type: 'HEARTBEAT_ACK' }));
            break;
        default:
            console.warn(`[OpsV Daemon] Unknown message type: ${msg.type}`);
    }
}

async function handleGetJobs(ws: WebSocket) {
    if (fs.existsSync(QUEUE_FILE)) {
        try {
            const jobs = fs.readJsonSync(QUEUE_FILE);
            ws.send(JSON.stringify({ type: 'JOBS_LIST', payload: jobs }));
            console.log(`[OpsV Daemon] Sent ${jobs.length} jobs to client`);
        } catch (err) {
            console.error('[OpsV Daemon] Error reading queue:', err);
            ws.send(JSON.stringify({ type: 'ERROR', payload: 'Failed to read job queue' }));
        }
    } else {
        ws.send(JSON.stringify({ type: 'JOBS_LIST', payload: [] }));
        console.log('[OpsV Daemon] Queue file not found, sending empty list');
    }
}

interface AssetRequestPayload {
    path: string;
    assetId: string;
}

async function handleGetAsset(ws: WebSocket, payload: AssetRequestPayload) {
    if (!payload.path) {
        ws.send(JSON.stringify({ type: 'ERROR', payload: 'Missing path for GET_ASSET' }));
        return;
    }

    // Security check: simple path traversal prevention
    const fullPath = path.join(WORKSPACE_ROOT, payload.path);
    const relative = path.relative(WORKSPACE_ROOT, fullPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        console.error('[OpsV Daemon] Security Block: Attempted path traversal', payload.path);
        ws.send(JSON.stringify({ type: 'ERROR', payload: 'Access denied: Path outside project root' }));
        return;
    }

    try {
        if (fs.existsSync(fullPath)) {
            const fileData = await fs.readFile(fullPath);
            const base64Data = fileData.toString('base64');
            const ext = path.extname(fullPath).substring(1); // e.g. png
            const mimeType = ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream');

            console.log(`[OpsV Daemon] Serving asset: ${relative}`);
            ws.send(JSON.stringify({
                type: 'ASSET_DATA',
                payload: {
                    assetId: payload.assetId,
                    data: `data:${mimeType};base64,${base64Data}`,
                    path: payload.path
                }
            }));
        } else {
            console.error('[OpsV Daemon] Asset not found:', fullPath);
            ws.send(JSON.stringify({ type: 'ERROR', payload: `Asset not found: ${payload.path}` }));
        }
    } catch (err) {
        console.error('[OpsV Daemon] Failed to read asset:', err);
        ws.send(JSON.stringify({ type: 'ERROR', payload: 'Failed to read asset file' }));
    }
}

async function handleSaveAsset(ws: WebSocket, payload: AssetPayload) {
    if (!payload.path || !payload.data) {
        console.error('[OpsV Daemon] Save failed: Missing path or data', { path: payload.path, dataLength: payload.data ? payload.data.length : 0 });
        ws.send(JSON.stringify({ type: 'ERROR', payload: 'Missing path or data' }));
        return;
    }

    try {
        const fullPath = path.join(WORKSPACE_ROOT, payload.path);

        // Ensure security: prevent directory traversal
        const relative = path.relative(WORKSPACE_ROOT, fullPath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error('Invalid path: External access denied');
        }

        // Decode Base64
        const matches = payload.data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            throw new Error('Invalid base64 string');
        }
        const buffer = Buffer.from(matches[2], 'base64');

        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, buffer);

        console.log(`[OpsV Daemon] Saved asset: ${relative}`);
        ws.send(JSON.stringify({ type: 'ASSET_SAVED', payload: { path: relative } }));

    } catch (err: any) {
        console.error('[OpsV Daemon] Save failed:', err);
        ws.send(JSON.stringify({ type: 'ERROR', payload: `Save failed: ${err.message}` }));
    }
}

// 4. Cleanup on exit
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

function cleanup() {
    console.log('[OpsV Daemon] Shutting down...');
    if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
    }
    process.exit(0);
}
