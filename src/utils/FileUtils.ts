// ============================================================================
// OpsV v0.8 File Utilities
// ============================================================================

import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger';

export class FileUtils {
  static async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static async readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    return fs.readFile(filePath, encoding);
  }

  static async readFileBuffer(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }

  static async writeFile(filePath: string, content: string | Buffer): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }

  static async atomicWrite(filePath: string, content: string | Buffer): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = filePath + '.tmp';
    await fs.writeFile(tmp, content);
    await fs.rename(tmp, filePath);
  }

  static async appendFile(filePath: string, content: string): Promise<void> {
    await fs.appendFile(filePath, content);
  }

  static async copyFile(src: string, dest: string): Promise<void> {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }

  static async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  static async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  static async readDir(dirPath: string): Promise<string[]> {
    return fs.readdir(dirPath);
  }

  static async readJson<T = any>(filePath: string): Promise<T> {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  }

  static async writeJson(filePath: string, data: any, pretty = true): Promise<void> {
    const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    await FileUtils.atomicWrite(filePath, content);
  }
}
