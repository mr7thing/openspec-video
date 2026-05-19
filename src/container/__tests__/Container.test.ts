import { Container } from '../Container';
import { ProviderCompiler, CompileContext } from '../../core/compiler/ProviderCompiler';
import { ProviderExecutor } from '../Container';
import { BaseTaskJson } from '../../types/Job';
import { ProviderResult } from '../../executor/QueueRunner';
import { OpsVContext } from '../OpsVContext';

class MockCompiler implements ProviderCompiler {
  readonly provider = 'mock';
  compile(_ctx: CompileContext) {
    return { payload: {}, _opsv: { provider: 'mock', modelKey: 'mock.v1', type: 'imagen' as const, shotId: 'test', api_url: 'http://test', compiledAt: '2024-01-01T00:00:00Z' } };
  }
}

class MockExecutor implements ProviderExecutor {
  readonly name = 'mock';
  async execute(_task: BaseTaskJson<unknown>, _taskPath: string, _ctx: OpsVContext): Promise<ProviderResult> {
    return { taskPath: '/tmp/test.json', shotId: 'test', provider: 'mock', success: true };
  }
}

describe('Container', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  it('registers and resolves a compiler', () => {
    container.registerCompiler('mock', MockCompiler);
    const compiler = container.resolveCompiler('mock');
    expect(compiler).toBeInstanceOf(MockCompiler);
    expect(compiler.provider).toBe('mock');
  });

  it('registers and resolves an executor', () => {
    container.registerExecutor('mock', MockExecutor);
    const executor = container.resolveExecutor('mock');
    expect(executor).toBeInstanceOf(MockExecutor);
    expect(executor.name).toBe('mock');
  });

  it('throws when resolving unregistered compiler', () => {
    expect(() => container.resolveCompiler('unknown')).toThrow('Compiler not registered: unknown');
  });

  it('throws when resolving unregistered executor', () => {
    expect(() => container.resolveExecutor('unknown')).toThrow('Executor not registered: unknown');
  });

  it('lists registered compilers', () => {
    container.registerCompiler('a', MockCompiler);
    container.registerCompiler('b', MockCompiler);
    expect(container.listCompilers()).toEqual(['a', 'b']);
  });

  it('lists registered executors', () => {
    container.registerExecutor('x', MockExecutor);
    container.registerExecutor('y', MockExecutor);
    expect(container.listExecutors()).toEqual(['x', 'y']);
  });

  it('returns cached singleton on repeated resolve', () => {
    container.registerCompiler('mock', MockCompiler);
    const a = container.resolveCompiler('mock');
    const b = container.resolveCompiler('mock');
    expect(a).toBe(b); // same instance (singleton)
    expect(a).toBeInstanceOf(MockCompiler);
  });

  it('invalidates cache on re-registration', () => {
    container.registerCompiler('mock', MockCompiler);
    const a = container.resolveCompiler('mock');
    container.registerCompiler('mock', MockCompiler);
    const b = container.resolveCompiler('mock');
    expect(a).not.toBe(b); // new instance after re-registration
  });
});
