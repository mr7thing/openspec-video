// ============================================================================
// OpsV v0.8 — opsv review
// Supports --circle mode: manifest-driven review with zero hardcoded paths
// Legacy mode (no --circle) preserves original behavior (deprecated)
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import http from 'http';
import chalk from 'chalk';
import express from 'express';
import { execSync } from 'child_process';
import { ManifestReader } from '../core/ManifestReader';
import { ManifestReviewStrategy, LegacyReviewStrategy } from '../core/ReviewStrategy';
import { ApproveService } from '../core/ApproveService';
import { ReviewOptionsSchema, ReviewOptions } from '../types/ManifestSchema';
import { logger } from '../utils/logger';
import { getProjectDir } from '../utils/configLoader';
import { resolveWithin } from '../utils/pathSecurity';

function autoCommitPendingChanges(projectRoot: string): void {
  try {
    execSync('git add -A', { cwd: projectRoot, stdio: 'ignore' });
    execSync('git diff --cached --quiet', { cwd: projectRoot, encoding: 'utf-8', stdio: 'pipe' });
  } catch {
    try {
      const timestamp = new Date().toISOString();
      execSync(`git commit -m "pre-review checkpoint: ${timestamp}"`, { cwd: projectRoot, stdio: 'ignore' });
      console.log(chalk.green(`Changes committed before review (${timestamp})`));
    } catch {
      // May fail if git not initialized or nothing to commit
    }
  }
}

function setupTtlShutdown(server: http.Server, ttl: number): void {
  if (ttl <= 0) return;
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
        const queueRoot = getProjectDir(projectRoot, 'queue');

        if (!fs.existsSync(queueRoot)) {
          console.error(chalk.red(`Queue directory not found: ${queueRoot}`));
          console.error(chalk.yellow('Run "opsv circle create" first.'));
          process.exit(1);
        }

        const parsed = ReviewOptionsSchema.safeParse(options);
        if (!parsed.success) {
          console.error(chalk.red('Invalid options'));
          process.exit(1);
        }
        const opts: ReviewOptions = parsed.data;

        const manifestReader = new ManifestReader();
        const circleMode = opts.circle !== undefined;
        const manifestInfo = circleMode
          ? manifestReader.resolveForReview(projectRoot, opts.circle === true ? undefined : opts.circle as string)
          : null;

        if (circleMode && !manifestInfo) {
          console.error(chalk.red('No manifest found. Run "opsv circle create" first.'));
          process.exit(1);
        }

        if (circleMode && manifestInfo) {
          const assetCount = Object.keys(manifestInfo.manifest.assets || {}).length;
          console.log(chalk.cyan(`Manifest-driven mode: ${manifestInfo.circleName} (${assetCount} assets, target: ${manifestInfo.manifest.target || 'videospec'})`));
        }

        autoCommitPendingChanges(projectRoot);

        const strategy = circleMode && manifestInfo
          ? new ManifestReviewStrategy(manifestInfo, manifestReader, projectRoot)
          : new LegacyReviewStrategy(projectRoot, queueRoot, opts, manifestReader);

        const app = express();

        // API: List documents
        app.get('/api/documents', (_req, res) => {
          res.json(strategy.listDocuments());
        });

        // API: Get document content
        app.get('/api/documents/:circle/:docId', (req, res) => {
          const doc = strategy.findDocument(req.params.circle, req.params.docId);
          if (!doc) return res.status(404).json({ error: 'Document not found' });
          res.json(doc);
        });

        // API: List circles
        app.get('/api/circles', (_req, res) => {
          res.json(strategy.listCircles());
        });

        // API: Get assets for a circle directory
        app.get('/api/circles/:name/assets', (req, res) => {
          res.json(strategy.listCircleAssets(req.params.name));
        });

        // Serve output files
        app.get('/api/files/:circle/:provider/:file', (req, res) => {
          const filePath = resolveWithin(queueRoot, req.params.circle, req.params.provider, req.params.file);
          if (!filePath) {
            res.status(403).send('Forbidden');
            return;
          }
          if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
          } else {
            res.status(404).send('File not found');
          }
        });

        // Approve endpoint
        app.post('/api/approve/:circle/:assetId', express.json(), async (req, res) => {
          try {
            const approveService = new ApproveService(projectRoot, queueRoot, manifestReader);
            const result = approveService.execute({
              circle: req.params.circle,
              assetId: req.params.assetId,
              outputFile: req.body?.outputFile,
              taskJsonPath: req.body?.taskJsonPath,
            });
            res.json(result);
          } catch (err: any) {
            const status = err.message === 'Invalid circle or assetId' ? 400
              : err.message === 'Forbidden' ? 403 : 500;
            res.status(status).json({ error: err.message });
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

        const server = app.listen(opts.port, () => {
          console.log(chalk.green(`Review server running at http://localhost:${opts.port}`));
        });

        setupTtlShutdown(server, opts.ttl);
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}
