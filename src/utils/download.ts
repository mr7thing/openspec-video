import axios from 'axios';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';

/**
 * 安全下载文件：使用临时文件 + 原子重命名，防止下载残件。
 * 使用 stream/promises pipeline 确保流正确关闭，避免资源泄漏。
 */
export async function downloadFile(url: string, outputPath: string, timeoutMs = 600000): Promise<void> {
    const dir = path.dirname(outputPath);
    await fsPromises.mkdir(dir, { recursive: true });
    
    const tmpPath = `${outputPath}.tmp`;
    
    try {
        const response = await axios({
            method: 'GET',
            url,
            responseType: 'stream',
            timeout: timeoutMs
        });
        
        const writer = fs.createWriteStream(tmpPath);
        await pipeline(response.data, writer);
        
        // 原子重命名：确保只有完整下载的文件才会出现在目标路径
        await fsPromises.rename(tmpPath, outputPath);
    } catch (err) {
        // 清理临时文件（忽略不存在的错误）
        await fsPromises.unlink(tmpPath).catch(() => {});
        throw err;
    }
}
