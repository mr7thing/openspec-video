/**
 * 图像模型提供者（Image Provider）接口
 *
 * ============================================================
 * 接入规范（v0.5.2 — 方案A强制接口）
 * ============================================================
 *
 * 所有图像生成 Provider 必须实现 `generateAndDownload`，
 * 这是 ImageModelDispatcher 调用的唯一入口。
 *
 * 不再支持旧的两步式 `generateImage` → 手动保存模式。
 * 每个 Provider 内部自行负责：
 *   1. 提交生成请求
 *   2. 轮询/等待完成
 *   3. 下载并写入 outputPath
 *
 * 新增 Provider 清单:
 *   - 必须实现: generateAndDownload
 *   - 可选实现: supportsFeature（用于能力探针）
 *   - 禁止: 在接口外暴露内部 HTTP 细节
 */

import { Job } from '../../types/PromptSchema';

export interface ImageProvider {
    /** 唯一提供商标识符，对应 api_config.yaml 中的 provider 字段 */
    providerName: string;

    /**
     * 执行完整的图像生成→下载流程（唯一必须方法）
     *
     * @param job       由编译器生成的图像任务对象
     * @param modelName api_config.yaml 中的模型 key（如 "seadream-5.0-lite"）
     * @param apiKey    由 ConfigLoader 注入的鉴权密钥
     * @param outputPath 目标文件绝对路径（由 Dispatcher 计算并传入）
     *
     * 实现要求:
     *   - 成功时：文件必须已写入 outputPath，函数正常 resolve
     *   - 失败时：抛出包含详细信息的 Error（或 OpsVError）
     *   - 网络超时：抛出含 "超时" 或 "timeout" 关键词的 Error
     *     （Dispatcher 依赖此关键词区分 timeout vs failed 状态）
     */
    generateAndDownload(
        job: Job,
        modelName: string,
        apiKey: string,
        outputPath: string
    ): Promise<void>;

    /**
     * 能力探针——检查 Provider 是否支持某项特性
     * @param feature  特性名称（如 "image_to_image", "batch_generation"）
     */
    supportsFeature?(feature: string): boolean;
}
