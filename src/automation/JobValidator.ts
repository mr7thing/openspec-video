import { Job } from '../types/PromptSchema';
import { logger } from '../utils/logger';

// ============================================================================
// 两阶段语义校验器
// 编译期: 通用校验（双引号清洗、必填字段）
// 执行期: 模型特定校验（像素约束、参数范围）
// ============================================================================

export interface ValidationError {
    jobId: string;
    field: string;
    message: string;
    suggestion?: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    sanitized?: Job[];
}

export interface ModelConstraints {
    name: string;
    min_pixels?: number;
    max_pixels?: number;
    supported_ratios?: string[];
    default_resolution?: string;
    max_prompt_length?: number;
}

export class JobValidator {
    // ============================================================
    // 编译期通用校验
    // ============================================================

    /**
     * 清洗 + 校验: 先修复已知问题，再校验格式
     */
    validateAndSanitize(jobs: Job[]): ValidationResult {
        const sanitized = this.sanitize(jobs);
        const errors = this.validateGeneric(sanitized);

        return {
            valid: errors.length === 0,
            errors,
            sanitized
        };
    }

    /**
     * 双引号清洗（测试报告 #8）
     * YAML → JSON 类型边界混淆: "2K" 变成 '"2K"'
     */
    sanitize(jobs: Job[]): Job[] {
        return jobs.map(job => {
            const cleaned = { ...job };

            // 清洗 quality 字段双引号
            if (cleaned.payload?.global_settings?.quality) {
                cleaned.payload.global_settings.quality =
                    this.stripQuotes(cleaned.payload.global_settings.quality);
            }

            // 清洗 aspect_ratio 字段
            if (cleaned.payload?.global_settings?.aspect_ratio) {
                cleaned.payload.global_settings.aspect_ratio =
                    this.stripQuotes(cleaned.payload.global_settings.aspect_ratio);
            }

            // 清洗 prompt_en 字段
            if (cleaned.prompt_en) {
                cleaned.prompt_en = this.stripQuotes(cleaned.prompt_en);
            }

            return cleaned;
        });
    }

    /**
     * 通用格式校验
     */
    private validateGeneric(jobs: Job[]): ValidationError[] {
        const errors: ValidationError[] = [];

        for (const job of jobs) {
            // 1. ID 必须存在
            if (!job.id) {
                errors.push({
                    jobId: 'unknown',
                    field: 'id',
                    message: '缺少任务 ID'
                });
                continue;
            }

            // 2. 必须有 prompt 内容
            if (!job.prompt_en && !job.payload?.prompt) {
                errors.push({
                    jobId: job.id,
                    field: 'prompt',
                    message: '缺少 prompt 内容（prompt_en 和 payload.prompt 均为空）'
                });
            }

            // 3. 必须有输出路径
            if (!job.output_path) {
                errors.push({
                    jobId: job.id,
                    field: 'output_path',
                    message: '缺少输出路径'
                });
            }

            // 4. 检查残留双引号
            this.checkResiduaQuotes(job, errors);
        }

        return errors;
    }

    // ============================================================
    // 执行期模型特定校验
    // ============================================================

    /**
     * 根据目标模型的约束校验任务
     * 校验失败 = 拒绝发送到 API
     */
    validateForModel(
        jobs: Job[],
        modelName: string,
        constraints: ModelConstraints
    ): ValidationResult {
        const errors: ValidationError[] = [];

        for (const job of jobs) {
            // 1. 像素约束
            if (constraints.min_pixels) {
                const pixels = this.estimatePixels(job);
                if (pixels > 0 && pixels < constraints.min_pixels) {
                    errors.push({
                        jobId: job.id,
                        field: 'resolution',
                        message: `像素 ${pixels} 不足（模型 ${modelName} 要求 ≥ ${constraints.min_pixels}）`,
                        suggestion: constraints.default_resolution
                            ? `建议使用: ${constraints.default_resolution}`
                            : undefined
                    });
                }
            }

            // 2. 宽高比约束
            if (constraints.supported_ratios) {
                const ratio = job.payload?.global_settings?.aspect_ratio;
                if (ratio && !constraints.supported_ratios.includes(ratio)) {
                    errors.push({
                        jobId: job.id,
                        field: 'aspect_ratio',
                        message: `宽高比 ${ratio} 不被 ${modelName} 支持`,
                        suggestion: `支持: ${constraints.supported_ratios.join(', ')}`
                    });
                }
            }

            // 3. Prompt 长度限制
            if (constraints.max_prompt_length) {
                const promptLen = (job.prompt_en || '').length;
                if (promptLen > constraints.max_prompt_length) {
                    errors.push({
                        jobId: job.id,
                        field: 'prompt_en',
                        message: `Prompt 长度 ${promptLen} 超过 ${modelName} 限制 ${constraints.max_prompt_length}`,
                        suggestion: '请精简 prompt 文本'
                    });
                }
            }
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * 从 api_config.yaml 中提取模型约束
     */
    static extractConstraints(modelConfig: any): ModelConstraints {
        return {
            name: modelConfig.name || 'unknown',
            min_pixels: modelConfig.min_pixels,
            max_pixels: modelConfig.max_pixels,
            supported_ratios: modelConfig.supported_ratios,
            default_resolution: modelConfig.default_resolution
                || modelConfig.size
                || modelConfig.resolution,
            max_prompt_length: modelConfig.max_prompt_length,
        };
    }

    // ---- 内部辅助 ----

    private stripQuotes(value: string): string {
        return value.replace(/^["']+|["']+$/g, '');
    }

    private checkResiduaQuotes(job: Job, errors: ValidationError[]): void {
        const fields: [string, string | undefined][] = [
            ['quality', job.payload?.global_settings?.quality],
            ['aspect_ratio', job.payload?.global_settings?.aspect_ratio],
            ['prompt_en', job.prompt_en],
        ];

        for (const [field, value] of fields) {
            if (value && (value.startsWith('"') || value.endsWith('"'))) {
                errors.push({
                    jobId: job.id,
                    field,
                    message: `检测到残留双引号: "${value}"`,
                    suggestion: '请检查 YAML → JSON 类型转换'
                });
            }
        }
    }

    private estimatePixels(job: Job): number {
        const quality = job.payload?.global_settings?.quality;
        if (!quality) return 0;

        // 常见分辨率映射
        const pixelMap: Record<string, number> = {
            '2K': 2073600,    // 1920x1080
            '4K': 8294400,    // 3840x2160
            '1080p': 2073600,
            '720p': 921600,
        };
        return pixelMap[quality] || 0;
    }
}
