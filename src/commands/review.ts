// ============================================================================
// OpsV v0.8 — opsv review
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import express from 'express';
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
        const queueRoot = path.join(projectRoot, 'opsv-queue', 'videospec');

        if (!fs.existsSync(queueRoot)) {
          console.error(chalk.red(`Queue directory not found: ${queueRoot}`));
          console.error(chalk.yellow('Run "opsv circle create" first.'));
          process.exit(1);
        }

        const port = parseInt(options.port, 10);
        const ttl = parseInt(options.ttl, 10);

        const app = express();

        // API: List circles with assets
        app.get('/api/circles', (_req, res) => {
          const circles = scanCircles(queueRoot, options);
          res.json(circles);
        });

        // API: Get assets for a circle
        app.get('/api/circles/:name/assets', (req, res) => {
          const circleDir = path.join(queueRoot, req.params.name);
          const assetsJsonPath = path.join(circleDir, '_assets.json');

          if (!fs.existsSync(assetsJsonPath)) {
            return res.json({ assets: [] });
          }

          const data = JSON.parse(fs.readFileSync(assetsJsonPath, 'utf-8'));

          // Enrich with output files
          const enriched = (data.assets || []).map((asset: any) => {
            const outputs: string[] = [];
            const dirs = fs.readdirSync(circleDir).filter((d) => !d.startsWith('_'));

            for (const providerDir of dirs) {
              const providerPath = path.join(circleDir, providerDir);
              if (!fs.statSync(providerPath).isDirectory()) continue;

              const files = fs.readdirSync(providerPath);
              const matches = files.filter(
                (f) => f.startsWith(asset.id) && !f.endsWith('.json')
              );
              for (const f of matches) {
                outputs.push(path.join(providerDir, f));
              }
            }

            return { ...asset, outputs };
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
          const { variant, imagePath } = req.body || {};

          try {
            // Update _assets.json status
            const assetsJsonPath = path.join(queueRoot, circle, '_assets.json');
            if (fs.existsSync(assetsJsonPath)) {
              const data = JSON.parse(fs.readFileSync(assetsJsonPath, 'utf-8'));
              const asset = (data.assets || []).find((a: any) => a.id === assetId);
              if (asset) {
                asset.status = 'approved';
                fs.writeFileSync(assetsJsonPath, JSON.stringify(data, null, 2));
              }
            }

            // Update _manifest.json
            const manifestPath = path.join(queueRoot, '_manifest.json');
            if (fs.existsSync(manifestPath)) {
              const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
              for (const c of manifest.circles || []) {
                if (c.circle === circle && c.status && c.status[assetId]) {
                  c.status[assetId] = 'approved';
                }
              }
              fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            }

            // Update frontmatter in source doc
            // TODO: Write approved status back to source .md file

            res.json({ success: true });
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
    return fs.statSync(fullPath).isDirectory() && !d.startsWith('_');
  });

  for (const name of entries) {
    const assetsJsonPath = path.join(queueRoot, name, '_assets.json');
    if (fs.existsSync(assetsJsonPath)) {
      const data = JSON.parse(fs.readFileSync(assetsJsonPath, 'utf-8'));
      circles.push({
        name,
        layer: data.layer,
        assetCount: (data.assets || []).length,
      });
    }
  }

  if (options.latest && circles.length > 0) {
    return [circles[circles.length - 1]];
  }

  return circles;
}
