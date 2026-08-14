import { validateArtifact } from '../artifacts/ArtifactValidator';
import { DEFAULT_ARTIFACT_CONTRACT } from '../artifacts/ArtifactContract';

describe('Artifact Validator (P3b)', () => {
  it('accepts a compliant artifact under the default contract', () => {
    const result = validateArtifact({
      type: 'video',
      mediaInfo: { duration: 4.0, codec: 'h264', resolution: { w: 1280, h: 720 } },
      provenance: { actor: 'agent', capability: 'video.generate' },
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a type mismatch', () => {
    const result = validateArtifact({
      contract: { output: { type: 'video' } },
      type: 'image',
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ rule: 'type', expected: 'video', actual: 'image' });
  });

  it('rejects duration out of tolerance with expected/actual', () => {
    const result = validateArtifact({
      contract: { validation: [{ duration: { tolerance: 0.1 } }] },
      type: 'video',
      expectedDuration: 4,
      mediaInfo: { duration: 5.7 },
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ rule: 'duration', expected: 4, actual: 5.7 });
  });

  it('accepts duration within tolerance', () => {
    const result = validateArtifact({
      contract: { validation: [{ duration: { tolerance: 0.1 } }] },
      type: 'video',
      expectedDuration: 4,
      mediaInfo: { duration: 4.05 },
      provenance: { actor: 'agent', capability: 'video.generate' },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a disallowed codec', () => {
    const result = validateArtifact({
      contract: { validation: [{ codec: { allowed: ['h264', 'h265'] } }] },
      type: 'video',
      mediaInfo: { codec: 'av1' },
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ rule: 'codec' });
  });

  it('rejects resolution below the minimum', () => {
    const result = validateArtifact({
      contract: { validation: [{ resolution: { min: { w: 1280, h: 720 } } }] },
      type: 'video',
      mediaInfo: { resolution: { w: 640, h: 480 } },
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ rule: 'resolution' });
  });

  it('rejects missing provenance when the contract requires it', () => {
    const result = validateArtifact({
      contract: { required: { provenance: true } },
      type: 'video',
      provenance: { actor: 'agent' }, // missing capability
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.rule === 'provenance.capability')).toBe(true);
  });

  it('degrades optional media checks to pass when probe data is absent', () => {
    const result = validateArtifact({
      contract: { validation: [{ duration: { tolerance: 0.1 } }] },
      type: 'video',
      expectedDuration: 4,
      mediaInfo: {}, // no probe
      provenance: { actor: 'agent', capability: 'video.generate' },
    });
    // media_info not required → missing data is not a failure
    expect(result.ok).toBe(true);
  });

  it('fails closed when media_info is required but probe data is absent', () => {
    const result = validateArtifact({
      contract: { required: { media_info: true }, validation: [{ duration: { tolerance: 0.1 } }] },
      type: 'video',
      expectedDuration: 4,
      mediaInfo: {},
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0].rule).toBe('duration');
  });

  it('defaults to the built-in contract when none is given', () => {
    const result = validateArtifact({
      type: 'video',
      provenance: { actor: 'agent', capability: 'video.generate' },
    });
    expect(result.ok).toBe(true);
    expect(DEFAULT_ARTIFACT_CONTRACT.required.uri).toBe(true);
    expect(DEFAULT_ARTIFACT_CONTRACT.required.provenance).toBe(true);
  });

  it('the default contract still requires provenance', () => {
    const result = validateArtifact({ type: 'video' });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.rule === 'provenance.actor')).toBe(true);
  });
});
