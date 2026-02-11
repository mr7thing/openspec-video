import { JobGenerator } from './src/automation/JobGenerator';
import path from 'path';
import fs from 'fs';

async function main() {
    const root = process.cwd();
    console.log("Debug Gen: Root =", root);
    const gen = new JobGenerator(root);

    try {
        const sourcePattern = "videospec/assets/characters/*.md";
        const relDir = path.dirname(sourcePattern);
        const dir = path.resolve(root, relDir);
        console.log(`Debug Gen: Calculated Dir = ${dir}`);

        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            console.log(`Debug Gen: Files in dir: ${files.join(', ')}`);
            const mdFiles = files.filter((f: string) => f.endsWith('.md'));
            console.log(`Debug Gen: MD Files: ${mdFiles.length}`);
        } else {
            console.log("Debug Gen: Dir does not exist");
        }

        const jobs = await gen.generateJobs("characters");
        console.log("Debug Gen: Jobs count =", jobs.length);
        if (jobs.length > 0) {
            console.log("First job assets:", jobs[0].assets);
        }
    } catch (e) {
        console.error("Debug Gen Error:", e);
    }
}

main();
