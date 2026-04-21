import axios from 'axios';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger';
import { ConfigLoader } from '../../utils/configLoader';

export class RunningHubProvider {
    private endpointBase: string = 'https://www.runninghub.cn/task/openapi';
    private providerName: string = 'runninghub';

    /**
     * 执行 RunningHub (ComfyUI) 任务
     * task 结构: { uuid, payload: { comfyui_payload, shotId, ... }, outputPath }
     */
    async processTask(task: any): Promise<boolean> {
        const { payload, outputPath, uuid } = task;
        if (!payload || !payload.comfyui_payload) {
            throw new Error("RunningHub Provider: Missing comfyui_payload in task");
        }

        const configLoader = ConfigLoader.getInstance();
        let apiKey: string;
        try {
            apiKey = configLoader.getResolvedApiKey(this.providerName);
        } catch {
            apiKey = process.env.RUNNINGHUB_API_KEY || '';
            if (!apiKey) throw new Error("Missing RUNNINGHUB_API_KEY");
        }

        logger.logExecution(payload.shotId, 'RUNNINGHUB_SUBMIT_START', { uuid, outputPath });

        try {
            const submitRes = await axios.post(`${this.endpointBase}/create`, 
                { workflowData: payload.comfyui_payload }, 
                {
                    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                    timeout: 30000
                }
            );

            const resData = submitRes.data;
            // 准则一：深度穿透解析
            const dataObj = Array.isArray(resData?.data) ? resData.data[0] 
                          : (resData?.data?.data ? resData.data.data : resData?.data) || resData;

            if (resData.code !== 0 && resData.code !== 200) {
                throw new Error(`RunningHub Business Error: ${resData.msg || 'Unknown'}`);
            }
            
            const taskId = dataObj?.taskId || dataObj?.task_id;
            if (!taskId) throw new Error(`Missing taskId in RunningHub response: ${JSON.stringify(resData)}`);

            const resultInfo = await this.pollForCompletion(taskId, apiKey);
            
            // 处理结果文件下载
            // RunningHub 通常返回已渲染的文件 URL 或 base64
            const fileUrl = resultInfo.fileUrl || resultInfo.url || resultInfo.imageUrl;
            if (fileUrl) {
                await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
                await this.downloadFile(fileUrl, outputPath);
                return true;
            } else if (resultInfo.image_base64) {
                 const buffer = Buffer.from(resultInfo.image_base64, 'base64');
                 await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
                 await fsPromises.writeFile(outputPath, buffer);
                 return true;
            }
            
            throw new Error(`RunningHub Task Success but no downloadable content found in ${JSON.stringify(resultInfo)}`);
        } catch (error: any) {
            const apiError = error.response?.data || error.message;
            throw new Error(`RunningHub API Error: ${JSON.stringify(apiError)}`);
        }
    }

    private async pollForCompletion(taskId: string, apiKey: string): Promise<any> {
        let retries = 0;
        let pollIntervalMs = 5000;
        while (retries < 120) {
            await new Promise(r => setTimeout(r, pollIntervalMs));
            retries++;
            pollIntervalMs = Math.min(pollIntervalMs + 5000, 30000);

            try {
                const res = await axios.get(`${this.endpointBase}/status?taskId=${taskId}`, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                
                const statusData = res.data;
                const info = Array.isArray(statusData?.data) ? statusData.data[0] : (statusData?.data?.data || statusData?.data || statusData);
                
                if (info?.taskStatus === 'SUCCESS' || info?.status === 2 || info?.status === 'SUCCESS') { 
                    return info;
                } else if (info?.taskStatus === 'FAILED' || info?.status === 3 || info?.status === -1) {
                    throw new Error(`RunningHub Task Failed: ${info.msg || 'Remote error'}`);
                }
            } catch (err: any) {
                if (err.message.includes('failed')) throw err;
                logger.warn(`RunningHub Polling attempt ${retries} failed: ${err.message}`);
            }
        }
        throw new Error(`Polling timeout for RunningHub task ${taskId}`);
    }

    private async downloadFile(url: string, outputPath: string): Promise<void> {
        const response = await axios({ method: 'GET', url: url, responseType: 'stream', timeout: 600000 });
        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            response.data.on('error', reject);
            writer.on('finish', () => { writer.close(); resolve(); });
            writer.on('error', reject);
        });
    }
}
