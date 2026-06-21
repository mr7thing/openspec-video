// ============================================================================
// OpsV Dependency Injection Container
// Registry for compilers and executor providers with singleton caching.
// ============================================================================

import { ProviderCompiler } from '../core/compiler/ProviderCompiler';
import { ProviderResult } from '../executor/QueueRunner';
import { BaseTaskJson } from '../types/Job';
import { OpsVContext } from './OpsVContext';
import { InfrastructureError, OpsVErrorCode } from '../errors/OpsVError';

export interface ProviderExecutor {
  readonly name: string;
  execute(task: BaseTaskJson<unknown>, taskPath: string, ctx: OpsVContext): Promise<ProviderResult>;
}

export class Container {
  private compilers = new Map<string, new () => ProviderCompiler>();
  private executors = new Map<string, new () => ProviderExecutor>();
  private compilerCache = new Map<string, ProviderCompiler>();
  private executorCache = new Map<string, ProviderExecutor>();

  registerCompiler(name: string, ctor: new () => ProviderCompiler): void {
    this.compilers.set(name, ctor);
    this.compilerCache.delete(name);
  }

  registerExecutor(name: string, ctor: new () => ProviderExecutor): void {
    this.executors.set(name, ctor);
    this.executorCache.delete(name);
  }

  resolveCompiler(name: string): ProviderCompiler {
    const cached = this.compilerCache.get(name);
    if (cached) return cached;

    const ctor = this.compilers.get(name);
    if (!ctor) {
      throw new InfrastructureError(
        OpsVErrorCode.EXECUTION_PROVIDER_NOT_FOUND,
        `Compiler not registered: ${name}`
      );
    }
    const instance = new ctor();
    this.compilerCache.set(name, instance);
    return instance;
  }

  resolveExecutor(name: string): ProviderExecutor {
    const cached = this.executorCache.get(name);
    if (cached) return cached;

    const ctor = this.executors.get(name);
    if (!ctor) {
      throw new InfrastructureError(
        OpsVErrorCode.EXECUTION_PROVIDER_NOT_FOUND,
        `Executor not registered: ${name}`
      );
    }
    const instance = new ctor();
    this.executorCache.set(name, instance);
    return instance;
  }

  listCompilers(): string[] {
    return Array.from(this.compilers.keys());
  }

  listExecutors(): string[] {
    return Array.from(this.executors.keys());
  }
}
