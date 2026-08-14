import { parseRefExpression, scanRefExpressions } from '../parser/RefExpressionParser';
import { parseRefKey, parsePromptRefs } from '../../core/RefSyntaxParser';

describe('Reference DSL v2 (P2)', () => {
  describe('backward compatibility with parseRefKey (empty allowlist)', () => {
    // Every v1 refs-map key parses identically (or stays null).
    const keys = ['@alice', '@alice:v3', '@:main', '@scene_temple'];
    for (const key of keys) {
      it(`parses ${key} the same as v1`, () => {
        const v1 = parseRefKey(key);
        if (v1 === null) {
          expect(parseRefExpression(key)).toBeNull();
        } else {
          const ref = parseRefExpression(key);
          expect(ref).not.toBeNull();
          expect(ref!.id).toBe(v1.id);
          expect(ref!.variant).toBe(v1.variant);
        }
      });
    }

    it('returns null for dotted keys not in the allowlist (matches v1 null)', () => {
      expect(parseRefKey('@id.with.dot')).toBeNull();
      expect(parseRefExpression('@alice.face')).toBeNull(); // face not allowlisted
    });

    it('returns null for malformed keys', () => {
      for (const bad of ['hero', '@', '@:', '@id:', '@:key:variant', '@id:variant:extra']) {
        expect(parseRefExpression(bad)).toBeNull();
      }
    });
  });

  describe('parseRefExpression with allowlist', () => {
    it('parses a selector when allowlisted', () => {
      const ref = parseRefExpression('@alice.face', ['face']);
      expect(ref).toEqual({
        type: 'reference',
        namespace: 'asset',
        id: 'alice',
        selector: 'face',
        raw: '@alice.face',
      });
    });

    it('parses selector + variant + state together', () => {
      const ref = parseRefExpression('@alice.face:v2[approved]', ['face']);
      expect(ref).toMatchObject({
        id: 'alice',
        selector: 'face',
        variant: 'v2',
        state: 'approved',
        raw: '@alice.face:v2[approved]',
      });
    });

    it('rejects a non-allowlisted selector', () => {
      expect(parseRefExpression('@shot.output', ['face'])).toBeNull();
    });

    it('parses a state pin without selector', () => {
      const ref = parseRefExpression('@temple[approved]');
      expect(ref).toMatchObject({ id: 'temple', state: 'approved' });
    });

    it('parses FRAME directives', () => {
      const ref = parseRefExpression('@FRAME:shot_001_first');
      expect(ref).toMatchObject({ namespace: 'FRAME', id: 'shot_001_first' });
    });
  });

  describe('scanRefExpressions (text context)', () => {
    it('scans v1 tokens from text', () => {
      const tokens = scanRefExpressions('Alice walks with @alice toward @temple:v2.');
      expect(tokens.map((t) => t.ref.raw)).toEqual(['@alice', '@temple:v2']);
    });

    it('leaves a non-allowlisted .selector as prose (v1 behavior)', () => {
      const tokens = scanRefExpressions('Shot @shot.output needs review.');
      expect(tokens.map((t) => t.ref.raw)).toEqual(['@shot']);
    });

    it('consumes an allowlisted selector into the token', () => {
      const tokens = scanRefExpressions('Use @alice.face for identity.', ['face']);
      expect(tokens.map((t) => t.ref.raw)).toEqual(['@alice.face']);
    });

    it('matches the v1 parsePromptRefs on shared inputs', () => {
      const text = 'Prompt: @hero and @:angle_side plus @FRAME:shot_01_first.';
      const v1 = parsePromptRefs(text).map((t) => t.raw);
      const v2 = scanRefExpressions(text).map((t) => t.ref.raw);
      expect(v2).toEqual(v1);
    });

    it('reports source positions', () => {
      const tokens = scanRefExpressions('x @alice y');
      expect(tokens[0]).toMatchObject({ start: 2, end: 8 });
    });
  });
});
