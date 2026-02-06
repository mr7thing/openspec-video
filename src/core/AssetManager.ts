import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';

// Define Schemas for Assets
const CharacterSchema = z.object({
    id: z.string(),
    name: z.string(),
    role: z.string().optional(),
    description: z.string(),
    visual_traits: z.object({
        eye_color: z.string().optional(),
        hair_style: z.string().optional(),
        clothing: z.string().optional(),
        distinctive_features: z.array(z.string()).optional()
    }),
    reference_sheet: z.string().optional() // Path to the reference image
});

const SceneSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    lighting: z.string().optional(),
    atmosphere: z.string().optional()
});

export type Character = z.infer<typeof CharacterSchema>;
export type Scene = z.infer<typeof SceneSchema>;

export class AssetManager {
    private assetsRoot: string;
    private characters: Map<string, Character> = new Map();
    private scenes: Map<string, Scene> = new Map();

    constructor(projectRoot: string) {
        this.assetsRoot = path.join(path.resolve(projectRoot), 'videospec', 'assets');
    }

    async loadAssets(): Promise<void> {
        await this.loadCharacters();
        await this.loadScenes();
    }

    private async loadCharacters() {
        const charDir = path.join(this.assetsRoot, 'characters');
        if (!fs.existsSync(charDir)) return;

        // Support both .yaml (legacy) and .md (new standard)
        const files = fs.readdirSync(charDir).filter(f => f.endsWith('.md') || f.endsWith('.yaml') || f.endsWith('.yml'));

        for (const file of files) {
            const content = fs.readFileSync(path.join(charDir, file), 'utf-8');
            try {
                let raw: any;
                if (file.endsWith('.md')) {
                    const parts = content.split(/^---$/m);
                    if (parts.length < 3) throw new Error('Invalid Markdown Frontmatter');
                    raw = yaml.load(parts[1]);
                    // Optional: You could append parts[2] (the body) to the description if needed.
                } else {
                    raw = yaml.load(content);
                }

                const asset = CharacterSchema.parse(raw);
                this.characters.set(asset.id, asset);
                console.log(`Loaded Character: ${asset.name} (${asset.id}) via ${file}`);
            } catch (err) {
                console.warn(`Failed to validate character asset ${file}:`, err);
            }
        }
    }

    private async loadScenes() {
        const sceneDir = path.join(this.assetsRoot, 'scenes');
        if (!fs.existsSync(sceneDir)) return;

        const files = fs.readdirSync(sceneDir).filter(f => f.endsWith('.md') || f.endsWith('.yaml') || f.endsWith('.yml'));

        for (const file of files) {
            const content = fs.readFileSync(path.join(sceneDir, file), 'utf-8');
            try {
                let raw: any;
                if (file.endsWith('.md')) {
                    const parts = content.split(/^---$/m);
                    if (parts.length < 3) throw new Error('Invalid Markdown Frontmatter');
                    raw = yaml.load(parts[1]);
                } else {
                    raw = yaml.load(content);
                }

                const asset = SceneSchema.parse(raw);
                this.scenes.set(asset.id, asset);
                console.log(`Loaded Scene: ${asset.name} (${asset.id}) via ${file}`);
            } catch (err) {
                console.warn(`Failed to validate scene asset ${file}:`, err);
            }
        }
    }

    getCharacter(id: string): Character | undefined {
        return this.characters.get(id);
    }

    getScene(id: string): Scene | undefined {
        return this.scenes.get(id);
    }

    // Deprecated alias
    getLocation(id: string): Scene | undefined {
        return this.getScene(id);
    }

    getAllCharacters(): Character[] {
        return Array.from(this.characters.values());
    }
}
