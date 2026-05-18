// ============================================================================
// OpsV Queue Runner
// Sequential per-provider, parallel across providers
// ============================================================================

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { BaseTaskJson } from '../types/Job';
import { logger } from '../utils/logger';
import { isTaskCompleted, getResumeTaskId } from './polling';
import { Container, ProviderExecutor } from '../container/Container';
import { OpsVContext } from '../container/OpsVContext';

export interface ProviderResult {
  taskPath: string;
  shotId: string;
  provider: string;
  success: boolean;
  outputPath?: string;
  outputPaths?: string[];
  error?: string;
}

export class QueueRunner {
  private container: Container;
  private ctx: OpsVContext;

  constructor(container: Container, ctx: OpsVContext) {
    this.container = container;
    this.ctx = ctx;
  }

  async runPaths(
    paths: string[],
    options: { retry?: boolean; dryRun?: boolean; concurrency?: number } = {}
  ): Promise<ProviderResult[]> {
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
    const byProvider = new Map<string, Array<{ task: BaseTaskJson<unknown>; path: string }>>();
    for (const entry of tasks) {
      const provider = entry.task._opsv.provider;
      if (!byProvider.has(provider)) byProvider.set(provider, []);
      byProvider.get(provider)!.push(entry);
    }

    console.log(chalk.cyan(`\nExecuting ${tasks.length} tasks across ${byProvider.size} providers...`));

    const results: ProviderResult[] = [];

    const providerPromises = Array.from(byProvider.entries()).map(async ([providerName, entries]) => {
      let handler: ProviderExecutor;
      try {
        handler = this.container.resolveExecutor(providerName);
      } catch (err: any) {
        for (const { task, path: taskPath } of entries) {
          results.push({
            taskPath,
            shotId: task._opsv.shotId,
            provider: providerName,
            success: false,
            error: err.message,
          });
        }
        return;
      }

      // Determine concurrency: CLI flag > model config > default 1
      let concurrency = options.concurrency ?? 1;
      if (!options.concurrency && entries.length > 0) {
        const firstTask = entries[0].task;
        const modelConfig = this.ctx.configLoader.getModelConfig(firstTask._opsv.modelKey);
        if (modelConfig?.concurrency && modelConfig.concurrency > 1) {
          concurrency = modelConfig.concurrency;
        }
      }

      if (concurrency > 1) {
        console.log(chalk.cyan(`\n[${providerName}] Running ${entries.length} tasks with concurrency ${concurrency}...`));
        await this.runWithConcurrency(entries, concurrency, handler, results);
      } else {
        console.log(chalk.cyan(`\n[${providerName}] Running ${entries.length} tasks sequentially...`));
        for (const { task, path: taskPath } of entries) {
          await this.runTask(task, taskPath, handler, results);
        }
      }
    });

    await Promise.all(providerPromises);

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    console.log(chalk.cyan(`\nDone: ${succeeded} succeeded, ${failed} failed`));

    return results;
  }

  private async runTask(
    task: BaseTaskJson<unknown>,
    taskPath: string,
    handler: ProviderExecutor,
    results: ProviderResult[]
  ): Promise<void> {
    try {
      console.log(chalk.cyan(`  [${handler.name}] Running ${task._opsv.shotId}...`));
      const result = await handler.execute(task, taskPath, this.ctx);
      results.push(result);

      if (result.success) {
        console.log(chalk.green(`  [${handler.name}] ${task._opsv.shotId} ✓`));
        const errorLog = taskPath.replace(/\.json$/, '_error.log');
        if (fs.existsSync(errorLog)) {
          fs.unlinkSync(errorLog);
        }
      } else {
        console.log(chalk.red(`  [${handler.name}] ${task._opsv.shotId} ✗: ${result.error}`));
        const errorLog = taskPath.replace(/\.json$/, '_error.log');
        fs.writeFileSync(errorLog, JSON.stringify({ error: result.error, timestamp: new Date().toISOString() }));
      }
    } catch (err: any) {
      const result: ProviderResult = {
        taskPath,
        shotId: task._opsv.shotId,
        provider: handler.name,
        success: false,
        error: err.message,
      };
      results.push(result);
      console.log(chalk.red(`  [${handler.name}] ${task._opsv.shotId} ✗: ${err.message}`));
      const errorLog = taskPath.replace(/\.json$/, '_error.log');
      fs.writeFileSync(errorLog, JSON.stringify({ error: err.message, timestamp: new Date().toISOString() }));
    }
  }

  private async runWithConcurrency(
    entries: Array<{ task: BaseTaskJson<unknown>; path: string }>,
    concurrency: number,
    handler: ProviderExecutor,
    results: ProviderResult[]
  ): Promise<void> {
    const executing = new Set<Promise<void>>();

    for (const { task, path: taskPath } of entries) {
      const promise = this.runTask(task, taskPath, handler, results).finally(() => {
        executing.delete(promise);
      });
      executing.add(promise);

      if (executing.size >= concurrency) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
  }

  private collectTasks(
    paths: string[],
    retry?: boolean
  ): Array<{ task: BaseTaskJson<unknown>; path: string }> {
    const results: Array<{ task: BaseTaskJson<unknown>; path: string }> = [];

    for (const p of paths) {
      const resolved = path.resolve(p);

      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile() && resolved.endsWith('.json')) {
        try {
          const task = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
          if (task._opsv) {
            if (retry) {
              const errorLog = resolved.replace(/\.json$/, '_error.log');
              if (fs.existsSync(errorLog)) {
                results.push({ task, path: resolved });
              }
              continue;
            }
            if (!this.shouldSkipTask(resolved, task, path.dirname(resolved))) {
              results.push({ task, path: resolved });
            }
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

  private collectFromDir(
    dir: string,
    results: Array<{ task: BaseTaskJson<unknown>; path: string }>,
    retry?: boolean
  ): void {
    const entries = fs.readdirSync(dir);
    const outputFiles = new Set(entries.filter((e) => !e.endsWith('.json') && !e.endsWith('.log') && !e.startsWith('_')));

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        this.collectFromDir(fullPath, results, retry);
      } else if (entry.endsWith('.json') && !entry.startsWith('_')) {
        try {
          const task = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
          if (task._opsv) {
            if (retry) {
              const base = entry.replace(/\.json$/, '');
              const errorLog = path.join(dir, `${base}_error.log`);
              if (fs.existsSync(errorLog)) {
                results.push({ task, path: fullPath });
              }
              continue;
            }

            const base = entry.replace(/\.json$/, '');
            const hasOutput = Array.from(outputFiles).some((f) => f.startsWith(base + '_'));
            if (hasOutput && !getResumeTaskId(fullPath) && this.shouldSkipTask(fullPath, task, dir)) {
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

  private shouldSkipTask(taskPath: string, task: BaseTaskJson<unknown>, startDir: string): boolean {
    const manifestAssets = this.findManifestAssets(startDir);
    if (!manifestAssets) return false;
    const shotId = task._opsv?.shotId;
    if (!shotId) return false;
    return manifestAssets[shotId]?.status === 'approved';
  }

  private findManifestAssets(startDir: string): Record<string, { status: string }> | null {
    let current = startDir;
    while (current !== path.dirname(current)) {
      const manifestPath = path.join(current, '_manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          return manifest.assets || null;
        } catch {
          return null;
        }
      }
      current = path.dirname(current);
    }
    return null;
  }
}
