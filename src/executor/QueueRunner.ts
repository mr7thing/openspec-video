// ============================================================================
// OpsV v0.8 Queue Runner
// Sequential per-provider, parallel across providers
// ============================================================================

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { TaskJson } from '../types/Job';
import { logger } from '../utils/logger';
import { VolcengineProvider } from './providers/VolcengineProvider';
import { SiliconFlowProvider } from './providers/SiliconFlowProvider';
import { MinimaxProvider } from './providers/MinimaxProvider';
import { RunningHubProvider } from './providers/RunningHubProvider';
import { ComfyUILocalProvider } from './providers/ComfyUILocalProvider';
import { WebappProvider } from './providers/WebappProvider';
import { isTaskCompleted, getResumeTaskId } from './polling';

export interface ProviderResult {
  taskPath: string;
  shotId: string;
  provider: string;
  success: boolean;
  outputPath?: string;
  outputPaths?: string[];
  error?: string;
}

interface ProviderHandler {
  name: string;
  execute(task: TaskJson, taskPath: string): Promise<ProviderResult>;
}

export class QueueRunner {
  private providers: Map<string, ProviderHandler> = new Map();

  constructor() {
    this.providers.set('volcengine', new VolcengineProvider());
    this.providers.set('siliconflow', new SiliconFlowProvider());
    this.providers.set('minimax', new MinimaxProvider());
    this.providers.set('runninghub', new RunningHubProvider());
    this.providers.set('comfyui', new ComfyUILocalProvider());
    this.providers.set('webapp', new WebappProvider());
  }

  async runPaths(paths: string[], options: { retry?: boolean; dryRun?: boolean } = {}): Promise<ProviderResult[]> {
    const tasks = this.collectTasks(paths, options.retry);

    if (tasks.length === 0) {
      if (options.retry) {
        console.log(chalk.yellow('No failed tasks found to retry.'));
      } else {
        console.log(chalk.yellow('No task .json files found at specified paths.'));
      }
      return [];
    }

    if (options.dryRun) {
      console.log(chalk.cyan(`\n[dry-run] Would execute ${tasks.length} tasks:`));
      for (const { task, path: taskPath } of tasks) {
        console.log(`  ${task._opsv.provider}/${task._opsv.shotId} ← ${taskPath}`);
      }
      return [];
    }

    // Group by provider for parallel-across, serial-within execution
    const byProvider = new Map<string, Array<{ task: TaskJson; path: string }>>();
    for (const entry of tasks) {
      const provider = entry.task._opsv.provider;
      if (!byProvider.has(provider)) byProvider.set(provider, []);
      byProvider.get(provider)!.push(entry);
    }

    console.log(chalk.cyan(`\nExecuting ${tasks.length} tasks across ${byProvider.size} providers...`));

    const results: ProviderResult[] = [];

    // Run providers in parallel
    const providerPromises = Array.from(byProvider.entries()).map(
      async ([provider, entries]) => {
        // Tasks within same provider run serially
        for (const { task, path: taskPath } of entries) {
          const handler = this.providers.get(provider);
          if (!handler) {
            results.push({
              taskPath,
              shotId: task._opsv.shotId,
              provider,
              success: false,
              error: `Unknown provider: ${provider}`,
            });
            continue;
          }

          try {
            console.log(chalk.cyan(`  [${provider}] Running ${task._opsv.shotId}...`));
            const result = await handler.execute(task, taskPath);
            results.push(result);

            if (result.success) {
              console.log(chalk.green(`  [${provider}] ${task._opsv.shotId} ✓`));
              // Remove error log on success
              const errorLog = taskPath.replace(/\.json$/, '_error.log');
              if (fs.existsSync(errorLog)) {
                fs.unlinkSync(errorLog);
              }
            } else {
              console.log(chalk.red(`  [${provider}] ${task._opsv.shotId} ✗: ${result.error}`));
              // Write error log for retry support
              const errorLog = taskPath.replace(/\.json$/, '_error.log');
              fs.writeFileSync(errorLog, JSON.stringify({ error: result.error, timestamp: new Date().toISOString() }));
            }
          } catch (err: any) {
            results.push({
              taskPath,
              shotId: task._opsv.shotId,
              provider,
              success: false,
              error: err.message,
            });
            console.log(chalk.red(`  [${provider}] ${task._opsv.shotId} ✗: ${err.message}`));
            // Write error log for retry support
            const errorLog = taskPath.replace(/\.json$/, '_error.log');
            fs.writeFileSync(errorLog, JSON.stringify({ error: err.message, timestamp: new Date().toISOString() }));
          }
        }
      }
    );

    await Promise.all(providerPromises);

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    console.log(chalk.cyan(`\nDone: ${succeeded} succeeded, ${failed} failed`));

    return results;
  }

  private collectTasks(paths: string[], retry?: boolean): Array<{ task: TaskJson; path: string }> {
    const results: Array<{ task: TaskJson; path: string }> = [];

    for (const p of paths) {
      const resolved = path.resolve(p);

      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile() && resolved.endsWith('.json')) {
        try {
          const task = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
          if (task._opsv) {
            results.push({ task, path: resolved });
          }
        } catch (err) {
          logger.warn(`Failed to parse task JSON: ${resolved}`);
        }
      } else if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        this.collectFromDir(resolved, results, retry);
      }
    }

    return results;
  }

  private collectFromDir(dir: string, results: Array<{ task: TaskJson; path: string }>, retry?: boolean): void {
    const entries = fs.readdirSync(dir);
    const outputFiles = new Set(
      entries.filter((e) => !e.endsWith('.json') && !e.endsWith('.log') && !e.startsWith('_'))
    );

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        this.collectFromDir(fullPath, results, retry);
      } else if (entry.endsWith('.json') && !entry.startsWith('_')) {
        try {
          const task = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
          if (task._opsv) {
            // When retry=true, include tasks with _error.log even if output exists
            if (retry) {
              const base = entry.replace(/\.json$/, '');
              const errorLog = path.join(dir, `${base}_error.log`);
              if (fs.existsSync(errorLog)) {
                results.push({ task, path: fullPath });
              }
              continue;
            }

            // Skip if output already exists (non-retry mode)
            const base = entry.replace(/\.json$/, '');
            const hasOutput = Array.from(outputFiles).some((f) => f.startsWith(base + '_'));
            if (hasOutput && !getResumeTaskId(fullPath)) {
              continue;
            }
            results.push({ task, path: fullPath });
          }
        } catch {
          // Skip non-task JSON files
        }
      }
    }
  }
}
