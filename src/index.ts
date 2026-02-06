import { SpecParser } from './core/SpecParser';
import { AssetManager } from './core/AssetManager';
import path from 'path';

async function main() {
    try {
        // Point to the project-demo directory
        const projectRoot = path.join(process.cwd(), 'project-demo');
        console.log(`Loading project from: ${projectRoot}`);

        // Test SpecParser
        const parser = new SpecParser(projectRoot);
        const config = await parser.parseProjectConfig();
        console.log("Successfully parsed project configuration:");
        console.log(`Project Context: ${config.context.narrative}`);

        // Test AssetManager
        const assetManager = new AssetManager(projectRoot);
        await assetManager.loadAssets();

        const chars = assetManager.getAllCharacters();
        console.log(`Loaded ${chars.length} characters.`);
        if (chars.length > 0) {
            console.log(`First Character: ${chars[0].name} - ${chars[0].description}`);
        }

    } catch (error) {
        console.error("Failed to parse project:", error);
    }
}

main();
