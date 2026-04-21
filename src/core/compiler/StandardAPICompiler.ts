import { BatchManifestManager } from '../queue/BatchManifestManager';
import { Job } from '../../types/PromptSchema';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface StandardTaskIntent {
    provider: string;       // e.g., 'seadream', 'minimax', 'siliconflow'
    job: Job;
}

export class StandardAPICompiler {
    private baseQueueDir: string;

    constructor(baseQueueDir: string) {
        this.baseQueueDir = baseQueueDir;
    }

    /**
     * Compiles the generic Job into a spooler payload JSON 
     * and pushes it to the correct provider batch directory.
     */
    async compileAndEnqueue(intent: StandardTaskIntent, cycle: string = 'ZeroCircle_1'): Promise<string> {
        const provider = intent.provider;
        const providerDir = path.join(this.baseQueueDir, cycle, provider);
        
        // Find or Create Active Batch
        let batchNum = 1;
        try {
            await fs.mkdir(providerDir, { recursive: true });
            const entries = await fs.readdir(providerDir);
            const batchFolders = entries.filter(e => e.startsWith('queue_'));
            if (batchFolders.length > 0) {
                const nums = batchFolders.map(f => parseInt(f.replace('queue_', ''))).filter(n => !isNaN(n));
                batchNum = Math.max(...nums);
            }
        } catch (e) {}

        const batchDir = path.join(providerDir, `queue_${batchNum}`);
        const manager = new BatchManifestManager(batchDir);
        await manager.init(provider, cycle, batchNum);
        
        // Compile pure intention (Compatible with ComfyUI/Generic inputs)
        const intention = {
            shotId: intent.job.id,
            prompt: intent.job.prompt_en || (intent.job.payload as any).prompt,
            params: (intent.job.payload as any).global_settings || {},
            reference_images: intent.job.reference_images || []
        };

        const taskId = intent.job.id; 
        await manager.registerTask(taskId, intention);
        
        console.log(`[Queue] Enqueued task ${taskId} -> ${cycle}/${provider}/queue_${batchNum}`);
        return taskId;
    }
}
