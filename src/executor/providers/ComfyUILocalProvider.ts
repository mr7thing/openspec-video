import { SpoolerTask } from '../../core/queue/SpoolerQueue';

export class ComfyUILocalProvider {
  private endpoint: string;

  constructor(endpoint: string = 'http://127.0.0.1:8188') {
    this.endpoint = endpoint;
  }

  /**
   * The pure consumer function.
   * Takes a fully compiled machine payload, sends to local ComfyUI,
   * polls for completion, and returns the result metadata.
   */
  async processTask(task: SpoolerTask): Promise<any> {
    const payloadJson = task.payload.comfyui_payload;
    if (!payloadJson) throw new Error('Task payload is missing comfyui_payload');

    // 1. Submit the prompt
    console.log(`[ComfyUILocalProvider] Submitting Task ${task.uuid} to ${this.endpoint}/prompt`);
    const submitRes = await fetch(`${this.endpoint}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: payloadJson })
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      throw new Error(`Failed to submit prompt: ${submitRes.status} - ${errText}`);
    }

    const { prompt_id } = await submitRes.json();
    console.log(`[ComfyUILocalProvider] Task ${task.uuid} mapped to server prompt_id: ${prompt_id}`);

    // 2. Poll the history endpoint for completion
    return await this.pollForCompletion(prompt_id);
  }

  private async pollForCompletion(prompt_id: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const res = await fetch(`${this.endpoint}/history/${prompt_id}`);
          let data: any = null;
          if (res.status === 200) {
            data = await res.json();
            if (data[prompt_id]) {
              // Generation is complete
              console.log(`[ComfyUILocalProvider] prompt_id ${prompt_id} completed successfully.`);
              return resolve(data[prompt_id]);
            }
          }
          // Not complete yet, check queue status
          const queueRes = await fetch(`${this.endpoint}/queue`);
          const queueData = await queueRes.json();
          const inQueue = [...queueData.queue_running, ...queueData.queue_pending].some(q => q[1] === prompt_id);
          
          if (!inQueue && res.status !== 200 && Object.keys(data || {}).length === 0) {
             // If not in queue and not in history, it was likely cancelled or crashed server-side
             return reject(new Error('Prompt disappeared from queue without generating history.'));
          }

          // Wait 3 seconds and poll again
          setTimeout(poll, 3000);
        } catch (err) {
          // Network errors don't necessarily mean task failed unless server is dead forever.
          // But for strict state machine, we throw and let spooler mark it failed to retry later.
          return reject(err);
        }
      };
      
      // Start polling
      setTimeout(poll, 2000);
    });
  }
}
