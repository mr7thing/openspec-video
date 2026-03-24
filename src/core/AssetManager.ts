import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';

// Define Schemas for Assets
const CharacterSchema = z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    has_image: z.boolean().optional(),
    role: z.string().optional(),
    description: z.string().optional(),
    visual_traits: z.object({
        eye_color: z.string().optional(),
        hair_style: z.string().optional(),
        clothing: z.string().optional(),
        distinctive_features: z.array(z.string()).optional()
    }).optional(),
    reference_images: z.array(z.string()).optional(), // Legacy support
    design_references: z.array(z.string()).optional(),
    approved_references: z.array(z.string()).optional()
}).passthrough(); // Allow unknown keys

const SceneSchema = z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    has_image: z.boolean().optional(),
    description: z.string().optional(),
    lighting: z.string().optional(),
    atmosphere: z.string().optional(),
    reference_images: z.array(z.string()).optional(), // Legacy support
    design_references: z.array(z.string()).optional(),
    approved_references: z.array(z.string()).optional()
}).passthrough();

export type Element = z.infer<typeof CharacterSchema>;
export type Scene = z.infer<typeof SceneSchema>;

export class AssetManager {
    private elementsRoot: string;
    private scenesRoot: string;
    private elements: Map<string, Element> = new Map();
    private scenes: Map<string, Scene> = new Map();

    constructor(projectRoot: string) {
        this.elementsRoot = path.join(path.resolve(projectRoot), 'videospec', 'elements');
        this.scenesRoot = path.join(path.resolve(projectRoot), 'videospec', 'scenes');
    }

    private extractLinksFromSection(body: string, sectionTitleRegex: RegExp, rootPath: string): string[] {
        const lines = body.split('\n');
        let inSection = false;
        const images: string[] = [];
        
        for (const line of lines) {
            if (line.match(/^##\s+.+/)) {
                inSection = sectionTitleRegex.test(line);
                continue;
            }
            if (inSection) {
                const imgRegex = /!\[.*?\]\((.*?)\)/g;
                let imgMatch;
                while ((imgMatch = imgRegex.exec(line)) !== null) {
                    try {
                        const absPath = path.resolve(rootPath, imgMatch[1]);
                        if (fs.existsSync(absPath)) images.push(absPath);
                    } catch (e) {
                        // ignore invalid paths
                    }
                }
            }
        }
        return images;
    }

    async loadAssets(): Promise<void> {
        await this.loadElements();
        await this.loadScenes();
    }

    private async loadElements() {
        if (!fs.existsSync(this.elementsRoot)) return;

        // Support both .yaml (legacy) and .md (new standard)
        const files = fs.readdirSync(this.elementsRoot).filter(f => f.endsWith('.md') || f.endsWith('.yaml') || f.endsWith('.yml'));

        for (const file of files) {
            const content = fs.readFileSync(path.join(this.elementsRoot, file), 'utf-8');
            try {
                let raw: any;
                if (file.endsWith('.md')) {
                    const parts = content.split(/^---$/m);
                    if (parts.length < 3) throw new Error('Invalid Markdown Frontmatter');
                    raw = yaml.load(parts[1]);

                    // Parse Markdown Body for additional fields
                    const body = parts.slice(2).join('---');

                    // 1. Extract Description (all text that isn't a header or key-value pair)
                    // Simple heuristic: Take the first paragraph that doesn't start with # or *
                    const descriptionMatch = body.match(/^(?![#*])\s*(\S.*)/m);
                    if (!raw.description && descriptionMatch) {
                        raw.description = descriptionMatch[1].trim();
                    } else if (!raw.description) {
                        raw.description = "Imported from Markdown";
                    }

                    // 2. Extract Visual Traits from **Key**: Value
                    if (!raw.visual_traits) raw.visual_traits = {};

                    const traitMap: Record<string, string> = {
                        'Eye Color': 'eye_color',
                        'Eyes': 'eye_color',
                        'Hair': 'hair_style',
                        'Hair Style': 'hair_style',
                        'Clothing': 'clothing',
                        'Outfit': 'clothing',
                        'Distinctive Features': 'distinctive_features'
                    };

                    const regex = /\*\*(.*?)\*\*:\s*(.*)/g;
                    let match;
                    while ((match = regex.exec(body)) !== null) {
                        const key = match[1].trim();
                        const value = match[2].trim();
                        const schemaKey = traitMap[key];

                        if (schemaKey) {
                            if (schemaKey === 'distinctive_features') {
                                raw.visual_traits[schemaKey] = [value];
                            } else {
                                raw.visual_traits[schemaKey] = value;
                            }
                        }
                    }

                    // Fallback for name if missing
                    if (!raw.name) raw.name = raw.id;

                } else {
                    raw = yaml.load(content);
                }

                // Ensure visual_traits exists to pass schema
                if (!raw.visual_traits) raw.visual_traits = {};

                // Extract reference images from markdown links ![...](path)
                if (file.endsWith('.md')) {
                    const body = content.split(/^---$/m).slice(2).join('---');

                    // Extract Design References and Approved References
                    const dRefs = this.extractLinksFromSection(body, /Design References|d-ref/i, this.elementsRoot);
                    const aRefs = this.extractLinksFromSection(body, /Approved References|a-ref/i, this.elementsRoot);
                    
                    if (dRefs.length > 0) raw.design_references = dRefs;
                    if (aRefs.length > 0) raw.approved_references = aRefs;

                    // Fallback to unstructured references if strict sections not found
                    if (dRefs.length === 0 && aRefs.length === 0) {
                        const imgRegex = /!\[.*?\]\((.*?)\)/g;
                        const images = [];
                        let imgMatch;
                        while ((imgMatch = imgRegex.exec(body)) !== null) {
                            try {
                                const absPath = path.resolve(this.elementsRoot, imgMatch[1]);
                                if (fs.existsSync(absPath)) images.push(absPath);
                            } catch (e) {
                                // ignore invalid paths
                            }
                        }
                        if (images.length > 0) raw.reference_images = images;
                    }
                }

                const asset = CharacterSchema.parse(raw);
                if (!asset.id) asset.id = file.replace(/\.(md|yaml|yml)$/, '');
                this.elements.set(asset.id, asset);
                console.log(`Loaded Element: ${asset.name} (${asset.id}) via ${file}`);
            } catch (err) {
                console.warn(`Failed to validate character asset ${file}:`, err);
            }
        }
    }

    private async loadScenes() {
        if (!fs.existsSync(this.scenesRoot)) return;

        const files = fs.readdirSync(this.scenesRoot).filter(f => f.endsWith('.md') || f.endsWith('.yaml') || f.endsWith('.yml'));

        for (const file of files) {
            const content = fs.readFileSync(path.join(this.scenesRoot, file), 'utf-8');
            try {
                let raw: any;
                if (file.endsWith('.md')) {
                    const parts = content.split(/^---$/m);
                    if (parts.length < 3) throw new Error('Invalid Markdown Frontmatter');
                    raw = yaml.load(parts[1]);

                    // Parse Markdown Body
                    const body = parts.slice(2).join('---');
                    // 1. Extract Description
                    const descriptionMatch = body.match(/^(?![#*])\s*(\S.*)/m);
                    if (!raw.description && descriptionMatch) {
                        raw.description = descriptionMatch[1].trim();
                    } else if (!raw.description) {
                        raw.description = "Imported from Markdown";
                    }
                    console.log(`DEBUG: ${file} parsed description: "${raw.description}"`);

                    // 2. Extract Atmosphere/Lighting
                    const traitMap: Record<string, string> = {
                        'Lighting': 'lighting',
                        'Atmosphere': 'atmosphere'
                    };

                    const regex = /\*\*(.*?)\*\*:\s*(.*)/g;
                    let match;
                    while ((match = regex.exec(body)) !== null) {
                        const key = match[1].trim();
                        const value = match[2].trim();
                        const schemaKey = traitMap[key];
                        if (schemaKey) raw[schemaKey] = value;
                    }

                    if (!raw.name) raw.name = raw.id;

                    // Extract reference images from markdown links ![...](path)
                    // Extract Design References and Approved References
                    const dRefs = this.extractLinksFromSection(body, /Design References|d-ref/i, this.scenesRoot);
                    const aRefs = this.extractLinksFromSection(body, /Approved References|a-ref/i, this.scenesRoot);
                    
                    if (dRefs.length > 0) raw.design_references = dRefs;
                    if (aRefs.length > 0) raw.approved_references = aRefs;

                    // Fallback to unstructured references if strict sections not found
                    if (dRefs.length === 0 && aRefs.length === 0) {
                        const imgRegex = /!\[.*?\]\((.*?)\)/g;
                        const images = [];
                        let imgMatch;
                        while ((imgMatch = imgRegex.exec(body)) !== null) {
                            try {
                                const absPath = path.resolve(this.scenesRoot, imgMatch[1]);
                                if (fs.existsSync(absPath)) images.push(absPath);
                            } catch (e) {
                                // ignore invalid paths
                            }
                        }
                        if (images.length > 0) raw.reference_images = images;
                    }

                } else {
                    raw = yaml.load(content);
                }

                const asset = SceneSchema.parse(raw);
                if (!asset.id) asset.id = file.replace(/\.(md|yaml|yml)$/, '');
                this.scenes.set(asset.id, asset);
                console.log(`Loaded Scene: ${asset.name} (${asset.id}) via ${file}`);
            } catch (err) {
                console.warn(`Failed to validate scene asset ${file}:`, err);
            }
        }
    }

    getElement(id: string): Element | undefined {
        return this.elements.get(id);
    }

    getScene(id: string): Scene | undefined {
        return this.scenes.get(id);
    }

    // Deprecated alias
    getLocation(id: string): Scene | undefined {
        return this.getScene(id);
    }

    getAllElements(): Element[] {
        return Array.from(this.elements.values());
    }
}
