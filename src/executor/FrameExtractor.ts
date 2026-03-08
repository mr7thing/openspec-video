import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = util.promisify(exec);

/**
 * 幽灵组件：在底层负责因果塌缩过程中的截图操作
 * 使用 FFmpeg 进行非常轻量的本地操作。
 */
export class FrameExtractor {
    /**
     * 截取视频的静止尾帧
     * @param videoPath 视频的绝对路径
     * @param outputPath 保存截图的绝对路径
     */
    static async extractLastFrame(videoPath: string, outputPath: string): Promise<string> {
        console.log(`\n[FrameExtractor] 🎬 接收到截帧指令，提取视频尾帧: ${path.basename(videoPath)}...`);

        // 确保输出目录存在
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // FFmpeg command 核心：
        // -sseof -3 表示只看最后 3 秒 (大幅减少 I/O)
        // -update 1 每次遇到帧就覆盖文件，最后剩下的必然是真正的只属于视频结尾的那帧
        // -q:v 2 保证高质量 JPG 提取
        const cmd = `ffmpeg -y -sseof -3 -i "${videoPath}" -update 1 -q:v 2 "${outputPath}"`;

        try {
            await execPromise(cmd);
            console.log(`[FrameExtractor] ✅ 伪像提取完成！尾帧落盘至: ${outputPath}\n`);
            return outputPath;
        } catch (error: any) {
            console.error(`[FrameExtractor] ❌ 帧提取失败: ${error.message}`);
            console.error(`请确认系统中已安装 ffmpeg 并配置到了系统环境变量中。`);
            throw error;
        }
    }
}
