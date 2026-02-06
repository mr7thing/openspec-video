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

const LocationSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    lighting: z.string().optional(),
    atmosphere: z.string().optional()
});

export type Character = z.infer<typeof CharacterSchema>;
export type Location = z.infer<typeof LocationSchema>;

export class AssetManager {
    private assetsRoot: string;
    private characters: Map<string, Character> = new Map();
    private locations: Map<string, Location> = new Map();

    constructor(projectRoot: string) {
        this.assetsRoot = path.join(path.resolve(projectRoot), 'assets');
    }

    async loadAssets(): Promise<void> {
        await this.loadCharacters();
        await this.loadLocations();
    }

    private async loadCharacters() {
        const charDir = path.join(this.assetsRoot, 'characters');
        if (!fs.existsSync(charDir)) return;

        const files = fs.readdirSync(charDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

        for (const file of files) {
            const content = fs.readFileSync(path.join(charDir, file), 'utf-8');
            try {
                const raw = yaml.load(content);
                const asset = CharacterSchema.parse(raw);
                this.characters.set(asset.id, asset);
                console.log(`Loaded Character: ${asset.name} (${asset.id})`);
            } catch (err) {
                console.warn(`Failed to validate character asset ${file}:`, err);
            }
        }
    }

    private async loadLocations() {
        const locDir = path.join(this.assetsRoot, 'locations');
        if (!fs.existsSync(locDir)) return;

        const files = fs.readdirSync(locDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

        for (const file of files) {
            const content = fs.readFileSync(path.join(locDir, file), 'utf-8');
            try {
                const raw = yaml.load(content);
                const asset = LocationSchema.parse(raw);
                this.locations.set(asset.id, asset);
                console.log(`Loaded Location: ${asset.name} (${asset.id})`);
            } catch (err) {
                console.warn(`Failed to validate location asset ${file}:`, err);
            }
        }
    }

    getCharacter(id: string): Character | undefined {
        return this.characters.get(id);
    }

    getLocation(id: string): Location | undefined {
        return this.locations.get(id);
    }

    getAllCharacters(): Character[] {
        return Array.from(this.characters.values());
    }
}
