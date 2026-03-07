import { config } from 'dotenv';
import { SpecParser } from './core/SpecParser';
import { AssetManager } from './core/AssetManager';
import { VideoModelDispatcher } from './executor/VideoModelDispatcher';
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
            const fs = await import('fs');
            const jobsPath = path.join(projectRoot, 'queue', 'video_jobs.json');
            if (fs.existsSync(jobsPath)) {
                const rawJobs = fs.readFileSync(jobsPath, 'utf8');
                const jobs = JSON.parse(rawJobs);

                const dispatcher = new VideoModelDispatcher(projectRoot);
                console.log(`\n▶ Starting Execution Pipeline for ${jobs.length} jobs...\n`);

                for (const job of jobs) {
                    try {
                        // 现硬编码指定模型做验证，之后可转移到 CLI 参数
                        await dispatcher.dispatchJob(job, 'wan2.2-i2v');
                    } catch (e: any) {
                        console.error(`[Main] ❌ Failed to execute job ${job.id}: ${e.message}`);
                    }
                }
            } else {
                console.log('No video_jobs.json found to execute.');
            }
            return;
        }

    } catch (error) {
        console.error("Failed to parse project:", error);
    }
}

main();
