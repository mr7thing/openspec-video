// ============================================================================
// OpsV Dependency Injection Container
// Registry for compilers and executor providers.
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

  registerCompiler(name: string, ctor: new () => ProviderCompiler): void {
    this.compilers.set(name, ctor);
  }

  registerExecutor(name: string, ctor: new () => ProviderExecutor): void {
    this.executors.set(name, ctor);
  }

  resolveCompiler(name: string): ProviderCompiler {
    const ctor = this.compilers.get(name);
    if (!ctor) {
      throw new InfrastructureError(
        OpsVErrorCode.INFRA_FILE_NOT_FOUND,
        `Compiler not registered: ${name}`
      );
    }
    return new ctor();
  }

  resolveExecutor(name: string): ProviderExecutor {
    const ctor = this.executors.get(name);
    if (!ctor) {
      throw new InfrastructureError(
        OpsVErrorCode.INFRA_FILE_NOT_FOUND,
        `Executor not registered: ${name}`
      );
    }
    return new ctor();
  }

  listCompilers(): string[] {
    return Array.from(this.compilers.keys());
  }

  listExecutors(): string[] {
    return Array.from(this.executors.keys());
  }
}
