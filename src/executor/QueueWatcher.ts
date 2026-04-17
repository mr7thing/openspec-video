import { SpoolerQueue, SpoolerTask } from '../core/queue/SpoolerQueue';

type TaskHandler = (task: SpoolerTask) => Promise<any>;

export class QueueWatcher {
  private queue: SpoolerQueue;
  private handler: TaskHandler;
  private isWatching: boolean = false;
  private pollIntervalMs: number;

  constructor(baseQueueDir: string, provider: string, handler: TaskHandler, pollIntervalMs = 5000) {
    this.queue = new SpoolerQueue(baseQueueDir, provider);
    this.handler = handler;
    this.pollIntervalMs = pollIntervalMs;
  }

  async start() {
    await this.queue.init();
    this.isWatching = true;
    console.log(`[QueueWatcher] Started watching spooler queue for provider: ${this.queue['provider']}`);
    this.poll();
  }

  stop() {
    this.isWatching = false;
    console.log(`[QueueWatcher] Stopped watching.`);
  }

  private async poll() {
    if (!this.isWatching) return;

    try {
      const task = await this.queue.dequeue();
      if (task) {
        console.log(`[QueueWatcher] Picked up task ${task.uuid}`);
        try {
          const result = await this.handler(task);
          await this.queue.markCompleted(task.uuid, result);
          console.log(`[QueueWatcher] Task ${task.uuid} completed sequentially.`);
        } catch (err: any) {
          console.error(`[QueueWatcher] Task ${task.uuid} failed:`, err.message);
          await this.queue.markFailed(task.uuid, err);
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
