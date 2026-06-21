import { resolveSize, resolveDuration } from '../shared/compilerUtils';
import { evaluateSource, evaluateInputs, InputEvalContext } from '../shared/InputEvaluator';
import { Job } from '../../../types/Job';
import { ModelConfig } from '../../../utils/configLoader';

const baseJob: Job = {
  id: 'shot1',
  type: 'imagen',
  payload: {
    prompt: 'a cat',
    global_settings: { aspect_ratio: '16:9', quality: 'standard' },
    extra: { media_refs: [], negative_prompt: 'blurry' },
  },
};

const baseConfig: ModelConfig = {
  provider: 'test',
  type: 'imagen',
  api_url: 'http://test',
  defaults: { negative_prompt: 'default_neg', seed: 42 },
};

const baseEvalCtx: InputEvalContext = {
  job: baseJob,
  modelConfig: baseConfig,
  referenceImages: ['img_a.png', 'img_b.png'],
};

describe('compilerUtils', () => {
  describe('resolveSize', () => {
    it('returns defaults size when set', () => {
      const config = { ...baseConfig, defaults: { size: '512x512' } };
      expect(resolveSize({}, config, 'size')).toBe('512x512');
    });

    it('returns quality_map value', () => {
      const config = { ...baseConfig, quality_map: { hd: '1920x1080' } };
      expect(resolveSize({ quality: 'hd' }, config)).toBe('1920x1080');
    });

    it('returns sizeMap from aspect_ratio', () => {
      expect(resolveSize({ aspect_ratio: '16:9' }, baseConfig)).toBe('1920x1080');
    });

    it('defaults to 1024x1024', () => {
      expect(resolveSize({}, baseConfig)).toBe('1024x1024');
    });
  });

  describe('resolveDuration', () => {
    it('parses numeric duration from payload', () => {
      const job = { ...baseJob, payload: { ...baseJob.payload, duration: '5' } };
      expect(resolveDuration(job, baseConfig)).toBe(5);
    });

    it('returns string duration if not numeric', () => {
      const job = { ...baseJob, payload: { ...baseJob.payload, duration: 'long' } };
      expect(resolveDuration(job, baseConfig)).toBe('long');
    });

    it('falls back to config default', () => {
      const config = { ...baseConfig, defaults: { duration: 10 } };
      expect(resolveDuration(baseJob, config)).toBe(10);
    });

    it('returns undefined when no duration', () => {
      expect(resolveDuration(baseJob, baseConfig)).toBeUndefined();
    });
  });

  describe('InputEvaluator (replaces resolveNodeMappingValue)', () => {
    it('resolves prompt shorthand', () => {
      expect(evaluateSource('prompt', baseEvalCtx)).toBe('a cat');
    });

    it('resolves negative_prompt shorthand', () => {
      expect(evaluateSource('negative_prompt', baseEvalCtx)).toBe('blurry');
    });

    it('falls back to config default for negative_prompt', () => {
      const ctx = { ...baseEvalCtx, job: { ...baseJob, payload: { ...baseJob.payload, extra: { media_refs: [] } } } };
      expect(evaluateSource('negative_prompt', ctx)).toBe('default_neg');
    });

    it('resolves reference_images[N]', () => {
      expect(evaluateSource('reference_images[0]', baseEvalCtx)).toBe('img_a.png');
      expect(evaluateSource('reference_images[1]', baseEvalCtx)).toBe('img_b.png');
      expect(evaluateSource('reference_images[5]', baseEvalCtx)).toBeUndefined();
    });

    it('resolves reference_images full array', () => {
      expect(evaluateSource('reference_images', baseEvalCtx)).toEqual(['img_a.png', 'img_b.png']);
    });

    it('resolves default.X path', () => {
      expect(evaluateSource('default.seed', baseEvalCtx)).toBe(42);
    });

    it('resolves first_frame / last_frame', () => {
      const job: Job = { ...baseJob, payload: { ...baseJob.payload, frame_ref: { first: 'frame1.png', last: 'frame2.png' } } };
      const ctx = { ...baseEvalCtx, job };
      expect(evaluateSource('first_frame', ctx)).toBe('frame1.png');
      expect(evaluateSource('last_frame', ctx)).toBe('frame2.png');
    });

    it('resolves job.payload.prompt path', () => {
      expect(evaluateSource('job.payload.prompt', baseEvalCtx)).toBe('a cat');
    });

    it('evaluateInputs resolves full config', () => {
      const inputs = {
        prompt: { source: 'prompt' },
        image1: { source: 'reference_images[0]' },
        seed: { source: 'default.seed' },
      };
      const result = evaluateInputs(inputs, baseEvalCtx);
      expect(result.prompt).toBe('a cat');
      expect(result.image1).toBe('img_a.png');
      expect(result.seed).toBe(42);
    });
  });
});
