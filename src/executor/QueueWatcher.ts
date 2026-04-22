import { BatchManifestManager, TaskStatus } from '../core/queue/BatchManifestManager';
import { logger } from '../utils/logger';
import { SequenceCounter } from '../utils/sequenceCounter';
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
  private targetCircle: string | null; // e.g. "zerocircle_1"

  constructor(baseQueueDir: string, provider: string, handler: TaskHandler, pollIntervalMs = 5000, targetCircle?: string) {
    this.baseQueueDir = baseQueueDir;
    this.provider = provider;
    this.handler = handler;
    this.pollIntervalMs = pollIntervalMs;
    this.targetCircle = targetCircle || null;
  }

  async start() {
    this.isWatching = true;
    this.isShuttingDown = false;
    this.setupGracefulShutdown();
    
    // Auto-discover the active batch / circle
    await this.discoverAndBind();

    this.poll();
  }

  private async discoverAndBind() {
      try {
          let circleDir: string;
          
          if (this.targetCircle) {
              circleDir = path.join(this.baseQueueDir, this.targetCircle);
          } else {
              // 自动发现最近创建的 Circle
              const circles = await fs.readdir(this.baseQueueDir);
              if (circles.length === 0) return;
              // 简单的排序算法：按修改时间或名称排序
              const latestCircle = circles.sort().reverse()[0];
              circleDir = path.join(this.baseQueueDir, latestCircle);
          }

          const providerDir = path.join(circleDir, this.provider);
          const entries = await fs.readdir(providerDir).catch(() => []);
          const batchFolders = entries.filter(e => e.startsWith('queue_'));
          
          if (batchFolders.length > 0) {
              const nums = batchFolders.map(f => parseInt(f.replace('queue_', ''))).filter(n => !isNaN(n));
              const latestBatch = Math.max(...nums);
              const batchPath = path.join(providerDir, `queue_${latestBatch}`);
              this.manager = new BatchManifestManager(batchPath);
              console.log(`[QueueWatcher] Bound to ${batchPath}`);
          } else {
              console.log(`[QueueWatcher] No batches found in ${providerDir}`);
          }
      } catch (e) {}
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
      // Re-initialize manager if it was missing
      if (!this.manager) {
          await this.discoverAndBind();
      }

      const task = await this.manager?.getNextPendingTask();
      if (task) {
        this.currentTaskId = task.id;
        console.log(`[QueueWatcher] Processing task ${task.id}`);
        
        await this.manager?.updateTaskStatus(task.id, 'processing');
        
        try {
          const intention = await this.manager?.getTaskIntention(task.id);
          
          // 根据意图类型确定后缀
          const isVideo = intention.type === 'video_generation';
          const ext = isVideo ? 'mp4' : 'png';
          
          // 资产落盘路径：全局唯一序号命名
          const projectRoot = path.resolve(this.baseQueueDir, '..');
          const sequenceCounter = SequenceCounter.getInstance();
          const seq = await sequenceCounter.getNextGlobalSequence(projectRoot, task.id);
          const outputPath = path.join((this.manager as any).batchDir, `${task.id}_${seq}.${ext}`);

          const virtualTask = {
              uuid: task.id,
              payload: intention, // 扁平化意图
              outputPath: outputPath
          };

          const result = await this.handler(virtualTask);
          await this.manager?.updateTaskStatus(task.id, 'completed', result, outputPath);
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

