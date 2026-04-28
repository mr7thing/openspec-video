// ============================================================================
// OpsV v0.8.2 — opsv review
// Scans *.circleN/ directories, reads/writes _manifest.json assets
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import express from 'express';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { parseOutputFilename } from '../executor/naming';
import { logger } from '../utils/logger';

export function registerReviewCommand(program: Command): void {
  program
    .command('review')
    .description('Start visual review server')
    .option('--port <number>', 'Server port', '3100')
    .option('--latest', 'Show only latest circle outputs')
    .option('--all', 'Show all circle outputs')
    .option('--ttl <seconds>', 'Auto-shutdown after idle seconds', '0')
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

        const app = express();

        // API: List circle directories
        app.get('/api/circles', (_req, res) => {
          const circles = scanCircles(queueRoot, options);
          res.json(circles);
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

          // Enrich with output files
          const enriched = Object.entries(assetsMap).map(([id, info]: [string, any]) => {
            const outputs: string[] = [];
            const dirs = fs.readdirSync(circleDir).filter((d) => !d.startsWith('_'));

            for (const providerDir of dirs) {
              const providerPath = path.join(circleDir, providerDir);
              if (!fs.statSync(providerPath).isDirectory()) continue;

              const files = fs.readdirSync(providerPath);
              const matches = files.filter(
                (f) => f.startsWith(id) && !f.endsWith('.json')
              );
              for (const f of matches) {
                outputs.push(path.join(providerDir, f));
              }
            }

            return { id, status: info.status, layer: info.layer, outputs };
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

        // Approve endpoint
        app.post('/api/approve/:circle/:assetId', express.json(), async (req, res) => {
          const { circle, assetId } = req.params;
          const { outputFile, taskJsonPath } = req.body || {};

          try {
            const now = new Date().toISOString();

            // Determine approval status from output filename convention
            const parsed = outputFile ? parseOutputFilename(outputFile) : { isModified: false };
            const newStatus = parsed.isModified ? 'syncing' : 'approved';

            let reviewEntry = `${now} approved output: ${outputFile || assetId}`;
            if (parsed.isModified && taskJsonPath) {
              reviewEntry += ` | modified_task: ${taskJsonPath}`;
            }

            // Find source .md file and append review record
            const elementsDir = path.join(process.cwd(), 'videospec', 'elements');
            const scenesDir = path.join(process.cwd(), 'videospec', 'scenes');
            let sourceDocPath: string | null = null;

            for (const dir of [elementsDir, scenesDir]) {
              if (!fs.existsSync(dir)) continue;
              for (const prefix of ['@', '']) {
                const p = path.join(dir, `${prefix}${assetId}.md`);
                if (fs.existsSync(p)) {
                  sourceDocPath = p;
                  break;
                }
              }
              if (sourceDocPath) break;
            }

            if (sourceDocPath) {
              const content = fs.readFileSync(sourceDocPath, 'utf-8');
              const updated = FrontmatterParser.appendReview(content, reviewEntry);
              const finalContent = FrontmatterParser.updateField(updated, 'status', newStatus);
              fs.writeFileSync(sourceDocPath, finalContent);
            }

            // Update _manifest.json assets field
            const circleDir = path.join(queueRoot, circle);
            const manifestPath = path.join(circleDir, '_manifest.json');
            if (fs.existsSync(manifestPath)) {
              const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
              if (manifest.assets && manifest.assets[assetId]) {
                manifest.assets[assetId].status = newStatus;
              }
              // Also update circles[].status for backward compatibility
              for (const c of manifest.circles || []) {
                if (c.status && c.status[assetId]) {
                  c.status[assetId] = newStatus;
                }
              }
              fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            }

            const note = parsed.isModified
              ? 'Modified task — agent must align fields before setting approved'
              : 'Original task — directly approved';

            res.json({ success: true, status: newStatus, note });
          } catch (err: any) {
            res.status(500).json({ error: err.message });
          }
        });

        // Serve static review UI
        const publicDir = path.join(__dirname, '..', 'review-ui', 'public');
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

function scanCircles(queueRoot: string, options: any): any[] {
  const circles: any[] = [];

  if (!fs.existsSync(queueRoot)) return circles;

  const entries = fs.readdirSync(queueRoot).filter((d) => {
    const fullPath = path.join(queueRoot, d);
    return fs.statSync(fullPath).isDirectory() && d.includes('.circle');
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
