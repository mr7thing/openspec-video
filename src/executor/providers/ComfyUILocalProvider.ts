import axios from 'axios';
import fs from 'fs/promises';
import { logger } from '../../utils/logger';

/**
 * ComfyUI Local Provider (v0.6.4 简化版)
 *
 * 职责：读取 .json 任务文件（ComfyUI workflow）→ 提交本地 ComfyUI → 轮询历史 → 保存结果标记。
 * 注意：本地 ComfyUI 的结果通常保存在其自身的 output 目录，此 Provider 主要做提交和状态追踪。
 */

export class ComfyUILocalProvider {
  private endpoint: string;

  constructor(endpoint: string = 'http://127.0.0.1:8188') {
    this.endpoint = endpoint;
  }

  async processTask(input: { taskJson: any; outputPath: string; logPath: string }): Promise<void> {
    const { taskJson, outputPath, logPath } = input;
    const meta = taskJson._opsv;
    const workflow = { ...taskJson };
    delete workflow._opsv;

    const logLines: any[] = [];

    logLines.push({ t: new Date().toISOString(), type: 'request', method: 'POST', url: `${this.endpoint}/prompt`, workflow });

    try {
      const submitRes = await axios.post(`${this.endpoint}/prompt`, { prompt: workflow }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      const { prompt_id } = submitRes.data;
      if (!prompt_id) throw new Error('No prompt_id returned from ComfyUI');

      logLines.push({ t: new Date().toISOString(), type: 'response', status: submitRes.status, body: submitRes.data });

      const result = await this.pollForCompletion(prompt_id, logLines);

      // 本地 ComfyUI 结果通常在其 output 目录，此处保存一个结果引用文件
      await fs.writeFile(outputPath, JSON.stringify({ prompt_id, result }, null, 2));
      logLines.push({ t: new Date().toISOString(), type: 'save_complete', path: outputPath, prompt_id });

      await fs.appendFile(logPath, logLines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
    } catch (err: any) {
      logLines.push({ t: new Date().toISOString(), type: 'error', message: err.message, code: err.code || err.response?.status });
      await fs.appendFile(logPath, logLines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
      throw err;
    }
  }

  private async pollForCompletion(prompt_id: string, logLines: any[]): Promise<any> {
    let retries = 0;
    while (retries < 360) {
      await new Promise(r => setTimeout(r, 3000));
      retries++;

      try {
        const res = await axios.get(`${this.endpoint}/history/${prompt_id}`, { timeout: 10000 });
        if (res.status === 200 && res.data[prompt_id]) {
          logLines.push({ t: new Date().toISOString(), type: 'poll', attempt: retries, status: 'completed' });
          return res.data[prompt_id];
        }

        const queueRes = await axios.get(`${this.endpoint}/queue`, { timeout: 10000 });
        const queue = queueRes.data;
        const inQueue = [...(queue.queue_running || []), ...(queue.queue_pending || [])].some((q: any) => q[1] === prompt_id);

        if (!inQueue && (!res.data || !res.data[prompt_id])) {
          throw new Error('Prompt disappeared from queue without generating history');
        }
      } catch (err: any) {
        if (err.message?.includes('disappeared')) throw err;
        logLines.push({ t: new Date().toISOString(), type: 'poll_error', attempt: retries, message: err.message });
      }
    }
    throw new Error(`Polling timeout for ComfyUI prompt_id ${prompt_id}`);
  }
}
