// ============================================================================
// OpsV v0.8 File to Base64 Utility
// ============================================================================

import fs from 'fs';
import path from 'path';

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

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
