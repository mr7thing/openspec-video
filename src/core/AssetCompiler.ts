import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';

export interface ProjectConfig {
    aspect_ratio?: string;
    engine?: string;
    global_style_postfix?: string;
    resolution?: string;
    vision?: string;
}

export interface AssetRef {
    id: string; // The @ tag (e.g., @role_K)
    type: 'character' | 'scene' | 'prop' | 'other';
    has_image: boolean;
    description: string;
    image_path?: string; // Absolute path if has_image is true
}

export interface CompiledIntent {
    PROMPT_INTENT: string;
    REQUIRED_ASSETS: string[];
}

export class AssetCompiler {
    private projectRoot: string;
    private assetsMapping: Map<string, AssetRef> = new Map();
    private projectConfig: ProjectConfig = {};

    constructor(projectRoot: string) {
        this.projectRoot = path.resolve(projectRoot);
    }

    /**
     * Loads the global project configuration from videospec/project.md
     */
    public loadProjectConfig() {
        const projectFilePath = path.join(this.projectRoot, 'videospec', 'project.md');
        if (fs.existsSync(projectFilePath)) {
            try {
                const content = fs.readFileSync(projectFilePath, 'utf-8');
                const parts = content.split(/^---$/m);
                if (parts.length >= 3) {
                    const rawMeta: any = yaml.load(parts[1]);
                    this.projectConfig = {
                        aspect_ratio: rawMeta.aspect_ratio,
                        engine: rawMeta.engine,
                        global_style_postfix: rawMeta.global_style_postfix,
                        resolution: rawMeta.resolution,
                        vision: rawMeta.vision
                    };
                    // console.log(`[AssetCompiler] Loaded Project Config:`, this.projectConfig);
                }
            } catch (e) {
                console.error(`[AssetCompiler] Failed to parse project.md:`, e);
            }
        }
    }

    /**
     * Scans the 0.2 normative asset folders to index all valid @ prefixed assets.
     */
    public indexAssets() {
        this.assetsMapping.clear();
        const assetDirs = [
            path.join(this.projectRoot, 'videospec', 'elements'),
            path.join(this.projectRoot, 'videospec', 'scenes')
        ];

        for (const dir of assetDirs) {
            if (!fs.existsSync(dir)) continue;

            const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
            for (const file of files) {
                const filePath = path.join(dir, file);
                const content = fs.readFileSync(filePath, 'utf-8');

                try {
                    const parts = content.split(/^---$/m);
                    if (parts.length < 3) continue; // Skip if no YAML frontmatter

                    const rawMeta: any = yaml.load(parts[1]);
                    if (!rawMeta.name || !rawMeta.name.startsWith('@')) continue; // Skip if not a valid 0.2 asset

                    const body = parts.slice(2).join('---').trim();
                    let imagePath: string | undefined;

                    if (rawMeta.has_image === true) {
                        // Extract image path: ![alt](path)
                        const imgMatch = body.match(/!\[.*?\]\((.*?)\)/);
                        if (imgMatch) {
                            let relPath = imgMatch[1];
                            // Remove local file:/// artifact prefixes if any
                            if (relPath.startsWith('file:///')) {
                                relPath = relPath.replace('file:///', '');
                            }
                            // Attempt to resolve. The path in the markdown might be project-root relative or absolute.
                            if (path.isAbsolute(relPath)) {
                                imagePath = relPath;
                            } else {
                                imagePath = path.resolve(this.projectRoot, relPath);
                            }

                            if (!fs.existsSync(imagePath)) {
                                console.warn(`[AssetCompiler] Warning: Physical image not found for ${rawMeta.name} at ${imagePath}`);
                            }
                        }
                    }

                    // Logic to extract detailed vs simplified description
                    let cleanDesc = "";
                    const detailedMatch = body.match(/#\s*(?:详细描述|Detailed Description|Subject Description)[^\n]*\n([\s\S]*?)(?=\n#|$)/i);
                    const simplifiedMatch = body.match(/#\s*(?:简略描述|Simplified Description)[^\n]*\n([\s\S]*?)(?=\n#|$)/i);

                    if (rawMeta.has_image === true && simplifiedMatch) {
                        cleanDesc = simplifiedMatch[1].trim();
                    } else if (rawMeta.has_image === false && detailedMatch) {
                        cleanDesc = detailedMatch[1].trim();
                    } else {
                        // Fallback behavior
                        cleanDesc = body.replace(/!\[.*?\]\((.*?)\)/g, '')
                            .replace(/^#.*$/gm, '')
                            .replace(/<!--[\s\S]*?-->/g, '') // strip HTML comments
                            .trim();
                    }

                    this.assetsMapping.set(rawMeta.name, {
                        id: rawMeta.name,
                        type: rawMeta.type || 'other',
                        has_image: !!rawMeta.has_image,
                        description: cleanDesc,
                        image_path: imagePath
                    });
                    // console.log(`[AssetCompiler] Indexed ${rawMeta.name} -> Image: ${!!imagePath}`);

                } catch (e) {
                    console.error(`[AssetCompiler] Failed to parse asset ${filePath}:`, e);
                }
            }
        }
    }

    /**
     * Resolves the physical paths based on the Agent's REQUIRED_ASSETS queue
     * and constructs the final prompt with sequential [imageN] tags and global styles.
     */
    public assembleFinalPayload(compiledIntent: CompiledIntent): { prompt: string, attachments: string[] } {
        const attachments: string[] = [];
        let finalPrompt = compiledIntent.PROMPT_INTENT;

        // Append global style postfix if it exists
        if (this.projectConfig.global_style_postfix) {
            finalPrompt += `, ${this.projectConfig.global_style_postfix}`;
        }

        // Ensure we only process unique required assets
        const uniqueRequired = [...new Set(compiledIntent.REQUIRED_ASSETS)];

        if (uniqueRequired.length > 0) {
            finalPrompt += "\n参考图：";

            uniqueRequired.forEach(reqAssetId => {
                const asset = this.assetsMapping.get(reqAssetId);
                if (asset && asset.has_image && asset.image_path && fs.existsSync(asset.image_path)) {
                    attachments.push(asset.image_path);
                    const imageIndex = attachments.length;
                    finalPrompt += `[image${imageIndex}] `;
                } else {
                    console.warn(`[AssetCompiler] WARNING: AI requested asset ${reqAssetId}, but no physical image was found or indexed.`);
                }
            });
        }

        return {
            prompt: finalPrompt.trim(),
            attachments
        };
    }

    public getAsset(id: string): AssetRef | undefined {
        return this.assetsMapping.get(id);
    }

    public getProjectConfig(): ProjectConfig {
        return this.projectConfig;
    }
}
