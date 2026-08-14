import {
  CanonicalReferenceSchema,
  CanonicalTimelineSchema,
  CanonicalArtifactSchema,
  CanonicalReviewSchema,
  CanonicalDocumentSchema,
  CanonicalAssetSchema,
  AssetStateEnum,
} from '../schema';
import { fromRefToken } from '../schema/convert';
import { parseRefKey } from '../../core/RefSyntaxParser';

describe('Canonical Model schema (P1)', () => {
  describe('CanonicalReference', () => {
    it('accepts a minimal external reference', () => {
      const ref = CanonicalReferenceSchema.parse({
        type: 'reference',
        id: 'alice',
        raw: '@alice',
      });
      expect(ref.namespace).toBe('asset'); // default applied
      expect(ref.id).toBe('alice');
      expect(ref.raw).toBe('@alice');
    });

    it('accepts an external reference with variant and selector', () => {
      const ref = CanonicalReferenceSchema.parse({
        type: 'reference',
        id: 'alice',
        selector: 'face',
        variant: 'v2',
        raw: '@alice.face:v2',
      });
      expect(ref.variant).toBe('v2');
      expect(ref.selector).toBe('face');
    });

    it('rejects a reference without id', () => {
      expect(() =>
        CanonicalReferenceSchema.parse({ type: 'reference', raw: '@' }),
      ).toThrow();
    });

    it('rejects a reference without raw', () => {
      expect(() =>
        CanonicalReferenceSchema.parse({ type: 'reference', id: 'alice' }),
      ).toThrow();
    });

    it('rejects a wrong type literal', () => {
      expect(() =>
        CanonicalReferenceSchema.parse({ type: 'asset', id: 'alice', raw: '@alice' }),
      ).toThrow();
    });
  });

  describe('CanonicalTimeline', () => {
    it('accepts segments with derived duration', () => {
      const tl = CanonicalTimelineSchema.parse({
        segments: [
          { id: 'seg_001', start: 0, end: 3, subjects: [] },
          { id: 'seg_002', start: 3, end: 7, subjects: [{ type: 'reference', id: 'alice', raw: '@alice' }] },
        ],
        duration: 7,
      });
      expect(tl.segments).toHaveLength(2);
      expect(tl.duration).toBe(7);
    });

    it('rejects a segment without id', () => {
      expect(() =>
        CanonicalTimelineSchema.parse({ segments: [{ start: 0, end: 1 }] }),
      ).toThrow();
    });
  });

  describe('CanonicalArtifact', () => {
    it('accepts a minimal artifact with default state draft', () => {
      const art = CanonicalArtifactSchema.parse({
        id: 'shot-023:v1',
        taskId: 'shot-023',
        uri: 'assets/shot-023_1.mp4',
        type: 'video',
        provenance: { actor: 'agent', capability: 'video.generate' },
      });
      expect(art.state).toBe('draft');
      expect(art.validation.ok).toBe(false);
    });

    it('accepts every asset state enum', () => {
      for (const s of ['draft', 'candidate', 'review', 'approved', 'released', 'rejected', 'superseded'] as const) {
        expect(AssetStateEnum.safeParse(s).success).toBe(true);
      }
    });
  });

  describe('CanonicalReview', () => {
    it('accepts a structured annotation', () => {
      const review = CanonicalReviewSchema.parse({
        id: 'review-928',
        assetId: 'shot-023',
        artifactId: 'shot-023:v4',
        kind: 'annotation',
        timeline: { start: 3.0, end: 3.8 },
        target: 'alice',
        issue: 'identity',
        severity: 'high',
        comment: 'face drift',
        actor: { type: 'human', id: 'user@example.com' },
        timestamp: '2026-08-14T10:00:00.000Z',
      });
      expect(review.kind).toBe('annotation');
      expect(review.timeline).toEqual({ start: 3.0, end: 3.8 });
    });
  });

  describe('CanonicalDocument', () => {
    it('accepts a parsed document with empty refs', () => {
      const doc = CanonicalDocumentSchema.parse({
        category: 'music',
        status: 'drafting',
        refs: { external: [], design: [] },
        reviews: [],
        bodyRaw: '# Music',
        raw: { bpm: 78 },
      });
      expect(doc.category).toBe('music');
      expect(doc.raw).toEqual({ bpm: 78 });
    });

    it('rejects an invalid status', () => {
      expect(() =>
        CanonicalDocumentSchema.parse({
          category: 'music',
          status: 'released', // not a document lifecycle status
          refs: { external: [], design: [] },
          reviews: [],
          bodyRaw: '',
        }),
      ).toThrow();
    });
  });

  describe('CanonicalAsset', () => {
    it('accepts an asset wrapping a document', () => {
      const asset = CanonicalAssetSchema.parse({
        id: 'character-protagonist',
        category: 'character',
        docPath: 'videospec/elements/character-protagonist.md',
        document: {
          category: 'character',
          status: 'drafting',
          refs: { external: [], design: [] },
          reviews: [],
          bodyRaw: '',
        },
        status: 'drafting',
      });
      expect(asset.status).toBe('drafting');
      expect(asset.artifacts).toEqual([]);
    });
  });

  describe('fromRefToken', () => {
    it('converts @alice:v3 to a reference expression', () => {
      const parsed = parseRefKey('@alice:v3');
      expect(parsed).not.toBeNull();
      const ref = fromRefToken(parsed!, '@alice:v3');
      expect(ref).toEqual({
        type: 'reference',
        namespace: 'asset',
        id: 'alice',
        variant: 'v3',
        raw: '@alice:v3',
      });
    });

    it('converts @:key (design) preserving the raw text', () => {
      const parsed = parseRefKey('@:main');
      expect(parsed).not.toBeNull();
      const ref = fromRefToken(parsed!, '@:main');
      expect(ref.id).toBe('main');
      expect(ref.raw).toBe('@:main');
      expect(ref.variant).toBeUndefined();
    });

    it('supports an explicit namespace (FRAME)', () => {
      const ref = fromRefToken({ id: 'shot_001_first' }, '@FRAME:shot_001_first', 'FRAME');
      expect(ref.namespace).toBe('FRAME');
      expect(ref.id).toBe('shot_001_first');
    });
  });
});
