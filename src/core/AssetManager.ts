import fs from 'fs';
import path from 'path';
import { FrontmatterParser } from './FrontmatterParser';
import { ApprovedRefReader, ApprovedRef } from './ApprovedRefReader';
import { BaseFrontmatter } from '../types/FrontmatterSchema';
import { logger } from '../utils/logger';

// ============================================================================
// v0.5 资产管理器
// 核心变更: 去掉 has_image / visual_traits / brief_description
// 用 status + ApprovedRefReader 替代
// ============================================================================

export interface Asset {
    id: string;
    type: string;
    status: string;
    reference?: string;
    refs: string[];
    description: string;
    approvedRefs: ApprovedRef[];
    designRefs: string[];
    filePath: string;
}

export class AssetManager {
    private elementsRoot: string;
    private scenesRoot: string;
    private assets: Map<string, Asset> = new Map();
    private approvedRefReader: ApprovedRefReader;

    constructor(projectRoot: string) {
        const root = path.resolve(projectRoot);
        this.elementsRoot = path.join(root, 'videospec', 'elements');
        this.scenesRoot = path.join(root, 'videospec', 'scenes');
        this.approvedRefReader = new ApprovedRefReader(root);
    }

    async loadAssets(): Promise<void> {
        await this.loadDirectory(this.elementsRoot);
        await this.loadDirectory(this.scenesRoot);
    }

    private async loadDirectory(dirPath: string): Promise<void> {
        if (!fs.existsSync(dirPath)) return;

        // v0.5: 仅支持 .md 文件
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));

        for (const file of files) {
            const filePath = path.join(dirPath, file);
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const { frontmatter, body } = FrontmatterParser.parseRaw(content);

                const id = file.replace(/^@/, '').replace(/\.md$/, '');

                // 描述从正文第一段提取（非标题、非图片的纯文本）
                const description = this.extractFirstParagraph(body);

                // Approved Refs 从 Markdown 正文的 ## Approved References 区读取
                const approvedRefs = this.approvedRefReader.getAll(filePath);

                // Design Refs 从 Markdown 正文的 ## Design References 区读取
                const designRefs = this.extractDesignRefs(body, filePath);

                const asset: Asset = {
                    id,
                    type: frontmatter.type || 'other',
                    status: frontmatter.status || 'drafting',
                    reference: frontmatter.reference,
                    refs: frontmatter.refs || [],
                    description,
                    approvedRefs,
                    designRefs,
                    filePath,
                };

                this.assets.set(id, asset);
                logger.info(`资产加载: ${id} (${asset.type}, ${asset.status}) ` +
                    `approved: ${approvedRefs.length}张`);

            } catch (err) {
                logger.warn(`资产解析失败 ${file}: ${(err as Error).message}`);
            }
        }
    }

    // ---- 访问方法 ----

    getAsset(id: string): Asset | undefined {
        return this.assets.get(id);
    }

    getElement(id: string): Asset | undefined {
        const asset = this.assets.get(id);
        return asset && ['character', 'prop', 'costume'].includes(asset.type)
            ? asset : undefined;
    }

    getScene(id: string): Asset | undefined {
        const asset = this.assets.get(id);
        return asset?.type === 'scene' ? asset : undefined;
    }

    getAllAssets(): Asset[] {
        return Array.from(this.assets.values());
    }

    getAllElements(): Asset[] {
        return this.getAllAssets().filter(a =>
            ['character', 'prop', 'costume'].includes(a.type)
        );
    }

    getAllScenes(): Asset[] {
        return this.getAllAssets().filter(a => a.type === 'scene');
    }

    /**
     * 获取资产的第一个 approved 图的绝对路径
     * 替代旧的 has_image + image_path 模式
     */
    getApprovedImagePath(id: string): string | null {
        const asset = this.assets.get(id);
        if (!asset || asset.approvedRefs.length === 0) return null;
        return asset.approvedRefs[0].filePath;
    }

    // ---- 内部方法 ----

    /**
     * 提取正文第一段纯文本（排除标题、图片、HTML 注释）
     */
    private extractFirstParagraph(body: string): string {
        const lines = body.split('\n');
        const paragraphLines: string[] = [];
        let foundContent = false;

        for (const line of lines) {
            const trimmed = line.trim();
            // 跳过空行（段前）
            if (!foundContent && !trimmed) continue;
            // 跳过标题行
            if (trimmed.startsWith('#')) {
                if (foundContent) break; // 遇到下一个标题就停
                continue;
            }
            // 跳过图片行
            if (trimmed.startsWith('![')) continue;
            // 跳过 HTML 注释
            if (trimmed.startsWith('<!--')) continue;
            // 跳过分隔线
            if (trimmed.match(/^[-=]{3,}$/)) continue;

            if (trimmed) {
                foundContent = true;
                paragraphLines.push(trimmed);
            } else if (foundContent) {
                break; // 段后空行 → 段落结束
            }
        }

        return paragraphLines.join(' ').trim() || '(无描述)';
    }

    /**
     * 从 ## Design References 区提取图片路径
     */
    private extractDesignRefs(body: string, docPath: string): string[] {
        const sectionMatch = body.match(
            /##\s*Design\s+References\s*\n([\s\S]*?)(?=\n##\s|$)/i
        );
        if (!sectionMatch) return [];

        const refs: string[] = [];
        const imgRegex = /!\[.*?\]\(([^)]+)\)/g;
        let match;
        while ((match = imgRegex.exec(sectionMatch[1])) !== null) {
            const absPath = path.isAbsolute(match[1])
                ? match[1]
                : path.resolve(path.dirname(docPath), match[1]);
            refs.push(absPath);
        }
        return refs;
    }
}
