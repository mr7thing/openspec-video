// ============================================================================
// OpsV v0.8.13 — opsv review
// Supports --circle mode: manifest-driven review with zero hardcoded paths
// Legacy mode (no --circle) preserves original behavior
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import express from 'express';
import { execSync } from 'child_process';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { parseOutputFilename } from '../executor/naming';
import { logger } from '../utils/logger';

export function registerReviewCommand(program: Command): void {
  program
    .command('review')
    .description('Start visual review server')
    .option('--port <number>', 'Server port', '3100')
    .option('--circle [path]', 'Run in manifest-driven mode. Auto-discovers latest manifest if no path given. Accepts circle dir or manifest file path.')
    .option('--latest', 'Show only latest circle outputs (legacy mode)')
    .option('--all', 'Show all circle outputs (legacy mode)')
    .option('--ttl <seconds>', 'Auto-shutdown after idle seconds (default: 900)', '900')
    .action(async (options: any) => {
      try {
        const projectRoot = process.cwd();
        const queueRoot = path.join(projectRoot, 'opsv-queue');

        if (!fs.existsSync(queueRoot)) {
          console.error(chalk.red(`Queue directory not found: ${queueRoot}`));
          console.error(chalk.yellow('Run "opsv circle create" first.'));
          process.exit(1);
        }

        const port = parseInt(options.port, 10);
        const ttl = parseInt(options.ttl, 10);

        // Resolve manifest for --circle mode
        const circleMode = options.circle !== undefined;
        const manifestInfo = circleMode
          ? resolveManifestPath(projectRoot, options.circle === true ? undefined : options.circle)
          : null;

        if (circleMode && !manifestInfo) {
          console.error(chalk.red('No manifest found. Run "opsv circle create" first.'));
          process.exit(1);
        }

        if (circleMode && manifestInfo) {
          const manifest = JSON.parse(fs.readFileSync(manifestInfo.manifestPath, 'utf-8'));
          const assetCount = Object.keys(manifest.assets || {}).length;
          console.log(chalk.cyan(`Manifest-driven mode: ${manifestInfo.circleName} (${assetCount} assets, target: ${manifest.target || 'videospec'})`));
        }

        // Auto-commit pending changes before review
        try {
          execSync('git add -A', { cwd: projectRoot, stdio: 'ignore' });
          const diff = execSync('git diff --cached --quiet', { cwd: projectRoot, encoding: 'utf-8', stdio: 'pipe' });
          void diff;
        } catch {
          try {
            const timestamp = new Date().toISOString();
            execSync(`git commit -m "pre-review checkpoint: ${timestamp}"`, { cwd: projectRoot, stdio: 'ignore' });
            console.log(chalk.green(`Changes committed before review (${timestamp})`));
          } catch {
            // May fail if git not initialized or nothing to commit
          }
        }

        const app = express();

        // API: List documents
        app.get('/api/documents', (_req, res) => {
          if (circleMode && manifestInfo) {
            const docs = scanDocumentsFromManifest(
              manifestInfo.manifestPath,
              manifestInfo.circleDir,
              manifestInfo.circleName,
              projectRoot
            );
            res.json(docs);
          } else {
            res.json(scanDocuments(projectRoot, queueRoot));
          }
        });

        // API: Get document content
        app.get('/api/documents/:circle/:docId', (req, res) => {
          const { circle, docId } = req.params;

          if (circleMode && manifestInfo) {
            const doc = findDocumentFromManifest(
              manifestInfo.manifestPath,
              manifestInfo.circleDir,
              manifestInfo.circleName,
              projectRoot,
              docId
            );
            if (!doc) {
              return res.status(404).json({ error: 'Document not found' });
            }
            res.json(doc);
          } else {
            const doc = findDocument(projectRoot, circle, docId);
            if (!doc) {
              return res.status(404).json({ error: 'Document not found' });
            }
            res.json(doc);
          }
        });

        // API: List circles
        app.get('/api/circles', (_req, res) => {
          if (circleMode && manifestInfo) {
            const manifest = JSON.parse(fs.readFileSync(manifestInfo.manifestPath, 'utf-8'));
            const assets = manifest.assets || {};
            const assetCount = Object.keys(assets).length;
            const layers = new Set(Object.values(assets).map((a: any) => a.layer));
            res.json([{
              name: manifestInfo.circleName,
              target: manifest.target || '',
              assetCount,
              layers: layers.size,
            }]);
          } else {
            res.json(scanCircles(queueRoot, options));
          }
        });

        // API: Get assets for a circle directory
        app.get('/api/circles/:name/assets', (req, res) => {
          const circleDir = path.join(queueRoot, req.params.name);
          const manifestPath = path.join(circleDir, '_manifest.json');

          if (!fs.existsSync(manifestPath)) {
            return res.json({ assets: [] });
          }

          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          const assetsMap: Record<string, any> = manifest.assets || {};

          const enriched = Object.entries(assetsMap).map(([id, info]: [string, any]) => {
            const outputs: string[] = [];
            const dirs = fs.readdirSync(circleDir).filter((d) => !d.startsWith('_'));

            for (const providerDir of dirs) {
              const providerPath = path.join(circleDir, providerDir);
              if (!fs.statSync(providerPath).isDirectory()) continue;

              const files = fs.readdirSync(providerPath);
              const matches = files.filter(
                (f) => f.startsWith(id) && !f.endsWith('.json') && !f.endsWith('.log')
              );
              for (const f of matches) {
                outputs.push(path.join(providerDir, f));
              }
            }

            return { id, status: info.status, layer: info.layer, category: info.category, outputs };
          });

          res.json({ circle: req.params.name, assets: enriched });
        });

        // Serve output files
        app.get('/api/files/:circle/:provider/:file', (req, res) => {
          const filePath = path.join(queueRoot, req.params.circle, req.params.provider, req.params.file);
          if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
          } else {
            res.status(404).send('File not found');
          }
        });

        // Approve endpoint — unified: reads manifest for target, uses findAssetFilePathUnder
        app.post('/api/approve/:circle/:assetId', express.json(), async (req, res) => {
          const { circle, assetId } = req.params;
          const { outputFile, taskJsonPath } = req.body || {};

          try {
            const now = new Date().toISOString();

            const parsed = outputFile ? parseOutputFilename(outputFile) : { isModified: false };
            const newStatus = parsed.isModified ? 'syncing' : 'approved';

            let reviewEntry = `${now} approved output: ${outputFile || assetId}`;
            if (parsed.isModified && taskJsonPath) {
              reviewEntry += ` | modified_task: ${taskJsonPath}`;
            }

            // Read circle manifest to get target for source document lookup
            const circleDir = path.join(queueRoot, circle);
            const circleManifestPath = path.join(circleDir, '_manifest.json');
            let targetRoot = path.join(projectRoot, 'videospec');

            if (fs.existsSync(circleManifestPath)) {
              const manifest = JSON.parse(fs.readFileSync(circleManifestPath, 'utf-8'));
              if (manifest.target) {
                targetRoot = path.resolve(projectRoot, manifest.target);
              }
            }

            // Find source document using manifest.target (no hardcoded subdirs)
            const sourceDocPath = findAssetFilePathUnder(targetRoot, assetId);

            if (sourceDocPath) {
              const content = fs.readFileSync(sourceDocPath, 'utf-8');
              const updated = FrontmatterParser.appendReview(content, reviewEntry);
              const finalContent = FrontmatterParser.updateField(updated, 'status', newStatus);
              fs.writeFileSync(sourceDocPath, finalContent);
            }

            // Update _manifest.json assets field
            if (fs.existsSync(circleManifestPath)) {
              const manifest = JSON.parse(fs.readFileSync(circleManifestPath, 'utf-8'));
              if (manifest.assets && manifest.assets[assetId]) {
                manifest.assets[assetId].status = newStatus;
              }
              for (const c of manifest.circles || []) {
                if (c.status && c.status[assetId]) {
                  c.status[assetId] = newStatus;
                }
              }
              fs.writeFileSync(circleManifestPath, JSON.stringify(manifest, null, 2));
            }

            const note = parsed.isModified
              ? 'Modified task — agent must align fields before setting approved'
              : 'Original task — directly approved';

            res.json({ success: true, status: newStatus, note });
          } catch (err: any) {
            res.status(500).json({ error: err.message });
          }
        });

        // Serve static review UI from templates/review-ui/
        const publicDir = path.join(__dirname, '..', '..', 'templates', 'review-ui');
        if (fs.existsSync(publicDir)) {
          app.use(express.static(publicDir));
        } else {
          app.get('/', (_req, res) => {
            res.send(`
              <html><body>
              <h1>OpsV Review</h1>
              <p>Review UI not built. Use the API endpoints:</p>
              <ul>
                <li>GET /api/circles</li>
                <li>GET /api/circles/:name/assets</li>
                <li>GET /api/files/:circle/:provider/:file</li>
                <li>POST /api/approve/:circle/:assetId</li>
              </ul>
              </body></html>
            `);
          });
        }

        const server = app.listen(port, () => {
          console.log(chalk.green(`Review server running at http://localhost:${port}`));
        });

        // TTL auto-shutdown
        if (ttl > 0) {
          let idleTimer: NodeJS.Timeout;

          const resetTimer = () => {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
              console.log(chalk.yellow(`Idle for ${ttl}s, shutting down...`));
              server.close();
              process.exit(0);
            }, ttl * 1000);
          };

          resetTimer();
          server.on('request', resetTimer);
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

// ============================================================================
// Manifest resolution
// ============================================================================

interface ManifestInfo {
  manifestPath: string;
  circleDir: string;
  circleName: string;
}

function resolveManifestPath(projectRoot: string, circleOption?: string): ManifestInfo | null {
  const queueRoot = path.join(projectRoot, 'opsv-queue');

  if (circleOption) {
    const resolved = path.resolve(circleOption);

    // Case 1: direct manifest file path
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile() && resolved.endsWith('_manifest.json')) {
      const circleDir = path.dirname(resolved);
      return { manifestPath: resolved, circleDir, circleName: path.basename(circleDir) };
    }

    // Case 2: circle directory path
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      const manifestPath = path.join(resolved, '_manifest.json');
      if (fs.existsSync(manifestPath)) {
        return { manifestPath, circleDir: resolved, circleName: path.basename(resolved) };
      }
    }

    // Case 3: relative to queueRoot
    const relPath = path.join(queueRoot, circleOption);
    if (fs.existsSync(relPath) && fs.statSync(relPath).isDirectory()) {
      const manifestPath = path.join(relPath, '_manifest.json');
      if (fs.existsSync(manifestPath)) {
        return { manifestPath, circleDir: relPath, circleName: path.basename(relPath) };
      }
    }

    return null;
  }

  // Auto-discover latest manifest by generatedAt
  if (!fs.existsSync(queueRoot)) return null;

  let latest: { path: string; generatedAt: string; circleDir: string; circleName: string } | null = null;

  const entries = fs.readdirSync(queueRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && /\.circle\d+$/.test(entry.name)) {
      const mp = path.join(queueRoot, entry.name, '_manifest.json');
      if (fs.existsSync(mp)) {
        const data = JSON.parse(fs.readFileSync(mp, 'utf-8'));
        const ts = data.generatedAt || '1970-01-01T00:00:00.000Z';
        if (!latest || ts > latest.generatedAt) {
          latest = { path: mp, generatedAt: ts, circleDir: path.join(queueRoot, entry.name), circleName: entry.name };
        }
      }
    }
  }

  return latest
    ? { manifestPath: latest.path, circleDir: latest.circleDir, circleName: latest.circleName }
    : null;
}

// ============================================================================
// Generic asset file path resolver (no hardcoded subdirs)
// ============================================================================

function findAssetFilePathUnder(targetRoot: string, assetId: string): string | undefined {
  const prefixes = ['@', ''];

  // Check targetRoot itself
  for (const prefix of prefixes) {
    const p = path.join(targetRoot, `${prefix}${assetId}.md`);
    if (fs.existsSync(p)) return p;
  }

  // Scan all subdirectories under targetRoot
  if (fs.existsSync(targetRoot)) {
    const entries = fs.readdirSync(targetRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        for (const prefix of prefixes) {
          const p = path.join(targetRoot, entry.name, `${prefix}${assetId}.md`);
          if (fs.existsSync(p)) return p;
        }
      }
    }
  }

  return undefined;
}

// ============================================================================
// Legacy mode helpers (unchanged logic, preserved for backward compatibility)
// ============================================================================

function scanCircles(queueRoot: string, options: any): any[] {
  const circles: any[] = [];

  if (!fs.existsSync(queueRoot)) return circles;

  const entries = fs.readdirSync(queueRoot).filter((d) => {
    const fullPath = path.join(queueRoot, d);
    return fs.statSync(fullPath).isDirectory() && /\.circle\d+$/.test(d);
  });

  for (const name of entries) {
    const manifestPath = path.join(queueRoot, name, '_manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const assets = manifest.assets || {};
      const assetCount = Object.keys(assets).length;
      const layers = new Set(Object.values(assets).map((a: any) => a.layer));
      circles.push({
        name,
        target: manifest.target || '',
        assetCount,
        layers: layers.size,
      });
    }
  }

  if (options.latest && circles.length > 0) {
    return [circles[circles.length - 1]];
  }

  return circles;
}

interface DocumentInfo {
  docId: string;
  docPath: string;
  circle: string;
  category: string;
  status: string;
  content?: string;
  outputs: Array<{ circle: string; provider: string; filename: string; path: string }>;
}

/**
 * Legacy: Global review — scans videospec/ subdirectories for all .md documents,
 * enriched with category/status from all circle manifests when available.
 */
function scanDocuments(projectRoot: string, queueRoot: string): DocumentInfo[] {
  const docs: DocumentInfo[] = [];
  const targetDir = path.join(projectRoot, 'videospec');

  if (!fs.existsSync(targetDir)) return docs;

  // 1. Read all manifests to build asset info and output index
  const assetInfoMap: Record<string, { category: string; status: string }> = {};
  const outputIndex: Record<string, Array<{ circle: string; provider: string; filename: string }>> = {};

  if (fs.existsSync(queueRoot)) {
    const circleDirs = fs.readdirSync(queueRoot).filter((d) => /\.circle\d+$/.test(d));
    for (const circleDir of circleDirs) {
      const circlePath = path.join(queueRoot, circleDir);
      const manifestPath = path.join(circlePath, '_manifest.json');

      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const assetsMap = manifest.assets || {};
        for (const [id, info] of Object.entries(assetsMap)) {
          assetInfoMap[id] = {
            category: (info as any).category || 'other',
            status: (info as any).status || 'drafting',
          };
        }
      }

      const providerDirs = fs.readdirSync(circlePath).filter((d) => !d.startsWith('_'));
      for (const providerDir of providerDirs) {
        const providerPath = path.join(circlePath, providerDir);
        if (!fs.statSync(providerPath).isDirectory()) continue;

        const files = fs.readdirSync(providerPath).filter((f) => !f.endsWith('.json') && !f.endsWith('.log'));
        for (const file of files) {
          const docId = file.replace(/(_\d+)+(\.[^.]+)$/, '');
          if (!outputIndex[docId]) outputIndex[docId] = [];
          outputIndex[docId].push({ circle: circleDir, provider: providerDir, filename: file });
        }
      }
    }
  }

  // 2. Scan videospec/ subdirectories for ALL .md files (global review)
  const subdirs = fs.readdirSync(targetDir, { withFileTypes: true });
  for (const subdir of subdirs) {
    if (!subdir.isDirectory()) continue;

    const dirPath = path.join(targetDir, subdir.name);
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      const docId = file.replace(/^@/, '').replace(/\.md$/, '');
      const info = assetInfoMap[docId];

      const doc: DocumentInfo = {
        docId,
        docPath: path.join(dirPath, file),
        circle: subdir.name,
        category: info?.category || subdir.name,
        status: info?.status || 'drafting',
        outputs: (outputIndex[docId] || []).map((o) => ({
          circle: o.circle,
          provider: o.provider,
          filename: o.filename,
          path: path.join(o.circle, o.provider, o.filename),
        })),
      };

      docs.push(doc);
    }
  }

  return docs;
}

function findDocument(projectRoot: string, circle: string, docId: string): DocumentInfo | null {
  const docs = scanDocuments(projectRoot, path.join(projectRoot, 'opsv-queue'));
  const doc = docs.find((d) => d.circle === circle && d.docId === docId);
  if (!doc) return null;

  if (fs.existsSync(doc.docPath)) {
    doc.content = fs.readFileSync(doc.docPath, 'utf-8');
  }
  return doc;
}

// ============================================================================
// Manifest-driven helpers (--circle mode)
// ============================================================================

function scanDocumentsFromManifest(
  manifestPath: string,
  circleDir: string,
  circleName: string,
  projectRoot: string
): DocumentInfo[] {
  if (!fs.existsSync(manifestPath)) return [];

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const assetsMap: Record<string, any> = manifest.assets || {};
  const targetRoot = path.resolve(projectRoot, manifest.target || 'videospec');

  const docs: DocumentInfo[] = [];

  for (const [id, info] of Object.entries(assetsMap)) {
    const docPath = findAssetFilePathUnder(targetRoot, id);
    if (!docPath) continue;

    const outputs: Array<{ circle: string; provider: string; filename: string; path: string }> = [];
    const dirs = fs.readdirSync(circleDir).filter((d) => !d.startsWith('_'));

    for (const providerDir of dirs) {
      const providerPath = path.join(circleDir, providerDir);
      if (!fs.statSync(providerPath).isDirectory()) continue;

      const files = fs.readdirSync(providerPath).filter((f) => !f.endsWith('.json') && !f.endsWith('.log'));
      const matches = files.filter((f) => f.startsWith(id));
      for (const f of matches) {
        outputs.push({
          circle: circleName,
          provider: providerDir,
          filename: f,
          path: path.join(circleName, providerDir, f),
        });
      }
    }

    docs.push({
      docId: id,
      docPath,
      circle: circleName,
      category: (info as any).category || 'other',
      status: (info as any).status || 'drafting',
      outputs,
    });
  }

  return docs;
}

function findDocumentFromManifest(
  manifestPath: string,
  circleDir: string,
  circleName: string,
  projectRoot: string,
  docId: string
): DocumentInfo | null {
  const docs = scanDocumentsFromManifest(manifestPath, circleDir, circleName, projectRoot);
  const doc = docs.find((d) => d.docId === docId);
  if (!doc) return null;

  if (fs.existsSync(doc.docPath)) {
    doc.content = fs.readFileSync(doc.docPath, 'utf-8');
  }
  return doc;
}
