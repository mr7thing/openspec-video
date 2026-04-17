import { SpoolerTask } from '../../core/queue/SpoolerQueue';

export class RunningHubProvider {
  private endpointBase: string = 'https://www.runninghub.cn/task/openapi';
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("RunningHub Provider requires an API key in api_config.yaml");
    }
    this.apiKey = apiKey;
  }

  async processTask(task: SpoolerTask): Promise<any> {
    const payloadJson = task.payload.comfyui_payload;
    if (!payloadJson) throw new Error('Task payload is missing comfyui_payload');

    console.log(`[RunningHubProvider] Submitting Task ${task.uuid} to RunningHub...`);
    
    let submitRes;
    try {
      submitRes = await fetch(`${this.endpointBase}/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ workflowData: payloadJson })
      });
    } catch (error: any) {
      // 准则三：Axios 防空逻辑 (Error response 为空处理)
      console.error(`[RunningHubProvider] Network Disconnected / Timeout:`, JSON.stringify({ code: error.code || 'ETIMEDOUT', message: error.message }));
      throw new Error(`RunningHub Network Fail: ${error.message}`);
    }

    if (!submitRes.ok) {
        // 准则二：强力证据式日志 (Evidential Logging)
        const errStr = await submitRes.text();
        const apiError = { status: submitRes.status, statusText: submitRes.statusText, rawPayload: errStr };
        console.error(`[RunningHubProvider] Evidential Log - Non-2xx Response:`, JSON.stringify(apiError));
        throw new Error(`RunningHub Submit Error [${submitRes.status}]`);
    }

    const resData = await submitRes.json();
    
    // 准则一：深度穿透解析 (兼容不同嵌套层级)
    const dataObj = Array.isArray(resData?.data) ? resData.data[0] 
                  : (resData?.data?.data ? resData.data.data : resData?.data) || resData;

    if (resData.code !== 0 && resData.code !== 200) {
       console.error(`[RunningHubProvider] Business Error:`, JSON.stringify(resData));
       throw new Error(`RunningHub API Business Error: ${resData.msg || 'Unknown'}`);
    }
    
    const taskId = dataObj?.taskId || dataObj?.task_id;
    if (!taskId) {
       console.error(`[RunningHubProvider] Missing TaskID in Response:`, JSON.stringify(resData));
       throw new Error("Missing Task ID from RunningHub response");
    }

    console.log(`[RunningHubProvider] Task ${task.uuid} successfully mapped to RunningHub taskId: ${taskId}`);
    return await this.pollForCompletion(taskId);
  }

  private async pollForCompletion(taskId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const res = await fetch(`${this.endpointBase}/status?taskId=${taskId}`, {
            headers: { 'Authorization': `Bearer ${this.apiKey}` }
          });
          
          if (!res.ok) {
            const rawFail = await res.text();
            console.error(`[RunningHubProvider] Status API Non-2xx:`, JSON.stringify({ status: res.status, raw: rawFail }));
            throw new Error(`Status HTTP Error: ${res.status}`);
          }
          
          const statusData = await res.json();
          // 准则一：深度解析
          const info = Array.isArray(statusData?.data) ? statusData.data[0] : (statusData?.data?.data || statusData?.data || statusData);
          
          if (info?.taskStatus === 'SUCCESS' || info?.status === 2 || info?.status === 'SUCCESS') { 
            console.log(`[RunningHubProvider] taskId ${taskId} completed successfully!`);
            return resolve(info);
          } else if (info?.taskStatus === 'FAILED' || info?.status === 3 || info?.status === -1) {
            console.error(`[RunningHubProvider] Server Side Gen Failure:`, JSON.stringify(info));
            return reject(new Error(`RunningHub Task Failed on Server.`));
          }

          setTimeout(poll, 5000);
        } catch (err: any) {
          console.warn(`[RunningHubProvider] Warn: poll failed with ${err.message}, retrying in 5s...`);
          setTimeout(poll, 5000);
        }
      };
      
      setTimeout(poll, 5000); 
    });
  }
}
