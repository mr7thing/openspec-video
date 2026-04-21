import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger';

export class ComfyUILocalProvider {
  private endpoint: string;

  constructor(endpoint: string = 'http://127.0.0.1:8188') {
    this.endpoint = endpoint;
  }

  /**
   * 执行本地 ComfyUI 任务
   * task 结构: { uuid, payload: { comfyui_payload, shotId, ... }, outputPath }
   */
  async processTask(task: any): Promise<boolean> {
    const { payload, outputPath } = task;
    const payloadJson = payload.comfyui_payload;
    if (!payloadJson) throw new Error('Task payload is missing comfyui_payload');

    logger.logExecution(payload.shotId, 'COMFYUI_LOCAL_SUBMIT', { endpoint: this.endpoint, outputPath });

    try {
        // 1. Submit the prompt
        const submitRes = await axios.post(`${this.endpoint}/prompt`, { prompt: payloadJson }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        const { prompt_id } = submitRes.data;
        if (!prompt_id) throw new Error("No prompt_id returned from ComfyUI");

        // 2. Poll the history endpoint for completion
        const result = await this.pollForCompletion(prompt_id);
        
        // 3. 处理结果保存 (此处简化逻辑，具体取决于 ComfyUI 节点的输出格式)
        // 本地 Provider 通常由用户自行管理 ComfyUI output 文件夹，或通过 API 获取结果
        // 这里假设我们需要把结果移动到 task.outputPath
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        
        // 如果有 output 数据，可以遍历保存。此处打一个成功标记文件作为占位
        await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
        return true;
    } catch (error: any) {
        logger.error(`ComfyUI Local Error: ${error.message}`);
        throw error;
    }
  }

  private async pollForCompletion(prompt_id: string): Promise<any> {
    let retries = 0;
    while (retries < 360) { // 约 18 分钟
        await new Promise(r => setTimeout(r, 3000));
        retries++;

        try {
            const res = await axios.get(`${this.endpoint}/history/${prompt_id}`);
            if (res.status === 200 && res.data[prompt_id]) {
                return res.data[prompt_id];
            }
            
            // 检查是否还在队列中
            const queueRes = await axios.get(`${this.endpoint}/queue`);
            const queue = queueRes.data;
            const inQueue = [...(queue.queue_running || []), ...(queue.queue_pending || [])].some(q => q[1] === prompt_id);
            
            if (!inQueue && (!res.data || !res.data[prompt_id])) {
                throw new Error('Prompt disappeared from queue without generating history.');
            }
        } catch (err: any) {
            if (err.message.includes('disappeared')) throw err;
            logger.warn(`Polling ComfyUI Local failed: ${err.message}`);
        }
    }
    throw new Error(`Polling timeout for ComfyUI prompt_id ${prompt_id}`);
  }
}
