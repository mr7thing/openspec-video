import { BatchManifestManager, TaskStatus } from '../core/queue/BatchManifestManager';
import { logger } from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs/promises';

type TaskHandler = (task: any) => Promise<any>;

export class QueueWatcher {
  private manager: BatchManifestManager | null = null;
  private handler: TaskHandler;
  private isWatching: boolean = false;
  private pollIntervalMs: number;
  private currentTaskId: string | null = null;
  private isShuttingDown: boolean = false;
  
  private baseQueueDir: string;
  private provider: string;
  private cycle: string;

  constructor(baseQueueDir: string, provider: string, handler: TaskHandler, pollIntervalMs = 5000, cycle = 'ZeroCircle_1') {
    this.baseQueueDir = baseQueueDir;
    this.provider = provider;
    this.handler = handler;
    this.pollIntervalMs = pollIntervalMs;
    this.cycle = cycle;
  }

  async start() {
    this.isWatching = true;
    this.isShuttingDown = false;
    this.setupGracefulShutdown();
    
    // Auto-discover the active batch
    const providerDir = path.join(this.baseQueueDir, this.cycle, this.provider);
    try {
        const entries = await fs.readdir(providerDir);
        const batchFolders = entries.filter(e => e.startsWith('queue_'));
        if (batchFolders.length === 0) {
            console.log(`[QueueWatcher] No batches found for ${this.provider} in ${this.cycle}. Waiting...`);
        } else {
            const nums = batchFolders.map(f => parseInt(f.replace('queue_', ''))).filter(n => !isNaN(n));
            const latestBatch = Math.max(...nums);
            const batchDir = path.join(providerDir, `queue_${latestBatch}`);
            this.manager = new BatchManifestManager(batchDir);
            console.log(`[QueueWatcher] Started watching ${this.provider} in ${batchDir}`);
        }
    } catch (e) {
        console.warn(`[QueueWatcher] Provider dir not ready: ${providerDir}`);
    }

    this.poll();
  }

  private setupGracefulShutdown() {
    const shutdownHandler = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      this.isWatching = false;

      console.log(`[QueueWatcher] Received ${signal}. Graceful shutdown...`);
      if (this.currentTaskId && this.manager) {
        console.log(`[QueueWatcher] Returning task ${this.currentTaskId} to pending.`);
        await this.manager.updateTaskStatus(this.currentTaskId, 'pending', { info: 'Shutdown interrupted' });
      }
      process.exit(0);
    };
    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  }

  private async poll() {
    if (!this.isWatching || this.isShuttingDown) return;

    try {
      // Re-initialize manager if it was missing (dir created later)
      if (!this.manager) {
          const providerDir = path.join(this.baseQueueDir, this.cycle, this.provider);
          const entries = await fs.readdir(providerDir).catch(() => []);
          const batchFolders = entries.filter(e => e.startsWith('queue_'));
          if (batchFolders.length > 0) {
              const nums = batchFolders.map(f => parseInt(f.replace('queue_', ''))).filter(n => !isNaN(n));
              const batchDir = path.join(providerDir, `queue_${Math.max(...nums)}`);
              this.manager = new BatchManifestManager(batchDir);
          }
      }

      const task = await this.manager?.getNextPendingTask();
      if (task) {
        this.currentTaskId = task.id;
        console.log(`[QueueWatcher] Processing task ${task.id}`);
        
        // Mark as processing in manifest
        await this.manager?.updateTaskStatus(task.id, 'processing');
        
        try {
          // Get pure intention JSON
          const intention = await this.manager?.getTaskIntention(task.id);
          
          // Execute handler (Note: Provider needs to know the final outputPath)
          // We pass a virtual 'SpoolerTask' like object for compatibility
          const virtualTask = {
              uuid: task.id,
              payload: { job: { ...intention, id: task.id } },
              // In v0.6.2, we tell the provider EXACTLY where to put the file
              outputPath: path.join((this.manager as any).batchDir, `${task.id}.${intention.job?.type === 'video_generation' ? 'mp4' : 'png'}`)
          };

          const result = await this.handler(virtualTask);
          await this.manager?.updateTaskStatus(task.id, 'completed', result);
          console.log(`[QueueWatcher] Task ${task.id} completed.`);
        } catch (err: any) {
          console.error(`[QueueWatcher] Task ${task.id} failed:`, err.message);
          await this.manager?.updateTaskStatus(task.id, 'failed', { error: err.message });
        } finally {
          this.currentTaskId = null;
        }

        setImmediate(() => this.poll());
        return;
      }
    } catch (err) {
      console.error(`[QueueWatcher] Polling error:`, err);
    }

    setTimeout(() => this.poll(), this.pollIntervalMs);
  }
}

