/**
 * 异步文件操作工具类
 * 提供非阻塞的文件系统操作，避免阻塞事件循环
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger';

export interface FileInfo {
    path: string;
    name: string;
    isDirectory: boolean;
    size: number;
    modifiedTime: Date;
}

export class FileUtils {
    /**
     * 检查文件或目录是否存在
     */
    static async exists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 读取文件内容为字符串
     */
    static async readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
        return fs.readFile(filePath, encoding);
    }

    /**
     * 读取文件内容为Buffer
     */
    static async readFileBuffer(filePath: string): Promise<Buffer> {
        return fs.readFile(filePath);
    }

    /**
     * 写入文件内容
     */
    static async writeFile(filePath: string, content: string | Buffer): Promise<void> {
        // 确保父目录存在
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content);
    }

    /**
     * 原子写入：写临时文件再 rename，防止 read-modify-write 竞态
     */
    static async atomicWrite(filePath: string, content: string | Buffer): Promise<void> {
        const tmp = `${filePath}.tmp.${process.pid}`;
        try {
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(tmp, content);
            await fs.rename(tmp, filePath);
        } catch (err) {
            // 清理临时文件
            try { await fs.unlink(tmp); } catch { /* ignore */ }
            throw err;
        }
    }

    /**
     * 追加内容到文件
     */
    static async appendFile(filePath: string, content: string): Promise<void> {
        await fs.appendFile(filePath, content);
    }

    /**
     * 复制文件
     */
    static async copyFile(src: string, dest: string): Promise<void> {
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(src, dest);
    }

    /**
     * 删除文件
     */
    static async deleteFile(filePath: string): Promise<void> {
        try {
            await fs.unlink(filePath);
        } catch (error) {
            // 文件不存在不报错
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }

    /**
     * 读取目录内容（不递归）
     */
    static async readDir(dirPath: string): Promise<FileInfo[]> {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const results: FileInfo[] = [];

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            let size = 0;
            let modifiedTime = new Date();

            if (entry.isFile()) {
                const stats = await fs.stat(fullPath);
                size = stats.size;
                modifiedTime = stats.mtime;
            }

            results.push({
                path: fullPath,
                name: entry.name,
                isDirectory: entry.isDirectory(),
                size,
                modifiedTime
            });
        }

        return results;
    }

    /**
     * 递归读取目录内容
     */
    static async readDirRecursive(dirPath: string): Promise<FileInfo[]> {
        const results: FileInfo[] = [];

        async function traverse(currentPath: string) {
            const entries = await fs.readdir(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);

                if (entry.isDirectory()) {
                    results.push({
                        path: fullPath,
                        name: entry.name,
                        isDirectory: true,
                        size: 0,
                        modifiedTime: new Date()
                    });
                    await traverse(fullPath);
                } else {
                    const stats = await fs.stat(fullPath);
                    results.push({
                        path: fullPath,
                        name: entry.name,
                        isDirectory: false,
                        size: stats.size,
                        modifiedTime: stats.mtime
                    });
                }
            }
        }

        await traverse(dirPath);
        return results;
    }

    /**
     * 确保目录存在（递归创建）
     */
    static async ensureDir(dirPath: string): Promise<void> {
        await fs.mkdir(dirPath, { recursive: true });
    }

    /**
     * 批量读取多个文件
     */
    static async readFilesBatch(
        paths: string[],
        options?: { concurrency?: number }
    ): Promise<Map<string, string>> {
        const concurrency = options?.concurrency ?? 5;
        const results = new Map<string, string>();

        // 分批处理
        for (let i = 0; i < paths.length; i += concurrency) {
            const batch = paths.slice(i, i + concurrency);
            const batchResults = await Promise.allSettled(
                batch.map(async (filePath) => {
                    const content = await FileUtils.readFile(filePath);
                    return { path: filePath, content };
                })
            );

            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    results.set(result.value.path, result.value.content);
                } else {
                    logger.warn(`Failed to read file: ${result.reason}`);
                }
            }
        }

        return results;
    }
}
