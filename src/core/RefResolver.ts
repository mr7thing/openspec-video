import fs from 'fs';
import path from 'path';
import { ApprovedRefReader } from './ApprovedRefReader';

// ============================================================================
// @ 引用解析引擎
// v0.5 规范第一章 — 仅支持 v0.5 新语法，不兼容旧 [entityId] 语法
// ============================================================================

export interface RefResult {
    type: 'asset' | 'frame';
    assetId: string;
    variant?: string;         // :portrait, :childhood 等
    label: string;            // 描述文本（直接用于 prompt）
    targetDoc: string;        // 目标文档路径
    resolvedImagePath?: string;  // 从 Approved References 解析的图片路径
}

export class RefResolver {
    constructor(
        private projectRoot: string,
        private approvedRefReader: ApprovedRefReader
    ) {}

    /**
     * 解析 Markdown 正文中的所有 @ 引用
     * 语法: @asset_id 描述文本 | @asset_id:variant 描述文本 | @FRAME:shot_id_frame 描述文本
     */
    async parseAll(markdown: string): Promise<RefResult[]> {
        const results: RefResult[] = [];

        // v0.5 唯一合法语法:
        // @标识符 描述文本（描述到行尾或下一个 @ 之前）
        // 注意: @ 后不能有空格，标识符由字母数字下划线冒号组成
        // v0.5.12 支持两种模式:
        // 1. 注解式: (@asset_id:variant) 描述
        // 2. 嵌入式: @asset_id:variant 描述
        // 正则解释: 捕获组 1 为标识符, 捕获组 2 为后续描述文本
        const refRegex = /(?:\()?@([a-zA-Z0-9_:]+)(?:\))?\s+([^\n@]*)/g;

        let match;
        while ((match = refRegex.exec(markdown)) !== null) {
            const [, identifier, label] = match;
            const trimmedLabel = label.trim();
            if (!trimmedLabel) continue;

            results.push(await this.resolve(identifier, trimmedLabel));
        }

        return results;
    }

    /**
     * 解析单个引用标识符
     */
    async resolve(identifier: string, label: string = ''): Promise<RefResult> {
        // ---- 1. @FRAME:shot_01_last ----
        if (identifier.startsWith('FRAME:')) {
            return this.resolveFrame(identifier, label);
        }

        // ---- 2. @asset_id:variant 或 @asset_id ----
        const colonIdx = identifier.indexOf(':');
        const assetId = colonIdx > 0 ? identifier.slice(0, colonIdx) : identifier;
        const variant = colonIdx > 0 ? identifier.slice(colonIdx + 1) : undefined;

        const targetDoc = this.findAssetDoc(assetId);
        let resolvedImagePath: string | undefined;

        if (targetDoc) {
            resolvedImagePath = variant
                ? (await this.approvedRefReader.getVariant(targetDoc, variant)) || undefined
                : (await this.approvedRefReader.getFirst(targetDoc)) || undefined;
        }

        return {
            type: 'asset',
            assetId,
            variant,
            label,
            targetDoc: targetDoc || '',
            resolvedImagePath
        };
    }

    /**
     * 将正文中的 @ 引用展开为 prompt 文本
     * @younger_brother:portrait 弟弟肖像 → "弟弟肖像 [参考图 1]"
     */
    expandRefsInText(
        markdown: string,
        refs: RefResult[]
    ): { expandedText: string; attachments: string[] } {
        let text = markdown;
        const attachments: string[] = [];

        for (const ref of refs) {
            // 构建匹配的原始引用文本
            const refIdentifier = ref.variant
                ? `${ref.assetId}:${ref.variant}`
                : ref.assetId;
            
            // v0.5.12 同时适配带括号与不带括号的替换
            const refPatternNoBracket = `@${refIdentifier} ${ref.label}`;
            const refPatternWithBracket = `(@${refIdentifier}) ${ref.label}`;

            const targetPattern = text.includes(refPatternWithBracket) 
                ? refPatternWithBracket 
                : refPatternNoBracket;

            // 替换为展开后的文本
            if (ref.resolvedImagePath && fs.existsSync(ref.resolvedImagePath)) {
                attachments.push(ref.resolvedImagePath);
                const imageIndex = attachments.length;
                text = text.replace(targetPattern, `${ref.label} [参考图 ${imageIndex}]`);
            } else {
                text = text.replace(targetPattern, ref.label);
            }
        }

        return { expandedText: text, attachments };
    }

    // ---- 内部方法 ----

    private resolveFrame(identifier: string, label: string): RefResult {
        const framePart = identifier.slice(6); // 去掉 "FRAME:"

        // shot_01_last → shot = shot_01, frame = last
        const lastUnderscoreIdx = framePart.lastIndexOf('_');
        const shotId = framePart.slice(0, lastUnderscoreIdx);
        const frameType = framePart.slice(lastUnderscoreIdx + 1);

        // 帧文件命名: shot_01_last.png
        const framePath = path.join(
            this.projectRoot, 'artifacts', `${shotId}_${frameType}.png`
        );

        return {
            type: 'frame',
            assetId: framePart,
            label,
            targetDoc: '',
            resolvedImagePath: fs.existsSync(framePath) ? framePath : undefined
        };
    }

    /**
     * 通过 assetId 查找资产文档路径
     * 搜索顺序: elements/ → scenes/
     * 文件名: @asset_id.md 或 asset_id.md
     */
    private findAssetDoc(assetId: string): string | null {
        const dirs = ['elements', 'scenes'];
        const prefixes = ['@', ''];

        for (const dir of dirs) {
            for (const prefix of prefixes) {
                const p = path.join(
                    this.projectRoot, 'videospec', dir, `${prefix}${assetId}.md`
                );
                if (fs.existsSync(p)) return p;
            }
        }
        return null;
    }
}
