import fs from 'fs';
import yaml from 'js-yaml';
import { z } from 'zod';
import { BaseFrontmatterSchema, BaseFrontmatter } from '../types/FrontmatterSchema';

// ============================================================================
// 统一 Frontmatter 解析器
// v0.5 — 所有文档的 YAML 标头都经过此模块
// ============================================================================

export class FrontmatterParser {
    /**
     * 从 Markdown 内容中提取并解析 frontmatter
     * 返回 { frontmatter, body } 或抛出错误
     */
    static parse<T extends z.ZodType>(
        content: string,
        schema?: T
    ): { frontmatter: z.infer<T>; body: string } {
        const { rawYaml, body } = FrontmatterParser.split(content);

        let parsed: any;
        try {
            parsed = yaml.load(rawYaml);
        } catch (e) {
            throw new Error(`YAML 解析失败: ${(e as Error).message}`);
        }

        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Frontmatter 为空或格式错误');
        }

        // 使用指定 schema 或基础 schema 校验
        const targetSchema = schema || BaseFrontmatterSchema;
        const result = targetSchema.safeParse(parsed);
        if (!result.success) {
            const errors = result.error.errors
                .map(e => `  ${e.path.join('.')}: ${e.message}`)
                .join('\n');
            throw new Error(`Frontmatter 校验失败:\n${errors}`);
        }

        return { frontmatter: result.data, body };
    }

    /**
     * 从 Markdown 中分离 frontmatter 和正文
     * 不做 schema 校验，返回原始对象
     */
    static parseRaw(content: string): { frontmatter: Record<string, any>; body: string } {
        const { rawYaml, body } = FrontmatterParser.split(content);
        const parsed = yaml.load(rawYaml) as Record<string, any>;
        return { frontmatter: parsed || {}, body };
    }

    /**
     * 仅提取正文（跳过 frontmatter）
     */
    static extractBody(content: string): string {
        return FrontmatterParser.split(content).body;
    }

    /**
     * 更新 frontmatter 中的单个字段并返回完整内容
     */
    static updateField(content: string, field: string, value: any): string {
        const { rawYaml, body } = FrontmatterParser.split(content);
        const parsed = yaml.load(rawYaml) as Record<string, any>;
        parsed[field] = value;
        const newYaml = yaml.dump(parsed, { lineWidth: -1, noRefs: true }).trim();
        return `---\n${newYaml}\n---\n${body}`;
    }

    /**
     * 向 reviews[] 追加一条记录
     */
    static appendReview(content: string, reviewEntry: string): string {
        const { rawYaml, body } = FrontmatterParser.split(content);
        const parsed = yaml.load(rawYaml) as Record<string, any>;
        if (!parsed.reviews) parsed.reviews = [];
        parsed.reviews.push(reviewEntry);
        const newYaml = yaml.dump(parsed, { lineWidth: -1, noRefs: true }).trim();
        return `---\n${newYaml}\n---\n${body}`;
    }

    // ---- 内部方法 ----

    private static split(content: string): { rawYaml: string; body: string } {
        // 匹配 --- 分隔的 frontmatter
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
        if (!match) {
            throw new Error('文档缺少 YAML frontmatter（需要 --- 分隔符）');
        }
        return { rawYaml: match[1], body: match[2] };
    }
}
