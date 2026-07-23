import { VolcengineCompiler } from '../providers/VolcengineCompiler';
import { RHapiCompiler } from '../providers/RHapiCompiler';
import { SiliconFlowCompiler } from '../providers/SiliconFlowCompiler';
import { MinimaxCompiler } from '../providers/MinimaxCompiler';
import { WebappCompiler } from '../providers/WebappCompiler';
import { CompileContext } from '../ProviderCompiler';
import { Job } from '../../../types/Job';

const job: Job = {
  id: 'prompt-fixture',
  type: 'imagen',
  prompt: 'A real prompt from the Asset Document',
  payload: { prompt: 'A payload fallback prompt', global_settings: {} as any },
};

function context(modelConfig: Record<string, unknown>): CompileContext {
  return {
    job,
    modelKey: 'test.model',
    modelConfig: modelConfig as any,
    apiKey: 'test-key',
    outputDir: '/tmp',
  };
}

describe('payload_example legacy prompt fallback', () => {
  it.each([
    ['Volcengine image', new VolcengineCompiler(), { provider: 'volcengine', type: 'imagen', api_url: 'https://example.test', model: 'test', payload_example: { prompt: '' } }],
    ['RHapi image', new RHapiCompiler(), { provider: 'rhapi', type: 'imagen', api_url: 'https://example.test', payload_example: { prompt: '' } }],
    ['RHapi video', new RHapiCompiler(), { provider: 'rhapi', type: 'video', api_url: 'https://example.test', payload_example: { prompt: '' } }],
    ['SiliconFlow image', new SiliconFlowCompiler(), { provider: 'siliconflow', type: 'imagen', api_url: 'https://example.test', model: 'test', payload_example: { prompt: '' } }],
    ['SiliconFlow video', new SiliconFlowCompiler(), { provider: 'siliconflow', type: 'video', api_url: 'https://example.test', api_status_url: 'https://example.test/status', model: 'test', payload_example: { prompt: '' } }],
    ['Minimax image', new MinimaxCompiler(), { provider: 'minimax', type: 'imagen', api_url: 'https://example.test', model: 'test', payload_example: { prompt: '' } }],
    ['Minimax video', new MinimaxCompiler(), { provider: 'minimax', type: 'video', api_url: 'https://example.test', api_status_url: 'https://example.test/status', model: 'test', payload_example: { prompt: '' } }],
    ['Webapp', new WebappCompiler(), { provider: 'webapp', type: 'webapp', api_url: 'https://example.test', api_status_url: 'https://example.test/status', payload_example: { prompt: '' } }],
  ])('%s restores prompt when payload_example has an empty placeholder', (_name, compiler, modelConfig) => {
    const task = compiler.compile(context(modelConfig));
    expect((task.payload as Record<string, unknown>).prompt).toBe(job.prompt);
  });

  it('restores Volcengine video text content when its payload_example has an empty placeholder', () => {
    const task = new VolcengineCompiler().compile(context({
      provider: 'volcengine',
      type: 'video',
      api_url: 'https://example.test',
      api_status_url: 'https://example.test/status',
      model: 'test',
      payload_example: { content: [{ type: 'text', text: '' }] },
    }));

    expect((task.payload as any).content[0].text).toBe(job.prompt);
  });

  it('lets an explicit inputs binding override the legacy default', () => {
    const task = new RHapiCompiler().compile(context({
      provider: 'rhapi',
      type: 'imagen',
      api_url: 'https://example.test',
      defaults: { configured_prompt: 'Prompt from explicit input binding' },
      payload_example: { prompt: '' },
      inputs: { prompt: { source: 'default.configured_prompt', target: 'prompt' } },
    }));

    expect((task.payload as Record<string, unknown>).prompt).toBe('Prompt from explicit input binding');
  });

  it('preserves a non-empty payload_example prompt without an inputs binding', () => {
    const task = new RHapiCompiler().compile(context({
      provider: 'rhapi',
      type: 'imagen',
      api_url: 'https://example.test',
      payload_example: { prompt: 'Intentional static prompt' },
    }));

    expect((task.payload as Record<string, unknown>).prompt).toBe('Intentional static prompt');
  });

  it('adds the prompt when payload_example omits the field', () => {
    const task = new RHapiCompiler().compile(context({
      provider: 'rhapi',
      type: 'imagen',
      api_url: 'https://example.test',
      payload_example: { model: 'example' },
    }));

    expect((task.payload as Record<string, unknown>).prompt).toBe(job.prompt);
  });
});
