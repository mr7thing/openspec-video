import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from './logger';

const execAsync = promisify(exec);

/**
 * 从视频中提取首帧和尾帧。
 *
 * @param videoPath 视频文件路径
 * @param outputDir 帧输出目录
 * @param baseName  帧文件前缀
 * @returns 首帧和尾帧的文件路径
 */
export async function extractVideoFrames(
  videoPath: string,
  outputDir: string,
  baseName: string
): Promise<{ first: string; last: string } | null> {
  try {
    await fs.mkdir(outputDir, { recursive: true });

    const firstPath = path.join(outputDir, `${baseName}_first.png`);
    const lastPath = path.join(outputDir, `${baseName}_last.png`);

    // 提取首帧
    await execAsync(`ffmpeg -y -i "${videoPath}" -ss 00:00:00 -vframes 1 "${firstPath}"`);

    // 获取视频时长
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    const duration = parseFloat(stdout.trim());
    const lastTime = Math.max(0, duration - 0.1); // 接近末尾

    // 提取尾帧
    await execAsync(`ffmpeg -y -ss ${lastTime} -i "${videoPath}" -vframes 1 "${lastPath}"`);

    logger.info(`[FrameExtractor] ${baseName}: first → ${path.basename(firstPath)}, last → ${path.basename(lastPath)}`);
    return { first: firstPath, last: lastPath };
  } catch (err: any) {
    logger.warn(`[FrameExtractor] Failed to extract frames for ${baseName}: ${err.message}`);
    return null;
  }
}
