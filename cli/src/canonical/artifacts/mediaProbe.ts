// ============================================================================
// Media probe — ffprobe wrapper for artifact validation
//
// Degrades gracefully: when ffprobe is missing or probing fails, returns an
// empty mediaInfo object so optional checks downgrade to warn. Callers decide
// fail-open vs fail-closed per contract (required probe → fail-closed).
// ============================================================================

import { execFile } from 'node:child_process';
import path from 'node:path';
import { MediaInfo } from '../schema';

export interface ProbeResult {
  mediaInfo: MediaInfo;
  /** True when a probe-capable field was expected but unavailable. */
  degraded: boolean;
}

/** Infer an artifact type from its file extension. */
export function inferMediaType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (['.mp4', '.mov', '.webm', '.mkv', '.avi'].includes(ext)) return 'video';
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)) return 'image';
  if (['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg'].includes(ext)) return 'audio';
  return 'composite';
}

/**
 * Probe a media file for duration / codec / resolution via ffprobe.
 * Returns `{ mediaInfo: {}, degraded: true }` when ffprobe is unavailable
 * or the file cannot be read — never throws for probe failures.
 */
export async function probeMedia(filePath: string): Promise<ProbeResult> {
  try {
    const stdout = await runFfprobe(filePath);
    const info = parseFfprobeJson(stdout);
    if (!info) return { mediaInfo: {}, degraded: true };
    return { mediaInfo: info, degraded: false };
  } catch {
    return { mediaInfo: {}, degraded: true };
  }
}

function runFfprobe(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      },
    );
  });
}

function parseFfprobeJson(stdout: string): MediaInfo | null {
  try {
    const data = JSON.parse(stdout);
    const video = (data.streams ?? []).find((s: { codec_type?: string }) => s.codec_type === 'video');
    const duration = Number(data.format?.duration ?? video?.duration);
    const mediaInfo: MediaInfo = {};
    if (Number.isFinite(duration) && duration > 0) mediaInfo.duration = duration;
    if (video?.codec_name) mediaInfo.codec = video.codec_name;
    if (video?.width && video?.height) mediaInfo.resolution = { w: video.width, h: video.height };
    return mediaInfo;
  } catch {
    return null;
  }
}
