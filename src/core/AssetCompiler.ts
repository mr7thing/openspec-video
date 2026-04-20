import path from 'path';
import { FileUtils } from '../utils/fileUtils';
import { FrontmatterParser } from './FrontmatterParser';
import { RefResolver, RefResult } from './RefResolver';
import { ApprovedRefReader } from './ApprovedRefReader';
import { ProjectFrontmatterSchema, ProjectFrontmatter } from '../types/FrontmatterSchema';

// ============================================================================
// v0.5 资产编译器
// 核心变更: 去掉 has_image，用 RefResolver 解析 @ 引用
// 文件操作已全部异步化
// ============================================================================

export interface ProjectConfig {
    aspect_ratio?: string;
    engine?: string;
    global_style_postfix?: string;
    resolution?: string;
    vision?: string;
}

export interface CompiledPrompt {
    prompt: string;
    attachments: string[];
}

export class AssetCompiler {
    private projectRoot: string;
    private projectConfig: ProjectConfig = {};
    private refResolver: RefResolver;

    constructor(projectRoot: string) {
        this.projectRoot = path.resolve(projectRoot);
        const approvedRefReader = new ApprovedRefReader(this.projectRoot);
        this.refResolver = new RefResolver(this.projectRoot, approvedRefReader);
    }

    /**
     * 从 project.md 加载全局配置
     */
    public async loadProjectConfig(): Promise<void> {
        const projectFile = path.join(this.projectRoot, 'videospec', 'project.md');
        const exists = await FileUtils.exists(projectFile);
        if (!exists) return;

        try {
            const content = await FileUtils.readFile(projectFile);
            const { frontmatter } = FrontmatterParser.parse(content, ProjectFrontmatterSchema);
            this.projectConfig = {
                aspect_ratio: frontmatter.aspect_ratio,
                engine: frontmatter.engine,
                global_style_postfix: frontmatter.global_style_postfix,
                resolution: frontmatter.resolution,
                vision: frontmatter.vision,
            };
        } catch (e) {
            console.error(`[AssetCompiler] project.md 解析失败: ${(e as Error).message}`);
        }
    }

    /**
     * 从包含 @ 引用的 Markdown 文本组装最终 prompt
     * 1. 解析 @ 引用 → 获取 resolved 图片路径
     * 2. 展开引用文本 → 生成 prompt
     * 3. 附加全局样式后缀
     */
    public async assemblePrompt(markdown: string): Promise<CompiledPrompt> {
        // 1. 解析所有 @ 引用
        const refs = await this.refResolver.parseAll(markdown);

        // 2. 展开引用为 prompt 文本 + 收集附件
        const { expandedText, attachments } = await this.refResolver.expandRefsInText(markdown, refs);

        // 3. 清理 Markdown 格式化标记
        let prompt = this.cleanMarkdown(expandedText);

        // 4. 附加全局样式后缀
        if (this.projectConfig.global_style_postfix) {
            prompt += `, ${this.projectConfig.global_style_postfix}`;
        }

        return { prompt: prompt.trim(), attachments };
    }

    /**
     * 从资产描述组装 prompt（用于元素/场景的图像生成）
     */
    public async assembleAssetPrompt(assetId: string, description: string): Promise<CompiledPrompt> {
        const refs = await this.refResolver.parseAll(description);
        const { expandedText, attachments } = await this.refResolver.expandRefsInText(description, refs);

        let prompt = this.cleanMarkdown(expandedText);
        if (this.projectConfig.global_style_postfix) {
            prompt += `, ${this.projectConfig.global_style_postfix}`;
        }

        return { prompt: prompt.trim(), attachments };
    }

    public getProjectConfig(): ProjectConfig {
        return this.projectConfig;
    }

    public getRefResolver(): RefResolver {
        return this.refResolver;
    }

    // ---- 内部方法 ----

    private cleanMarkdown(text: string): string {
        return text
            .replace(/\*\*(.*?)\*\*/g, '$1')   // 去掉加粗
            .replace(/\*(.*?)\*/g, '$1')        // 去掉斜体
            .replace(/!\[.*?\]\(.*?\)/g, '')    // 去掉残留图片标记
            .replace(/^[-*]\s+/gm, '')          // 去掉列表符号
            .replace(/\n{3,}/g, '\n\n')         // 压缩多余空行
            .trim();
    }
}
