import { SpoolerQueue, SpoolerTask } from '../core/queue/SpoolerQueue';

type TaskHandler = (task: SpoolerTask) => Promise<any>;

export class QueueWatcher {
  private queue: SpoolerQueue;
  private handler: TaskHandler;
  private isWatching: boolean = false;
  private pollIntervalMs: number;
  private currentTask: SpoolerTask | null = null;
  private isShuttingDown: boolean = false;

  constructor(baseQueueDir: string, provider: string, handler: TaskHandler, pollIntervalMs = 5000) {
    this.queue = new SpoolerQueue(baseQueueDir, provider);
    this.handler = handler;
    this.pollIntervalMs = pollIntervalMs;
  }

  async start() {
    await this.queue.init();
    this.isWatching = true;
    this.isShuttingDown = false;
    this.setupGracefulShutdown();
    console.log(`[QueueWatcher] Started watching spooler queue for provider: ${this.queue['provider']}`);
    this.poll();
  }

  stop() {
    this.isWatching = false;
    console.log(`[QueueWatcher] Stopped watching.`);
  }

  private setupGracefulShutdown() {
    const shutdownHandler = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      this.isWatching = false;

      console.log(`[QueueWatcher] Received ${signal}. Graceful shutdown...`);

      if (this.currentTask) {
        console.log(`[QueueWatcher] Returning current task ${this.currentTask.uuid} to inbox.`);
        try {
          // 将正在处理的任务移回 inbox，以便下次启动时重新执行
          await this.queue.returnToInbox(this.currentTask.uuid);
        } catch (e) {
          console.error(`[QueueWatcher] Failed to return task to inbox:`, e);
        }
      }

      console.log(`[QueueWatcher] Exiting.`);
      process.exit(0);
    };

    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  }

  private async poll() {
    if (!this.isWatching || this.isShuttingDown) return;

    try {
      const task = await this.queue.dequeue();
      if (task) {
        this.currentTask = task;
        console.log(`[QueueWatcher] Picked up task ${task.uuid}`);
        try {
          const result = await this.handler(task);
          await this.queue.markCompleted(task.uuid, result);
          console.log(`[QueueWatcher] Task ${task.uuid} completed sequentially.`);
        } catch (err: any) {
          console.error(`[QueueWatcher] Task ${task.uuid} failed:`, err.message);
          await this.queue.markFailed(task.uuid, err);
        } finally {
          this.currentTask = null;
        }

        // Immediately poll again if we processed a task (drain queue)
        setImmediate(() => this.poll());
        return;
      }
    } catch (err) {
      console.error(`[QueueWatcher] Polling error:`, err);
    }

    // Wait and poll again
    setTimeout(() => this.poll(), this.pollIntervalMs);
  }
}
