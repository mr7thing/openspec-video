// ============================================================================
// OpsV Artifact Preview Adapter
// Resolves committed local artifacts into safe, UI-neutral preview descriptors.
// ============================================================================

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { MediaInfo } from '../canonical/schema';
import { inferMediaType, probeMedia } from '../canonical/artifacts/mediaProbe';
import { resolveContainedReal } from '../utils/pathSecurity';

const PREVIEW_TOKEN_TTL_MS = 60 * 60 * 1000;

export type PreviewKind = 'video' | 'audio' | 'image' | 'document' | 'unknown';
export type PreviewAvailability = 'available' | 'missing' | 'unsupported';

export interface PreviewArtifactInput {
  id: string;
  revisionId: string;
  uri: string;
  type?: string;
  mediaInfo?: MediaInfo;
}

export interface PreviewDescriptor {
  targetId: string;
  revisionId: string;
  kind: PreviewKind;
  mimeType: string;
  previewUrl?: string;
  availability: PreviewAvailability;
  seekable: boolean;
  degraded?: boolean;
  duration?: number;
  codec?: string;
  resolution?: { w: number; h: number };
  frameRate?: number;
  hasAudio?: boolean;
}

export interface PreviewResource {
  absolutePath: string;
  mimeType: string;
  size: number;
  modifiedAtMs: number;
}

interface PreviewTokenPayload {
  relPath: string;
  exp: number;
}

/**
 * The adapter is the only Review UI module that turns a trusted artifact URI
 * into a browser-facing preview URL. Absolute paths never leave this seam.
 */
export class ArtifactPreviewAdapter {
  private readonly secret: string;

  constructor(
    private readonly queueRoot: string,
    secret?: string,
  ) {
    this.secret = secret ?? crypto.randomBytes(32).toString('hex');
  }

  async describe(input: PreviewArtifactInput, options: { probe?: boolean } = {}): Promise<PreviewDescriptor> {
    const kind = this.previewKind(input.type, input.uri);
    const mimeType = mimeTypeFor(input.type, input.uri);
    const resolved = this.resolveArtifact(input.uri);

    if (!resolved || !fs.existsSync(resolved)) {
      return {
        targetId: input.id,
        revisionId: input.revisionId,
        kind,
        mimeType,
        availability: 'missing',
        seekable: false,
        degraded: true,
        ...mediaFields(input.mediaInfo),
      };
    }

    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return {
        targetId: input.id,
        revisionId: input.revisionId,
        kind,
        mimeType,
        availability: 'unsupported',
        seekable: false,
        degraded: true,
      };
    }

    let info = input.mediaInfo;
    let degraded = false;
    if (!info && options.probe && (kind === 'video' || kind === 'audio')) {
      const result = await probeMedia(resolved);
      info = result.mediaInfo;
      degraded = result.degraded;
    }

    const previewable = kind !== 'unknown';
    return {
      targetId: input.id,
      revisionId: input.revisionId,
      kind,
      mimeType,
      previewUrl: previewable ? `/api/review/preview/${this.issueToken(input.uri)}` : undefined,
      availability: previewable ? 'available' : 'unsupported',
      seekable: kind === 'video' || kind === 'audio',
      degraded: degraded || undefined,
      ...mediaFields(info),
    };
  }

  resolveToken(token: string): PreviewResource | null {
    const payload = this.verifyToken(token);
    if (!payload) return null;

    const absolutePath = this.resolveArtifact(payload.relPath);
    if (!absolutePath || !fs.existsSync(absolutePath)) return null;

    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) return null;
    return {
      absolutePath,
      mimeType: mimeTypeFor(undefined, payload.relPath),
      size: stat.size,
      modifiedAtMs: stat.mtimeMs,
    };
  }

  private issueToken(uri: string): string {
    const payload: PreviewTokenPayload = {
      relPath: uri.replace(/\\/g, '/'),
      exp: Date.now() + PREVIEW_TOKEN_TTL_MS,
    };
    return this.signPayload(payload);
  }

  private signPayload(payload: PreviewTokenPayload): string {
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = crypto.createHmac('sha256', this.secret).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  private verifyToken(token: string): PreviewTokenPayload | null {
    try {
      const [encoded, signature] = token.split('.');
      if (!encoded || !signature) return null;
      const expected = crypto.createHmac('sha256', this.secret).update(encoded).digest('base64url');
      if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return null;
      }
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as PreviewTokenPayload;
      if (typeof payload.relPath !== 'string' || typeof payload.exp !== 'number' || Date.now() > payload.exp) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  private resolveArtifact(uri: string): string | null {
    if (!uri || path.isAbsolute(uri) || /^https?:\/\//iu.test(uri)) return null;
    return resolveContainedReal(this.queueRoot, uri.replace(/\\/g, '/'));
  }

  private previewKind(type: string | undefined, uri: string): PreviewKind {
    const normalized = String(type ?? '').toLowerCase();
    if (normalized === 'video' || normalized === 'audio' || normalized === 'image') return normalized;
    if (normalized === 'composite') return 'document';
    const inferred = inferMediaType(uri);
    return inferred === 'video' || inferred === 'audio' || inferred === 'image' ? inferred : 'unknown';
  }
}

function mediaFields(mediaInfo: MediaInfo | undefined): Partial<PreviewDescriptor> {
  if (!mediaInfo) return {};
  return {
    duration: mediaInfo.duration,
    codec: mediaInfo.codec,
    resolution: mediaInfo.resolution,
    frameRate: mediaInfo.frameRate,
    hasAudio: mediaInfo.hasAudio,
  };
}

function mimeTypeFor(type: string | undefined, uri: string): string {
  const ext = path.extname(uri).toLowerCase();
  const byExtension: Record<string, string> = {
    '.aac': 'audio/aac',
    '.avi': 'video/x-msvideo',
    '.bmp': 'image/bmp',
    '.flac': 'audio/flac',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.m4a': 'audio/mp4',
    '.mkv': 'video/x-matroska',
    '.md': 'text/markdown; charset=utf-8',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.txt': 'text/plain; charset=utf-8',
    '.wav': 'audio/wav',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
  };
  if (byExtension[ext]) return byExtension[ext];
  if (type === 'video') return 'video/mp4';
  if (type === 'audio') return 'audio/mpeg';
  if (type === 'image') return 'image/png';
  return 'application/octet-stream';
}
