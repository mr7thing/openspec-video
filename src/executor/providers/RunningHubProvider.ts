import axios from 'axios';
import fs from 'fs/promises';
import { logger } from '../../utils/logger';
import { downloadFile } from '../../utils/download';
import { ConfigLoader } from '../../utils/configLoader';

export class RunningHubProvider {
  constructor(private readonly providerName: string = 'runninghub') {}
  async processTask(input: { taskJson: any; outputPath: string; logPath: string }): Promise<void> {
    const { taskJson, outputPath, logPath } = input;
    const meta = taskJson._opsv;
    const workflow = { ...taskJson };
    delete workflow._opsv;

    const apiKey = await this.resolveApiKey();    const logLines: any[] = [];
    const endpointBase = meta.api_url || 'https://www.runninghub.cn/task/openapi';

    logLines.push({ t: new Date().toISOString(), type: 'request', method: 'POST', url: `${endpointBase}/create`, workflow });

    try {
      const submitRes = await axios.post(`${endpointBase}/create`, { workflowData: workflow }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 30000
      });

      const resData = submitRes.data;
      logLines.push({ t: new Date().toISOString(), type: 'response', status: submitRes.status, body: resData });

      const dataObj = Array.isArray(resData?.data) ? resData.data[0] : (resData?.data?.data || resData?.data || resData);

      if (resData.code !== 0 && resData.code !== 200) {
        throw new Error(`RunningHub Business Error: ${resData.msg || 'Unknown'}`);
      }

      const taskId = dataObj?.taskId || dataObj?.task_id;
      if (!taskId) throw new Error(`Missing taskId in RunningHub response: ${JSON.stringify(resData)}`);

      const resultInfo = await this.pollForCompletion(taskId, apiKey, endpointBase, logLines);

      const fileUrl = resultInfo.fileUrl || resultInfo.url || resultInfo.imageUrl;
      if (fileUrl) {
        logLines.push({ t: new Date().toISOString(), type: 'download_start', url: fileUrl });
        await downloadFile(fileUrl, outputPath);
        logLines.push({ t: new Date().toISOString(), type: 'download_complete', path: outputPath });
      } else if (resultInfo.image_base64) {
        const buffer = Buffer.from(resultInfo.image_base64, 'base64');
        await fs.writeFile(outputPath, buffer);
        logLines.push({ t: new Date().toISOString(), type: 'save_complete', path: outputPath, size_bytes: buffer.length });
      } else {
        throw new Error(`RunningHub task succeeded but no downloadable content found in ${JSON.stringify(resultInfo)}`);
      }

      await fs.appendFile(logPath, logLines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
    } catch (err: any) {
      logLines.push({ t: new Date().toISOString(), type: 'error', message: err.message, code: err.code || err.response?.status });
      await fs.appendFile(logPath, logLines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
      throw err;
    }
  }

  private async pollForCompletion(taskId: string, apiKey: string, endpointBase: string, logLines: any[]): Promise<any> {
    let retries = 0;
    let pollIntervalMs = 5000;
    while (retries < 120) {
      await new Promise(r => setTimeout(r, pollIntervalMs));
      retries++;
      pollIntervalMs = Math.min(pollIntervalMs + 5000, 30000);

      try {
        const res = await axios.get(`${endpointBase}/status?taskId=${taskId}`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        const statusData = res.data;
        const info = Array.isArray(statusData?.data) ? statusData.data[0] : (statusData?.data?.data || statusData?.data || statusData);

        logLines.push({ t: new Date().toISOString(), type: 'poll', attempt: retries, status: info?.taskStatus || info?.status });

        if (info?.taskStatus === 'SUCCESS' || info?.status === 2 || info?.status === 'SUCCESS') {
          return info;
        } else if (info?.taskStatus === 'FAILED' || info?.status === 3 || info?.status === -1) {
          throw new Error(`RunningHub Task Failed: ${info.msg || 'Remote error'}`);
        }
      } catch (err: any) {
        if (err.message?.includes('Failed')) throw err;
        logLines.push({ t: new Date().toISOString(), type: 'poll_error', attempt: retries, message: err.message });
      }
    }
    throw new Error(`Polling timeout for RunningHub task ${taskId}`);
  }

  private async resolveApiKey(): Promise<string> {
    const configLoader = ConfigLoader.getInstance();
    await configLoader.loadConfig();
    return configLoader.getResolvedApiKey(this.providerName);
  }
}
