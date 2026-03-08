import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { VideoProvider } from './VideoProvider';
import { Job } from '../../types/PromptSchema';

export class SiliconFlowProvider implements VideoProvider {
    providerName = 'siliconflow';

    private getBase64Image(filePath: string): string {
        try {
            const ext = path.extname(filePath).toLowerCase();
            let mimeType = 'image/png';
            if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            if (ext === '.webp') mimeType = 'image/webp';

            if (!fs.existsSync(filePath)) {
                throw new Error(`Local file not found: ${filePath}`);
            }

            const data = fs.readFileSync(filePath);
            const base64Str = data.toString('base64');
            return `data:${mimeType};base64,${base64Str}`;
        } catch (e: any) {
            throw new Error(`Failed to encode image to base64: ${e.message}`);
        }
    }

    async submitJob(job: Job, modelName: string, apiKey: string): Promise<string> {
        const url = 'https://api.siliconflow.cn/v1/video/submit';

        // 解析 0.3 Schema 中的 first_image
        const schema03 = (job.payload as any)?.schema_0_3;
        let imageArg = undefined;

        if (schema03 && schema03.first_image) {
            imageArg = this.getBase64Image(schema03.first_image);
        } else if (job.reference_images && job.reference_images.length > 0) {
            // 后备方案
            imageArg = this.getBase64Image(job.reference_images[0]);
        }

        // 当模型是图生视频时，首帧图通常必填。这里抛给外部或 API 自身去校验
        if (!imageArg && modelName.includes("I2V")) {
            console.warn(`[SiliconFlowProvider] Warning: Job ${job.id} uses I2V model but lacks first_image.`);
        }

        const requestBody = {
            model: modelName,
            prompt: job.prompt_en || "Cinematic video.",
            // 针对 wan2.2 暂时硬编码支持。理想情况从 job.payload 调配
            image_size: "1280x720",
            image: imageArg,
            // 默认随机数，也可以从 job 里进一步暴露控制
            // seed: Math.floor(Math.random() * 9999999999) 
        };

        if (process.env.OPSV_DEBUG === 'true') {
            console.log(`[SiliconFlowProvider] Submitting to ${modelName} with prompt: ${requestBody.prompt}`);
        }

        const response = await axios.post(url, requestBody, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.requestId) {
            return response.data.requestId;
        }

        throw new Error(`Invalid submission response from SiliconFlow: ${JSON.stringify(response.data)}`);
    }

    async pollAndDownload(requestId: string, apiKey: string, outputFilePath: string): Promise<void> {
        const url = 'https://api.siliconflow.cn/v1/video/status';
        let retries = 0;
        const maxRetries = 120; // 约等待 20 分钟 (120 * 10s)

        console.log(`[SiliconFlow] Start polling for RequestID: ${requestId}`);

        while (retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // 10秒轮询间隔
            retries++;

            try {
                const response = await axios.post(url, { requestId }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                });

                const status = response.data.status;

                if (status === 'Succeed') {
                    const videoUrl = response.data.results?.videos?.[0]?.url;
                    if (!videoUrl) {
                        throw new Error(`Status is Succeed but no video URL found in response.`);
                    }
                    console.log(`[SiliconFlow] 🟢 Video generation succeeded! Downloading from: ${videoUrl}`);
                    await this.downloadVideo(videoUrl, outputFilePath);
                    return;
                } else if (status === 'Failed') {
                    throw new Error(`Video generation failed remotely: ${response.data.reason}`);
                } else {
                    // 'InQueue' or 'InProgress'
                    if (process.env.OPSV_DEBUG === 'true') {
                        process.stdout.write('.');
                    }
                }
            } catch (error: any) {
                if (error.response) {
                    console.error(`[SiliconFlow] API Error during poll: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
                } else {
                    console.error(`[SiliconFlow] Network/Poll Error: ${error.message}`);
                }
                // 发生异常时视情况决定是否继续。这里继续轮询几次可能遇到网络跳动
            }
        }

        throw new Error(`Polling timeout for requestId: ${requestId} after ${maxRetries} attempts.`);
    }

    private async downloadVideo(videoUrl: string, outputFilePath: string): Promise<void> {
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream'
        });

        // 确保父目录存在
        const dir = path.dirname(outputFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const writer = fs.createWriteStream(outputFilePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve());
            writer.on('error', reject);
        });
    }
}
