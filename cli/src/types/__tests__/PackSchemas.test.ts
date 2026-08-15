import { ProfileContractSchema } from '../PackSchemas';

describe('ProfileContractSchema typed production contracts', () => {
  const baseProfile = {
    kind: 'production' as const,
    capability: 'video-generation',
    outputs: ['video'],
  };

  it('decodes versioned prompt/task references and explicit Artifact Contract defaults', () => {
    const parsed = ProfileContractSchema.parse({
      ...baseProfile,
      prompt_contract: { id: 'short-drama/shot-prompt', version: 1 },
      task_contract: { id: 'opsv.production-task', version: '1' },
      artifact: {
        contract: 'short-drama/shot-video/v1',
        output: { type: 'video' },
      },
    });

    expect(parsed.prompt_contract).toEqual({ id: 'short-drama/shot-prompt', version: '1' });
    expect(parsed.task_contract).toEqual({ id: 'opsv.production-task', version: '1' });
    expect(parsed.artifact).toEqual({
      contract: 'short-drama/shot-video/v1',
      output: { type: 'video' },
      required: {},
      validation: [],
      metadata: {},
    });
  });

  it('keeps unknown profile extension fields for compatibility but rejects unknown hard-contract fields', () => {
    const extension = ProfileContractSchema.parse({ ...baseProfile, vendor_extension: { enabled: true } });
    expect((extension as Record<string, unknown>).vendor_extension).toEqual({ enabled: true });

    expect(() => ProfileContractSchema.parse({
      ...baseProfile,
      prompt_contract: { id: 'short-drama/shot-prompt', version: 1, command: 'unsafe' },
    })).toThrow(/unrecognized/i);
    expect(() => ProfileContractSchema.parse({
      ...baseProfile,
      artifact: { output: { type: 'video' }, unexpected: true },
    })).toThrow(/unrecognized/i);
  });

  it('rejects Artifact Contract output types that are absent from production outputs', () => {
    expect(() => ProfileContractSchema.parse({
      ...baseProfile,
      artifact: { output: { type: 'audio' } },
    })).toThrow(/artifact output type/i);
  });
});
