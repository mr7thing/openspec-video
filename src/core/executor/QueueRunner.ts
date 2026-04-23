import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../../utils/logger';
import { extractVideoFrames } from '../../utils/frameExtractor';

/**
 * QueueRunner: 一次性顺序执行器。
 *
 * 设计原则：
 * 1. 扫描 batchDir 下所有 .json 任务文件
 * 2. 跳过已有成功结果的任务（除非 --retry）
 * 3. 跳过已有 _error.log 的任务（除非 --retry）
 * 4. 顺序执行，完成即退出
 * 5. 生成 JSONL 格式的执行日志
 */

export interface RunOptions {
  files?: string[];
  retry?: boolean;
}

export interface RunResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export type TaskHandler = (task: { jsonPath: string; outputPath: string; logPath: string }) => Promise<void>;

export class QueueRunner {
  /**
   * 执行 batchDir 下的任务。
   */
  async run(batchDir: string, handler: TaskHandler, options: RunOptions = {}): Promise<RunResult> {
    const tasks = await this.discoverTasks(batchDir, options.files);
    const pendingTasks = await this.filterPending(batchDir, tasks, options.retry);

    logger.info(`[QueueRunner] Found ${tasks.length} tasks, ${pendingTasks.length} pending.`);

    let succeeded = 0;
    let failed = 0;
    let skipped = tasks.length - pendingTasks.length;

    for (let i = 0; i < pendingTasks.length; i++) {
      const jsonPath = pendingTasks[i];
      const baseName = path.basename(jsonPath, '.json');
      const outputPath = await this.resolveOutputPath(batchDir, baseName, jsonPath);
      const logPath = `${jsonPath}.log`;
      const errorLogPath = `${jsonPath}_error.log`;

      logger.info(`[QueueRunner] [${i + 1}/${pendingTasks.length}] ${baseName}`);

      // 清除旧的 error.log
      await fs.unlink(errorLogPath).catch(() => {});

      try {
        await handler({ jsonPath, outputPath, logPath });
        succeeded++;
        logger.info(`[QueueRunner] [${i + 1}/${pendingTasks.length}] ${baseName} → ${path.basename(outputPath)} OK`);

        // 视频任务：自动生成首帧/尾帧
        const taskContent = await fs.readFile(jsonPath, 'utf-8');
        const taskMeta = JSON.parse(taskContent)._opsv;
        if (taskMeta?.type === 'video_generation') {
          // batch 本地副本（便于查看，与视频同目录）
          const localFramesDir = path.join(batchDir, 'frames');
          await extractVideoFrames(outputPath, localFramesDir, baseName);
          // 全局帧目录（供 RefResolver/@FRAME 引用查找）
          const projectRoot = batchDir.includes('/opsv-queue/')
            ? batchDir.split('/opsv-queue/')[0]
            : path.resolve(batchDir, '../../../..');
          const globalFramesDir = path.join(projectRoot, 'opsv-queue', 'frames');
          await extractVideoFrames(outputPath, globalFramesDir, baseName);
        }
      } catch (err: any) {
        failed++;
        const errorRecord = {
          t: new Date().toISOString(),
          type: 'error',
          task: baseName,
          message: err.message,
          code: err.code || err.response?.status
        };
        await fs.writeFile(errorLogPath, JSON.stringify(errorRecord) + '\n', 'utf-8');
        logger.error(`[QueueRunner] [${i + 1}/${pendingTasks.length}] ${baseName} failed: ${err.message}`);
      }
    }

    const result: RunResult = {
      total: tasks.length,
      succeeded,
      failed,
      skipped
    };

    this.printSummary(result);
    return result;
  }

  /**
   * 发现任务文件。
   */
  private async discoverTasks(batchDir: string, files?: string[]): Promise<string[]> {
    if (files && files.length > 0) {
      return files.map(f => {
        const full = path.resolve(batchDir, f);
        return full;
      });
    }

    const entries = await fs.readdir(batchDir).catch(() => [] as string[]);
    return entries
      .filter(e => e.endsWith('.json') && !e.endsWith('_error.log') && e !== 'queue.json')
      .map(e => path.join(batchDir, e))
      .sort();
  }

  /**
   * 过滤 pending 任务。
   * 跳过已有成功结果的任务，跳过已有 _error.log 的任务（除非 retry）。
   */
  private async filterPending(batchDir: string, tasks: string[], retry?: boolean): Promise<string[]> {
    const pending: string[] = [];
    for (const jsonPath of tasks) {
      const baseName = path.basename(jsonPath, '.json');
      const hasResult = await this.hasRunResult(batchDir, baseName);
      const errorLogPath = `${jsonPath}_error.log`;
      const hasError = await fs.access(errorLogPath).then(() => true).catch(() => false);

      if (hasResult) {
        // 已有成功结果，不再执行（除非明确覆盖，但 retry 不覆盖成功结果）
        continue;
      }

      if (hasError && !retry) {
        // 上次失败，本次不重试
        continue;
      }

      pending.push(jsonPath);
    }
    return pending;
  }

  /**
   * 检查该任务是否已有成功执行结果。
   */
  private async hasRunResult(batchDir: string, baseName: string): Promise<boolean> {
    const entries = await fs.readdir(batchDir).catch(() => [] as string[]);
    return entries.some(e => {
      // 匹配 shot_01_1.png, shot_01_2.png 等（baseName 后加 _数字.扩展名）
      const pattern = new RegExp(`^${baseName}_(\\d+)\\.(png|mp4|jpg|jpeg|webp|gif)$`);
      return pattern.test(e);
    });
  }

  /**
   * 解析下一个输出路径（本地递增）。
   */
  private async resolveOutputPath(batchDir: string, baseName: string, jsonPath: string): Promise<string> {
    // 读取 .json 判断类型
    const content = await fs.readFile(jsonPath, 'utf-8');
    const task = JSON.parse(content);
    const type = task._opsv?.type || 'image_generation';
    const ext = type === 'video_generation' ? 'mp4' : 'png';

    const entries = await fs.readdir(batchDir).catch(() => [] as string[]);
    const seqs = entries
      .map(e => e.match(new RegExp(`^${baseName}_(\\d+)\\.${ext}$`)))
      .filter(Boolean)
      .map(m => parseInt(m![1]));

    const nextSeq = seqs.length > 0 ? Math.max(...seqs) + 1 : 1;
    return path.join(batchDir, `${baseName}_${nextSeq}.${ext}`);
  }

  private printSummary(result: RunResult) {
    const { total, succeeded, failed, skipped } = result;
    logger.info(`[QueueRunner] Summary: total=${total}, succeeded=${succeeded}, failed=${failed}, skipped=${skipped}`);
    if (failed > 0) {
      logger.info(`[QueueRunner] Use --retry to re-run failed tasks.`);
    }
  }
}
