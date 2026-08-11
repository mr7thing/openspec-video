import { RhCliCompiler } from '../RhCliCompiler';
import { CompileContext } from '../../ProviderCompiler';
import { ModelConfig } from '../../../../utils/configLoader';
import { Job } from '../../../../types/Job';

function makeCtx(overrides: {
  modelConfig?: Partial<ModelConfig>;
  job?: Partial<Job>;
  referenceImages?: string[];
}): CompileContext {
  const modelConfig: ModelConfig = {
    provider: 'rhcli',
    type: 'imagen',
    rh: { mode: 'model', endpoint_id: 'ns/t2i' },
    ...overrides.modelConfig,
  } as ModelConfig;
  const job: Job = {
    id: 'shot01',
    type: 'imagen',
    prompt: 'a cat',
    payload: {},
    ...overrides.job,
  } as Job;
  return {
    job,
    modelKey: 'rhcli.t2i',
    modelConfig,
    apiKey: 'k',
    outputDir: '/out',
    referenceImages: overrides.referenceImages,
  };
}

describe('RhCliCompiler', () => {
  const compiler = new RhCliCompiler();

  it('builds payload from payload_example and injects the prompt', () => {
    const task = compiler.compile(makeCtx({
      modelConfig: {
        payload_example: { prompt: '', resolution: '2k' },
      },
    }));
    expect(task.payload).toEqual({ prompt: 'a cat', resolution: '2k' });
    expect(task._opsv.provider).toBe('rhcli');
    expect(task._opsv.api_url).toBe('rhcli://model/ns/t2i');
    expect(task._opsv.shotId).toBe('shot01');
  });

  it('targets `text` when the template has no prompt key (TTS-style)', () => {
    const task = compiler.compile(makeCtx({
      modelConfig: { payload_example: { text: '', voice_id: 'V' } },
    }));
    expect(task.payload.text).toBe('a cat');
    expect(task.payload).not.toHaveProperty('prompt');
  });

  it('merge order: rh.params < defaults < injected prompt', () => {
    const task = compiler.compile(makeCtx({
      modelConfig: {
        rh: { mode: 'model', endpoint_id: 'ns/x', params: { resolution: '1k', extra: 'low' } },
        defaults: { resolution: '4k' },
        payload_example: { prompt: '' },
      },
    }));
    expect(task.payload.resolution).toBe('4k'); // defaults beat rh.params
    expect(task.payload.extra).toBe('low');
    expect(task.payload.prompt).toBe('a cat');
  });

  it('injects global aspect_ratio when nothing pins one', () => {
    const task = compiler.compile(makeCtx({
      job: { payload: { global_settings: { aspect_ratio: '9:16' } } as any },
      modelConfig: { payload_example: { prompt: '' } },
    }));
    expect(task.payload.aspectRatio).toBe('9:16');
  });

  it('does not inject aspect_ratio when defaults pin one', () => {
    const task = compiler.compile(makeCtx({
      job: { payload: { global_settings: { aspect_ratio: '9:16' } } as any },
      modelConfig: { payload_example: { prompt: '' }, defaults: { aspectRatio: '16:9' } },
    }));
    expect(task.payload.aspectRatio).toBe('16:9');
  });

  it('routes prompt through inputs binding and skips auto-injection', () => {
    const task = compiler.compile(makeCtx({
      modelConfig: {
        payload_example: { text: '', voice_id: 'Wise_Woman' },
        inputs: { prompt: { source: 'prompt', target: 'text' } },
      },
    }));
    expect(task.payload.text).toBe('a cat');
  });

  it('falls back to imageUrls injection when no inputs configured', () => {
    const task = compiler.compile(makeCtx({
      modelConfig: { payload_example: { prompt: '' } },
      referenceImages: ['/a.png', '/b.png'],
    }));
    expect(task.payload.imageUrls).toEqual(['/a.png', '/b.png']);
  });

  it('passes duration through from the job payload', () => {
    const task = compiler.compile(makeCtx({
      job: { payload: { duration: 10 } as any },
      modelConfig: { payload_example: { prompt: '' } },
    }));
    expect(task.payload.duration).toBe(10);
  });

  it('app mode requires rh.app_id and produces a comfy descriptor', () => {
    expect(() => compiler.compile(makeCtx({
      modelConfig: { rh: { mode: 'app' } },
    }))).toThrow(/app_id/);

    const task = compiler.compile(makeCtx({
      modelConfig: { rh: { mode: 'app', app_id: '999' }, type: 'comfy' },
    }));
    expect(task._opsv.api_url).toBe('rhcli://app/999');
    expect(task._opsv.type).toBe('comfy');
  });

  it('model mode requires rh.endpoint_id', () => {
    expect(() => compiler.compile(makeCtx({
      modelConfig: { rh: { mode: 'model' } },
    }))).toThrow(/endpoint_id/);
  });
});
