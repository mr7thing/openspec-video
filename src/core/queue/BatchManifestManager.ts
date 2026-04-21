import * as fs from 'fs/promises';
import * as path from 'path';

export interface TaskStatus {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    updatedAt: string;
    log?: any;
    assetPath?: string;
    sequence?: number;
}

export interface BatchManifest {
    version: string;
    provider: string;
    cycle: string;
    batchNum: number;
    tasks: Record<string, TaskStatus>;
}

export class BatchManifestManager {
    private batchDir: string;
    private manifestPath: string;

    constructor(batchDir: string) {
        this.batchDir = batchDir;
        this.manifestPath = path.join(batchDir, 'queue.json');
    }

    /**
     * Initializes the batch directory and the manifest file.
     */
    async init(provider: string, cycle: string, batchNum: number) {
        await fs.mkdir(this.batchDir, { recursive: true });
        const exists = await fs.access(this.manifestPath).then(() => true).catch(() => false);
        if (!exists) {
            const manifest: BatchManifest = {
                version: '0.6.2',
                provider,
                cycle,
                batchNum,
                tasks: {}
            };
            await this.saveManifest(manifest);
        }
    }

    async getManifest(): Promise<BatchManifest> {
        const content = await fs.readFile(this.manifestPath, 'utf-8');
        return JSON.parse(content) as BatchManifest;
    }

    async saveManifest(manifest: BatchManifest) {
        await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    }

    /**
     * Registers a new task intention into the batch.
     */
    async registerTask(taskId: string, intention: any): Promise<string> {
        const jsonPath = path.join(this.batchDir, `${taskId}.json`);
        await fs.writeFile(jsonPath, JSON.stringify(intention, null, 2), 'utf-8');

        const manifest = await this.getManifest();
        manifest.tasks[taskId] = {
            id: taskId,
            status: 'pending',
            updatedAt: new Date().toISOString()
        };
        await this.saveManifest(manifest);
        return jsonPath;
    }

    /**
     * Finds the first pending task in the manifest.
     */
    async getNextPendingTask(): Promise<TaskStatus | null> {
        const manifest = await this.getManifest();
        for (const taskId in manifest.tasks) {
            if (manifest.tasks[taskId].status === 'pending') {
                return manifest.tasks[taskId];
            }
        }
        return null;
    }

    async updateTaskStatus(taskId: string, status: TaskStatus['status'], log?: any, assetPath?: string) {
        const manifest = await this.getManifest();
        if (manifest.tasks[taskId]) {
            manifest.tasks[taskId].status = status;
            manifest.tasks[taskId].updatedAt = new Date().toISOString();
            if (log) manifest.tasks[taskId].log = log;
            if (assetPath) manifest.tasks[taskId].assetPath = assetPath;
            await this.saveManifest(manifest);
        }
    }

    async getTaskIntention(taskId: string): Promise<any> {
        const jsonPath = path.join(this.batchDir, `${taskId}.json`);
        const content = await fs.readFile(jsonPath, 'utf-8');
        return JSON.parse(content);
    }
}
