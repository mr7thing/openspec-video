import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  discoverCapabilities,
  validateCapabilityContract,
  TYPE_TO_CAPABILITY,
  CAPABILITY_ALIASES,
} from '../capabilities/CapabilityRegistry';
import { OpsVErrorCode } from '../../errors/OpsVError';

describe('Capability Registry (P5)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-cap-test-'));
    fs.mkdirSync(path.join(tmp, '.opsv'), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function writeProjectConfig() {
    fs.writeFileSync(
      path.join(tmp, '.opsv', 'project.yaml'),
      'bindings:\n  video-generation: my.video\n  image-generation: my.image\n',
    );
    fs.writeFileSync(
      path.join(tmp, '.opsv', 'api_config.yaml'),
      [
        'models:',
        '  my.video:',
        '    provider: myprovider',
        '    type: video',
        '  my.image:',
        '    provider: myprovider',
        '    type: imagen',
        '  my.disabled:',
        '    provider: myprovider',
        '    type: video',
        '    enable: false',
      ].join('\n'),
    );
  }

  it('maps model type to a semantic capability', () => {
    expect(TYPE_TO_CAPABILITY.video).toBe('video.generate');
    expect(TYPE_TO_CAPABILITY.imagen).toBe('image.generate');
    expect(TYPE_TO_CAPABILITY.audio).toBe('audio.generate');
  });

  it('aliases pack capability names to semantic ids', () => {
    expect(CAPABILITY_ALIASES['video-generation']).toBe('video.generate');
    expect(CAPABILITY_ALIASES['image-generation']).toBe('image.generate');
  });

  it('discovers bound capabilities with their providers', () => {
    writeProjectConfig();
    const registry = discoverCapabilities(tmp);

    const video = registry['video.generate'];
    expect(video).toBeDefined();
    expect(video.available).toBe(true);
    expect(video.providers.some((p) => p.modelKey === 'my.video' && p.provider === 'myprovider')).toBe(true);

    const image = registry['image.generate'];
    expect(image.available).toBe(true);
    expect(image.providers.some((p) => p.modelKey === 'my.image')).toBe(true);
  });

  it('registers an enable:false bound model as a provider without flipping availability on its own', () => {
    fs.writeFileSync(
      path.join(tmp, '.opsv', 'project.yaml'),
      'bindings:\n  video-generation: my.disabled\n',
    );
    fs.writeFileSync(
      path.join(tmp, '.opsv', 'api_config.yaml'),
      'models:\n  my.disabled:\n    provider: myprovider\n    type: video\n    enable: false\n',
    );
    const registry = discoverCapabilities(tmp);
    const video = registry['video.generate'];
    // The disabled project model is registered as a provider...
    expect(video.providers.some((p) => p.modelKey === 'my.disabled')).toBe(true);
    // ...but availability is governed by enabled providers (builtin tier supplies them).
    expect(video.available).toBe(true);
  });

  it('does not write any files (read-only projection)', () => {
    writeProjectConfig();
    discoverCapabilities(tmp);
    const entries = fs.readdirSync(path.join(tmp, '.opsv'));
    expect(entries.sort()).toEqual(['api_config.yaml', 'project.yaml']);
  });

  describe('validateCapabilityContract', () => {
    it('accepts known canonical input/output types', () => {
      expect(() =>
        validateCapabilityContract('video.generate', 'opsv.shot', 'artifact.video'),
      ).not.toThrow();
    });

    it('rejects an unknown input type with CAPABILITY_CONTRACT_INVALID', () => {
      try {
        validateCapabilityContract('video.generate', 'unknown.type', 'artifact.video');
        fail('should have thrown');
      } catch (err: any) {
        expect(err.code).toBe(OpsVErrorCode.CAPABILITY_CONTRACT_INVALID);
      }
    });

    it('rejects an unknown output type', () => {
      expect(() =>
        validateCapabilityContract('video.generate', 'opsv.shot', 'artifact.unknown'),
      ).toThrow(/unknown output type/);
    });
  });
});
