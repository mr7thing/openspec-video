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

        // Test JobGenerator
        const { JobGenerator } = await import('./automation/JobGenerator');
        const generator = new JobGenerator(projectRoot);
        console.log("Generating jobs from Script.md...");
        const jobs = await generator.generateJobs();

        console.log(`Generated ${jobs.length} jobs.`);
        if (jobs.length > 0) {
            console.log("Sample Job Payload:");
            console.log(JSON.stringify(jobs[0].payload, null, 2));
            console.log("Assets:", jobs[0].assets);
        }
    } catch (error) {
        console.error("Failed to parse project:", error);
    }
}

main();
