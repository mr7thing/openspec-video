/**
 * 图像模型提供者（Image Provider）接口
 * 
 * 所有第三方图像生成 API (SeaDream, Midjourney, Stable Diffusion 等) 需实现此契约，
 * 以接入图像调度器。
 */

import { Job } from '../../types/PromptSchema';

export interface ImageGenerationResult {
    /** 生成的图像结果列表 (0.3.14) */
    images: Array<{
        /** 生成的图像 URL */
        url?: string;
        /** Base64 编码的图像数据 */
        base64?: string;
        /** 生成所用的种子 */
        seed?: number;
    }>;
    /** 生成耗时（毫秒） */
    generationTime?: number;
    /** 模型信息 */
    model?: string;
}

export interface ImageProvider {
    /** 唯一提供商标识符，对应 api_config.yaml 中的 provider */
    providerName: string;

    /**
     * 发起图像生成请求
     * @param job 由编译器生成的图像生成任务
     * @param modelName 具体的模型标识符（如 seadream-5.0-lite）
     * @param apiKey 注入的 API 鉴权密钥
     * @returns 返回生成的图像结果
     */
    generateImage(job: Job, modelName: string, apiKey: string): Promise<ImageGenerationResult>;

    /**
     * 检查模型是否支持特定功能
     * @param feature 功能名称
     */
    supportsFeature?(feature: string): boolean;
}
