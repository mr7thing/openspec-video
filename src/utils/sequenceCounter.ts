import fs from 'fs/promises';
import path from 'path';

export class SequenceCounter {
    private static instance: SequenceCounter;
    
    private constructor() {}

    public static getInstance(): SequenceCounter {
        if (!SequenceCounter.instance) {
            SequenceCounter.instance = new SequenceCounter();
        }
        return SequenceCounter.instance;
    }

    /**
     * Get the next global sequence for a job ID within a specific draft directory.
     * This scans the entire draft directory (across all providers) to find the max sequence.
     * @param projectRoot the root of the project
     * @param draftDirName the name of the draft batch (e.g. "draft_3" or "draft_L2_1")
     * @param baseJobId the job ID (e.g. shot_01)
     * @param extension the file extension we are generating
     */
    public async getNextGlobalSequence(projectRoot: string, draftDirName: string, baseJobId: string): Promise<number> {
        const artifactsDir = path.join(projectRoot, 'artifacts', draftDirName);
        let maxSeq = 0;

        try {
            const providers = await fs.readdir(artifactsDir, { withFileTypes: true });
            
            for (const providerDir of providers) {
                if (!providerDir.isDirectory()) continue;
                
                const providerPath = path.join(artifactsDir, providerDir.name);
                try {
                    const files = await fs.readdir(providerPath);
                    // Match files like shot_01_1.mp4, shot_01_2.png
                    const regex = new RegExp(`^${baseJobId}_(\\d+)\\.\\w+$`);
                    
                    for (const file of files) {
                        const match = file.match(regex);
                        if (match) {
                            const seq = parseInt(match[1]);
                            if (seq > maxSeq) {
                                maxSeq = seq;
                            }
                        }
                    }
                } catch (e) {
                    // Ignore errors if a provider dir is momentarily inaccessible
                }
            }
        } catch (e) {
            // Artifacts dir doesn't exist yet, so we return 1
        }

        return maxSeq + 1;
    }
}
