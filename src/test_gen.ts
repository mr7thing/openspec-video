import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml'; // You might need to install types or just use require if ts-node complains

// Test Asset Parsing
const kitchenPath = 'c:/Gemini/OpenSpec-Video/Project-mv/videospec/assets/scenes/kitchen.md';
if (fs.existsSync(kitchenPath)) {
    const content = fs.readFileSync(kitchenPath, 'utf-8');
    console.log("--- Kitchen Content ---");
    console.log(content.substring(0, 100));

    const parts = content.split(/^---$/m);
    console.log(`\nSplit Parts: ${parts.length}`);
    if (parts.length >= 3) {
        console.log("Part 1 (YAML):", parts[1]);
        console.log("Part 2 (Body):", parts.slice(2).join('---').substring(0, 50));

        try {
            const raw = yaml.load(parts[1]) as any;
            console.log("Parsed YAML:", raw);

            const body = parts.slice(2).join('---');
            const descriptionMatch = body.match(/^(?![#*])(.+)/m);
            console.log("Description Match:", descriptionMatch ? descriptionMatch[1] : "NULL");
        } catch (e) {
            console.log("YAML Parse Error:", e);
        }
    } else {
        console.log("Regex /^---$/m failed to split.");
        // Debug regex
        console.log("Testing split with relaxed regex /^-{3,}\\s*$/m");
        const parts2 = content.split(/^-{3,}\s*$/m);
        console.log(`Relaxed Split Parts: ${parts2.length}`);
    }
} else {
    console.log("Kitchen file not found");
}

// Test Script Regex
const scriptPath = 'c:/Gemini/OpenSpec-Video/Project-mv/videospec/stories/Script.md';
if (fs.existsSync(scriptPath)) {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    console.log("\n--- Script Content ---");
    console.log(content.substring(0, 100));

    const shotRegex = /\*\*Shot (\d+)\*\*: \[?(.*?)\]?([\s\S]*?)(?=\*\*Shot \d+\*\*:|$)/g;
    let match;
    let count = 0;
    while ((match = shotRegex.exec(content)) !== null) {
        count++;
        console.log(`Match ${count}: ID=${match[1]}, Loc=${match[2]}`);
    }
    console.log(`Total Matches: ${count}`);
} else {
    console.log("Script file not found");
}
