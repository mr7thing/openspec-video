import { SpoolerQueue } from '../queue/SpoolerQueue';
import { Job, PromptPayload } from '../../types/PromptSchema';

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
     * and pushes it to the correct provider spooler queue.
     */
    async compileAndEnqueue(intent: StandardTaskIntent): Promise<string> {
        // Enqueue the compiled payload to the correct Inbox
        const queue = new SpoolerQueue(this.baseQueueDir, intent.provider);
        await queue.init();
        
        // standard task envelope
        const compiledJob = {
            shotId: intent.job.id,
            job: intent.job,            // pass down the generic job
            provider: intent.provider   // stamp the provider explicitly
        };

        const uuid = await queue.enqueue(compiledJob);
        console.log(`[Standard API Compiler] Compiled Shot ${intent.job.id} -> Queue: ${intent.provider}/${uuid}`);
        return uuid;
    }
}
