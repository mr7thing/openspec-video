/**
 * 视频模型提供者 (Provider) 契约 (v0.6.2)
 * 
 * 所有的 Provider (SiliconFlow, Volcengine, Minimax, ComfyUI 等) 
 * 必须实现 processTask 方法来消费 QueueWatcher 分发的任务。
 */
export interface VideoProvider {
    /** 
     * 执行生成任务
     * @param task 标准任务对象
     * {
     *   uuid: string,           // 任务唯一标识
     *   payload: {              // 已编译的请求负荷
     *     prompt: string,       // 提示词
     *     model: string,        // 模型名称
     *     type: string,         // 任务类型 (image_generation/video_generation)
     *     params: any,          // API 特定参数 (尺寸, 步数等)
     *     shotId: string,       // 关联的镜头 ID
     *     ...                   // 其他 Provider 特定的扩展 (如 frame_ref, comfyui_payload)
     *   },
     *   outputPath: string      // 物理输出绝对路径 (由 QueueWatcher 自动计算并分发)
     * }
     */
    processTask(task: any): Promise<boolean>;
}
