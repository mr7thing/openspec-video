// ============================================================================
// OpsV File to Base64 Utility
// ============================================================================

import fs from 'fs';
import path from 'path';
import { Jimp } from 'jimp';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.jfif', '.gif', '.webp', '.bmp']);

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
};

/** Sync version — reads file as-is, no preprocessing. For non-image files. */
export function fileToBase64(filePath: string): string {
  const data = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_MAP[ext] || 'application/octet-stream';
  const base64Str = data.toString('base64');
  return `data:${mimeType};base64,${base64Str}`;
}

export function fileToDataUri(filePath: string): string {
  return fileToBase64(filePath);
}

/**
 * Async version with image preprocessing via jimp.
 *
 * - http:// and data: are returned unchanged.
 * - Image files (png/jpg/webp/…) are resized to ≤ maxPixels (default 1M),
 *   converted to JPEG quality 85, and returned as a base64 data URI.
 * - Non-image files fall back to the sync read (no preprocessing).
 */
export async function fileToBase64Async(
  filePath: string,
  maxPixels: number = 1_000_000
): Promise<string> {
  if (!filePath) return filePath;
  if (filePath.startsWith('http') || filePath.startsWith('data:')) return filePath;

  const ext = path.extname(filePath).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) {
    return fileToBase64(filePath);
  }

  const image = await Jimp.read(filePath);
  const { width, height } = image.bitmap;

  if (width * height > maxPixels) {
    const scale = Math.sqrt(maxPixels / (width * height));
    image.resize({ w: Math.round(width * scale), h: Math.round(height * scale) });
  }

  const buffer = await image.getBuffer('image/jpeg', { quality: 85 });
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}
