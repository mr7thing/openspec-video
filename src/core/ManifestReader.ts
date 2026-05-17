// ============================================================================
// OpsV Manifest Reader
// Unified read/cache/validate/resolve for _manifest.json
// ============================================================================

import fs from 'fs';
import path from 'path';
import { CircleManifestSchema, CircleManifest, ManifestInfo } from '../types/ManifestSchema';
import { getProjectDir } from '../utils/configLoader';
import { resolveWithin, sanitizePathComponent } from '../utils/pathSecurity';
import { logger } from '../utils/logger';

export class ManifestReader {
  private cache: Map<string, CircleManifest> = new Map();

  read(manifestPath: string): CircleManifest {
    const cached = this.cache.get(manifestPath);
    if (cached) return cached;

    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const result = CircleManifestSchema.safeParse(raw);
    if (!result.success) {
      const errors = result.error.errors.map(e => `  ${e.path.join('.')}: ${e.message}`).join('\n');
      logger.warn(`Manifest validation warning for ${manifestPath}:\n${errors}`);
      this.cache.set(manifestPath, raw as CircleManifest);
      return raw as CircleManifest;
    }
    this.cache.set(manifestPath, result.data);
    return result.data;
  }

  invalidate(manifestPath: string): void {
    this.cache.delete(manifestPath);
  }

  write(manifestPath: string, manifest: CircleManifest): void {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    this.cache.set(manifestPath, manifest);
  }

  /**
   * Resolve manifest for review --circle mode.
   * Replaces the private resolveManifestPath() in review.ts.
   */
  resolveForReview(projectRoot: string, circleOption?: string): ManifestInfo | null {
    const queueRoot = getProjectDir(projectRoot, 'queue');

    if (circleOption) {
      const resolved = path.resolve(circleOption);

      // Case 1: direct manifest file path
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile() && resolved.endsWith('_manifest.json')) {
        const circleDir = path.dirname(resolved);
        const manifest = this.read(resolved);
        return { manifestPath: resolved, circleDir, circleName: path.basename(circleDir), manifest };
      }

      // Case 2: circle directory path
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        const manifestPath = path.join(resolved, '_manifest.json');
        if (fs.existsSync(manifestPath)) {
          const manifest = this.read(manifestPath);
          return { manifestPath, circleDir: resolved, circleName: path.basename(resolved), manifest };
        }
      }

      // Case 3: relative to queueRoot (sanitized)
      const relPath = resolveWithin(queueRoot, circleOption);
      if (relPath && fs.existsSync(relPath) && fs.statSync(relPath).isDirectory()) {
        const manifestPath = path.join(relPath, '_manifest.json');
        if (fs.existsSync(manifestPath)) {
          const manifest = this.read(manifestPath);
          return { manifestPath, circleDir: relPath, circleName: path.basename(relPath), manifest };
        }
      }

      return null;
    }

    // Auto-discover latest manifest by generatedAt
    if (!fs.existsSync(queueRoot)) return null;

    let latest: { path: string; generatedAt: string; circleDir: string; circleName: string } | null = null;

    const entries = fs.readdirSync(queueRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && /_circle\d+$/.test(entry.name)) {
        const mp = path.join(queueRoot, entry.name, '_manifest.json');
        if (fs.existsSync(mp)) {
          const data = this.read(mp);
          const ts = data.generatedAt || '1970-01-01T00:00:00.000Z';
          if (!latest || ts > latest.generatedAt) {
            latest = { path: mp, generatedAt: ts, circleDir: path.join(queueRoot, entry.name), circleName: entry.name };
          }
        }
      }
    }

    if (!latest) return null;

    const manifest = this.read(latest.path);
    return { manifestPath: latest.path, circleDir: latest.circleDir, circleName: latest.circleName, manifest };
  }

  /**
   * Resolve manifest for produce commands (--manifest flag).
   * Replaces produceUtils.resolveManifestPath().
   */
  resolveForProduce(cwd: string, manifestOption?: string): string {
    if (manifestOption) {
      const manifestPath = fs.statSync(manifestOption).isDirectory()
        ? path.join(manifestOption, '_manifest.json')
        : manifestOption;
      if (!fs.existsSync(manifestPath)) {
        throw new Error(`Manifest not found: ${manifestPath}`);
      }
      return manifestPath;
    }

    // Check current directory
    const currentManifest = path.join(cwd, '_manifest.json');
    if (fs.existsSync(currentManifest)) {
      return currentManifest;
    }

    // Check parent directory
    const parentManifest = path.join(cwd, '..', '_manifest.json');
    if (fs.existsSync(parentManifest)) {
      return parentManifest;
    }

    throw new Error(
      `No _manifest.json found. Run inside a circle directory or use --manifest <path>.`
    );
  }
}
