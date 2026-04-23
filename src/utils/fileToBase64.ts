import fs from 'fs/promises';
import path from 'path';

/**
 * 将本地文件转换为 Base64 Data URI，供 API 直接消费。
 *
 * Seedance 2.0 Content Generation API 支持:
 *   image_url.url = "data:image/png;base64,iVBOR..."
 *   video_url.url = "data:video/mp4;base64,AAAA..."
 *   audio_url.url = "data:audio/mpeg;base64,AAAA..."
 */

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

export function isLocalFilePath(url: string): boolean {
  return (
    !url.startsWith('http://') &&
    !url.startsWith('https://') &&
    !url.startsWith('data:') &&
    !url.startsWith('asset://')
  );
}

export async function fileToDataUri(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const base64 = buffer.toString('base64');
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_MAP[ext] || 'application/octet-stream';
  return `data:${mime};base64,${base64}`;
}

/**
 * 解析 content 数组中的本地文件路径，转换为 Base64 Data URI。
 * 相对路径基于 batchDir 解析。
 *
 * 注意：视频(video_url)不支持 Base64（官方 API 限制），仅转换图片和音频。
 */
export async function inlineLocalFiles(
  content: any[],
  batchDir: string
): Promise<void> {
  for (const item of content) {
    const url = item.image_url?.url ?? item.video_url?.url ?? item.audio_url?.url;
    if (!url || !isLocalFilePath(url)) continue;

    // 视频不支持 Base64，跳过
    if (item.video_url) continue;

    const absPath = path.isAbsolute(url) ? url : path.resolve(batchDir, url);
    const dataUri = await fileToDataUri(absPath);

    if (item.image_url) item.image_url.url = dataUri;
    if (item.audio_url) item.audio_url.url = dataUri;
  }
}

/**
 * 将单个本地文件路径转为 Base64 Data URI（用于旧版 API 的顶层字段）。
 */
export async function inlineLocalFile(
  filePath: string,
  baseDir: string
): Promise<string> {
  if (!isLocalFilePath(filePath)) return filePath;
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
  return fileToDataUri(absPath);
}
