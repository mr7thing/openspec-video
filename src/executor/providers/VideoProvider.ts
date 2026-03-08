import { Job } from '../../types/PromptSchema';

/**
 * 视频模型提供者（Provider）接口
 * 所有第三方 API (SiliconFlow, Luma, Sora 等) 需实现此契约，以接入调度器。
 */
export interface VideoProvider {
    /** 唯一提供商标识符，对应 api_config.yaml 中的 provider */
    providerName: string;

    /**
     * 发起生成请求
     * @param job 由编译器生成的原子视频作业结构
     * @param modelName 具体的模型标识符（如 wan2.2-i2v）
     * @param apiKey 注入的 API 鉴权密钥
     * @returns 返回远程的 taskId / requestId 用于后续轮询
     */
    submitJob(job: Job, modelName: string, apiKey: string): Promise<string>;

    /**
     * 轮询作业状态并下载视频
     * @param requestId 由 submitJob 返回的远程追踪 ID
     * @param apiKey 注入的 API 鉴权密钥
     * @param outputFilePath 期望在本地存放视频的物理绝对路径
     */
    pollAndDownload(requestId: string, apiKey: string, outputFilePath: string): Promise<void>;
}
