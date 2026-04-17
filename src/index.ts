import { config } from 'dotenv';
import { SpecParser } from './core/SpecParser';
import { AssetManager } from './core/AssetManager';
import path from 'path';

// 加载项目根目录下的 .env 文件
config();

async function main() {
    try {
        // Point to the project-demo directory
        const projectRoot = path.join(process.cwd(), 'project-demo');
        console.log(`Loading project from: ${projectRoot}`);

        // 此处原有解析代码不变
        // ...

        // ---- 0.3 新增 CLI 原语测试入口 ----
        const args = process.argv.slice(2);
        if (args[0] === 'execute') {
             console.log("Use OpsV CLI to execute jobs now.");
             return;
        }

    } catch (error) {
        console.error("Failed to parse project:", error);
    }
}

main();
