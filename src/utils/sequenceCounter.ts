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
     * Get the next global sequence for a job ID across all opsv-queue directories.
     * This scans the entire opsv-queue tree to find the max sequence.
     * @param projectRoot the root of the project
     * @param baseJobId the job ID (e.g. shot_01)
     */
    public async getNextGlobalSequence(projectRoot: string, baseJobId: string): Promise<number> {
        const opsvQueueDir = path.join(projectRoot, 'opsv-queue');
        let maxSeq = 0;

        const scanDir = async (dir: string) => {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await scanDir(fullPath);
                    } else {
                        // Match files like shot_01_1.mp4, shot_01_2.png
                        const regex = new RegExp(`^${baseJobId}_(\\d+)\\.\\w+$`);
                        const match = entry.name.match(regex);
                        if (match) {
                            const seq = parseInt(match[1]);
                            if (seq > maxSeq) {
                                maxSeq = seq;
                            }
                        }
                    }
                }
            } catch (e) {
                // Directory doesn't exist or inaccessible, ignore
            }
        };

        await scanDir(opsvQueueDir);
        return maxSeq + 1;
    }
}
