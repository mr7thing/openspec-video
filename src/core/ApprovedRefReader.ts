import fs from 'fs/promises';
import path from 'path';
import { FileUtils } from '../utils/fileUtils';

// ============================================================================
// Approved References 区域解析器
// v0.5 核心设计: approved_ref 不在 frontmatter，在 Markdown 正文末尾
// ============================================================================

export interface ApprovedRef {
    variant: string;   // ![variant] 方括号中的名称
    filePath: string;  // 解析为绝对路径
}

export class ApprovedRefReader {
    constructor(private projectRoot: string) {}

    /**
     * 获取指定变体的图片绝对路径
     */
    async getVariant(docPath: string, variant: string): Promise<string | null> {
        const refs = await this.parseApprovedRefs(docPath);
        return refs.get(variant) || null;
    }

    /**
     * 获取第一个 approved 图片的绝对路径
     */
    async getFirst(docPath: string): Promise<string | null> {
        const refs = await this.parseApprovedRefs(docPath);
        const first = refs.entries().next();
        return first.done ? null : first.value[1];
    }

    /**
     * 获取所有 approved 引用
     */
    async getAll(docPath: string): Promise<ApprovedRef[]> {
        const refs = await this.parseApprovedRefs(docPath);
        return Array.from(refs.entries()).map(([variant, filePath]) => ({
            variant, filePath
        }));
    }

    /**
     * 检查资产是否有任何 approved 图
     * 通过 assetId 自动查找文档路径
     */
    async hasAnyApproved(assetId: string): Promise<boolean> {
        const docPath = await this.findDocPath(assetId);
        if (!docPath) return false;
        const refs = await this.parseApprovedRefs(docPath);
        return refs.size > 0;
    }

    /**
     * 检查资产是否已完全就绪（有 approved 图 且 status 不是 pending_sync）
     * pending_sync 表示 prompt_en 已回写但 visual_detailed/visual_brief/refs 尚未对齐，
     * Agent 完成对齐并将 status 改为 approved 后才算就绪，下游方可引用。
     */
    async isReadyForDownstream(assetId: string): Promise<boolean> {
        const docPath = await this.findDocPath(assetId);
        if (!docPath) return false;
        const refs = await this.parseApprovedRefs(docPath);
        if (refs.size === 0) return false;
        const { FileUtils } = await import('../utils/fileUtils');
        const content = await FileUtils.readFile(docPath);
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!fmMatch) return true;
        const yaml = await import('js-yaml');
        const fm = yaml.load(fmMatch[1]) as Record<string, any>;
        return fm.status !== 'pending_sync';
    }

    /**
     * 向文档的 Approved References 区追加图片
     */
    async appendApprovedRef(docPath: string, variant: string, imagePath: string): Promise<void> {
        const exists = await FileUtils.exists(docPath);
        if (!exists) return;

        let content = await FileUtils.readFile(docPath);
        const relPath = path.relative(path.dirname(docPath), imagePath).replace(/\\/g, '/');
        const newEntry = `![${variant}](${relPath})`;

        // 找到 ## Approved References 区域
        const sectionRegex = /^(##\s*Approved\s+References\s*\n)/im;
        const match = content.match(sectionRegex);

        if (match && match.index !== undefined) {
            // 在区域标题后插入
            const insertIdx = match.index + match[0].length;
            content = content.slice(0, insertIdx) + `\n${newEntry}\n` + content.slice(insertIdx);
        } else {
            // 区域不存在，追加到文档末尾
            content += `\n\n## Approved References\n\n${newEntry}\n`;
        }

        await FileUtils.writeFile(docPath, content);
    }

    // ---- 内部方法 ----

    /**
     * 解析文档中 ## Approved References 区域的所有 ![variant](path)
     */
    private async parseApprovedRefs(docPath: string): Promise<Map<string, string>> {
        const refs = new Map<string, string>();
        if (!docPath) return refs;

        const exists = await FileUtils.exists(docPath);
        if (!exists) return refs;

        const content = await FileUtils.readFile(docPath);

        // 定位 ## Approved References 区域（到下一个 ## 或文档结尾）
        const sectionMatch = content.match(
            /##\s*Approved\s+References\s*\n([\s\S]*?)(?=\n##\s|$)/i
        );
        if (!sectionMatch) return refs;

        // 解析标准 Markdown 图片语法 ![variant](path)
        const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        let match;
        while ((match = imgRegex.exec(sectionMatch[1])) !== null) {
            const [, variant, filePath] = match;
            if (!variant || !filePath) continue;

            // 解析为绝对路径
            const absPath = path.isAbsolute(filePath)
                ? filePath
                : path.resolve(path.dirname(docPath), filePath);

            refs.set(variant, absPath);
        }
        return refs;
    }

    /**
     * 通过 assetId 查找文档路径
     */
    private async findDocPath(assetId: string): Promise<string | null> {
        const dirs = ['elements', 'scenes'];
        const prefixes = ['@', ''];

        for (const dir of dirs) {
            for (const prefix of prefixes) {
                const p = path.join(this.projectRoot, 'videospec', dir, `${prefix}${assetId}.md`);
                const exists = await FileUtils.exists(p);
                if (exists) return p;
            }
        }
        return null;
    }
}
