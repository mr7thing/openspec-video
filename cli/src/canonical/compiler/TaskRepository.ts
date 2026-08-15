import fs from 'node:fs/promises';
import path from 'node:path';
import type { BaseTaskJson } from '../../types/Job';
import {
  assertProductionTask,
  type ProductionTask,
} from './ProductionTaskCompiler';

export interface StoredProductionTask {
  kind: 'canonical';
  task: ProductionTask;
  path: string;
  relativePath: string;
}

/** A queue JSON may run only through an explicit compatibility policy. */
export interface LegacyTaskView {
  kind: 'legacy';
  verified: false;
  taskPath: string;
  task: BaseTaskJson<unknown>;
  reason: 'LEGACY_TASK_NO_VERIFIED_ENVELOPE';
}

/**
 * File-backed immutable Task store. Queue JSON remains an execution view; this
 * repository is the authoritative ProductionTask identity.
 */
export class TaskRepository {
  constructor(private readonly projectRoot: string) {}

  static relativePathFor(task: Pick<ProductionTask, 'id' | 'revision'>): string {
    return path.posix.join('.opsv', 'tasks', encodeURIComponent(task.id), `${task.revision}.json`);
  }

  private absolutePath(task: Pick<ProductionTask, 'id' | 'revision'>): string {
    return path.join(this.projectRoot, ...TaskRepository.relativePathFor(task).split('/'));
  }

  async put(task: ProductionTask): Promise<StoredProductionTask> {
    assertProductionTask(task);
    const target = this.absolutePath(task);
    const relativePath = TaskRepository.relativePathFor(task);
    const content = `${JSON.stringify(task, null, 2)}\n`;
    await fs.mkdir(path.dirname(target), { recursive: true });

    const temp = `${target}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
    await fs.writeFile(temp, content, 'utf8');
    const handle = await fs.open(temp, 'r');
    try { await handle.sync(); } finally { await handle.close(); }

    try {
      // link() is create-if-absent: unlike rename(), it can never overwrite a
      // concurrent writer's immutable revision file.
      await fs.link(temp, target);
    } catch (error: any) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = await this.get(task.id, task.revision);
      if (existing.task.digest !== task.digest || JSON.stringify(existing.task) !== JSON.stringify(task)) {
        throw new Error(`TASK_REPOSITORY_CONFLICT: ${relativePath} already exists with different immutable content`);
      }
      return existing;
    } finally {
      await fs.rm(temp, { force: true });
    }

    return { kind: 'canonical', task, path: target, relativePath };
  }

  async get(id: string, revision: string): Promise<StoredProductionTask> {
    const relativePath = TaskRepository.relativePathFor({ id, revision });
    const taskPath = path.join(this.projectRoot, ...relativePath.split('/'));
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(taskPath, 'utf8'));
    } catch (error: any) {
      if (error?.code === 'ENOENT') throw new Error(`TASK_NOT_FOUND: ${relativePath}`);
      throw error;
    }
    assertProductionTask(parsed);
    const task = parsed as ProductionTask;
    if (task.id !== id || task.revision !== revision) {
      throw new Error(`TASK_REPOSITORY_CONFLICT: ${relativePath} does not contain its requested identity`);
    }
    return { kind: 'canonical', task, path: taskPath, relativePath };
  }

  async readLegacyQueueTask(taskPath: string): Promise<LegacyTaskView> {
    const parsed = JSON.parse(await fs.readFile(taskPath, 'utf8')) as BaseTaskJson<unknown>;
    if (!parsed || typeof parsed !== 'object' || !parsed._opsv || !('payload' in parsed)) {
      throw new TypeError(`LEGACY_TASK_INVALID: ${taskPath} is not a BaseTaskJson queue view`);
    }
    return {
      kind: 'legacy',
      verified: false,
      taskPath,
      task: parsed,
      reason: 'LEGACY_TASK_NO_VERIFIED_ENVELOPE',
    };
  }
}
