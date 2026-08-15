import { canonicalDigest, canonicalJson } from '../CanonicalDigest';
import { createCanonicalSnapshot, digestSource, isSnapshotStale } from '../CanonicalSnapshot';
import type { CanonicalSnapshot, CanonicalSnapshotDraft } from '../CanonicalSnapshot';
import { parseAssetDocument } from '../../parser/CanonicalNormalizer';
import { DEFAULT_ARTIFACT_CONTRACT } from '../../artifacts/ArtifactContract';

function semanticDraft(source: string): CanonicalSnapshotDraft {
  const sourcePath = 'videospec/shots/arrival.md';
  return {
    schema: 'opsv.canonical-snapshot',
    version: 1,
    source: { path: sourcePath, digest: digestSource(source) },
    asset: parseAssetDocument(source, { docPath: sourcePath }),
    references: [],
    contract: {
      schema: 'opsv.production-contract',
      version: 1,
      pack: { id: 'short-drama', version: '1.0.0', contentDigest: `sha256:${'4'.repeat(64)}` },
      category: 'shot',
      profile: {
        id: 'shot-video',
        kind: 'production',
        capability: 'video-generation',
        digest: `sha256:${'5'.repeat(64)}`,
      },
      boundModel: 'rhcli.seedance',
      outputs: ['video'],
      inputSlots: [],
      policy: {},
      artifactContract: {
        source: 'builtin',
        value: DEFAULT_ARTIFACT_CONTRACT,
        digest: `sha256:${'6'.repeat(64)}`,
      },
      digest: `sha256:${'2'.repeat(64)}`,
    },
    production: {
      type: 'produce',
      prompt: 'Arrival prompt',
      payload: {
        prompt: 'Arrival prompt',
        global_settings: { aspect_ratio: '16:9', quality: 'high' },
      },
      references: { image: [], video: [], audio: [] },
    },
  };
}

function snapshotFor(source: string): CanonicalSnapshot {
  const sourceDigest = digestSource(source);
  return {
    schema: 'opsv.canonical-snapshot',
    version: 1,
    source: { path: 'videospec/shots/arrival.md', digest: sourceDigest },
    asset: {} as CanonicalSnapshot['asset'],
    references: [],
    contract: {} as CanonicalSnapshot['contract'],
    production: {} as CanonicalSnapshot['production'],
    digest: 'sha256:placeholder',
  };
}

describe('Canonical digest and Snapshot identity', () => {
  it('serializes object keys deterministically while preserving array order', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 }, list: ['b', 'a'] }))
      .toBe('{"a":{"x":3,"y":2},"list":["b","a"],"z":1}');
    expect(canonicalDigest({ b: 2, a: 1 })).toBe(canonicalDigest({ a: 1, b: 2 }));
    expect(canonicalDigest({ a: 1 }, 'schema-a', 1))
      .not.toBe(canonicalDigest({ a: 1 }, 'schema-b', 1));
    expect(canonicalDigest({ a: 1 }, 'schema-a', 1))
      .not.toBe(canonicalDigest({ a: 1 }, 'schema-a', 2));
    expect(() => canonicalJson({ invalid: Number.POSITIVE_INFINITY })).toThrow(/finite/);
  });

  it('excludes source-preservation fields from semantic Snapshot identity', () => {
    const firstSource = [
      '---',
      'id: arrival',
      'category: shot',
      'status: drafting',
      'quality: high',
      '---',
      '',
      'Arrival prompt',
      '',
    ].join('\n');
    const reformattedSource = [
      '---',
      '# equivalent frontmatter with a different order and quoting',
      'quality: "high"',
      'status: drafting',
      'category: shot',
      'id: arrival',
      '---',
      '',
      'Arrival prompt',
      '',
    ].join('\n');

    const first = createCanonicalSnapshot(semanticDraft(firstSource));
    const reformatted = createCanonicalSnapshot(semanticDraft(reformattedSource));

    expect(first.source.digest).not.toBe(reformatted.source.digest);
    expect(Object.keys(first.asset.document.raw)).not.toEqual(Object.keys(reformatted.asset.document.raw));
    expect(first.digest).toBe(reformatted.digest);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.production.references)).toBe(true);
  });

  it('detects a source change without treating the old Snapshot as mutable', () => {
    const snapshot = snapshotFor('original source');
    expect(isSnapshotStale(snapshot, 'original source')).toBe(false);
    expect(isSnapshotStale(snapshot, 'changed source')).toBe(true);
    expect(snapshot.source.digest).toBe(digestSource('original source'));
  });
});
