import path from 'path';
import { FileUtils } from '../utils/fileUtils';
import { FrontmatterParser } from './FrontmatterParser';
import { ApprovedRefReader, ApprovedRef } from './ApprovedRefReader';
import { BaseFrontmatter } from '../types/FrontmatterSchema';
import { logger } from '../utils/logger';

// ============================================================================
// v0.5 资产管理器
// 核心变更: 去掉 has_image / visual_traits / brief_description
// 用 status + ApprovedRefReader 替代
// 文件操作已全部异步化
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
        const dirExists = await FileUtils.exists(dirPath);
        if (!dirExists) return;

        // v0.5: 仅支持 .md 文件
        const entries = await FileUtils.readDir(dirPath);
        const files = entries.filter(e => !e.isDirectory && e.name.endsWith('.md'));

        for (const fileEntry of files) {
            const filePath = fileEntry.path;
            try {
                const content = await FileUtils.readFile(filePath);
                const { frontmatter, body } = FrontmatterParser.parseRaw(content);

                const id = fileEntry.name.replace(/^@/, '').replace(/\.md$/, '');

                // 描述从正文第一段提取（非标题、非图片的纯文本）
                const description = FrontmatterParser.extractFirstParagraph(body);

                // Approved Refs 从 Markdown 正文的 ## Approved References 区读取
                const approvedRefs = await this.approvedRefReader.getAll(filePath);

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
                logger.warn(`资产解析失败 ${fileEntry.name}: ${(err as Error).message}`);
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
