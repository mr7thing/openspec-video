import { resolveNodeMappingValue, resolveSize, resolveDuration } from '../shared/compilerUtils';
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

describe('compilerUtils', () => {
  describe('resolveNodeMappingValue', () => {
    it('resolves prompt', () => {
      expect(resolveNodeMappingValue('prompt', baseJob, [], baseConfig)).toBe('a cat');
    });

    it('resolves negative_prompt from extra', () => {
      expect(resolveNodeMappingValue('negative_prompt', baseJob, [], baseConfig)).toBe('blurry');
    });

    it('falls back to config default for negative_prompt', () => {
      const job = { ...baseJob, payload: { ...baseJob.payload, extra: { media_refs: [] } } };
      expect(resolveNodeMappingValue('negative_prompt', job, [], baseConfig)).toBe('default_neg');
    });

    it('resolves imageN from refImages', () => {
      expect(resolveNodeMappingValue('image1', baseJob, ['img_a.png'], baseConfig)).toBe('img_a.png');
      expect(resolveNodeMappingValue('image2', baseJob, ['img_a.png'], baseConfig)).toBeUndefined();
    });

    it('resolves extra fields', () => {
      const job = { ...baseJob, payload: { ...baseJob.payload, extra: { media_refs: [], style: 'anime' } } };
      expect(resolveNodeMappingValue('style', job, [], baseConfig)).toBe('anime');
    });

    it('falls back to model config defaults', () => {
      expect(resolveNodeMappingValue('seed', baseJob, [], baseConfig)).toBe(42);
    });
  });

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
});
