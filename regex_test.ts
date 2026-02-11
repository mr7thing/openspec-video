import fs from 'fs';
import path from 'path';

const fileContent = `---
id: "char_unique_id"
name: "Character Name"
role: "Protagonist / Antagonist / Support"
---

![Reference](./example_ref.png)

# Visual Description
`;

const baseDir = path.resolve('videospec/assets/characters');
console.log(`Base Dir: ${baseDir}`);

const regex = /!\[.*?\]\((.*?)\)/g;
let match;
while ((match = regex.exec(fileContent)) !== null) {
    const link = match[1];
    console.log(`Matched Link: '${link}'`);
    const absPath = path.resolve(baseDir, link);
    console.log(`Resolved Path: ${absPath}`);
    if (fs.existsSync(absPath)) {
        console.log("File EXISTS");
    } else {
        console.log("File MISSING");
    }
}
