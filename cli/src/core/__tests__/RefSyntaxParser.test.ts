import {
  parsePromptRefs,
  extractRefsFromText,
  extractFrameRefs,
  extractAllRefs,
} from '../RefSyntaxParser';

describe('RefSyntaxParser', () => {
  describe('parsePromptRefs', () => {
    it('parses external @id', () => {
      const tokens = parsePromptRefs('@hero is here');
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({
        kind: 'external',
        id: 'hero',
        key: '@hero',
      });
    });

    it('parses @id:variant', () => {
      const tokens = parsePromptRefs('use @style:night look');
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({
        kind: 'external',
        id: 'style',
        variant: 'night',
        key: '@style:night',
      });
    });

    it('parses @:key in-doc reference', () => {
      const tokens = parsePromptRefs('see @:angle_side detail');
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({
        kind: 'doc',
        id: 'angle_side',
        key: '@:angle_side',
      });
    });

    it('parses @FRAME:* with shot id', () => {
      const tokens = parsePromptRefs('@FRAME:shot_01_first opens');
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({
        kind: 'frame',
        key: '@FRAME:shot_01_first',
      });
    });

    it('parses mixed tokens in source order', () => {
      const tokens = parsePromptRefs('@hero with @:angle_side in @style:night');
      expect(tokens.map(t => t.key)).toEqual(['@hero', '@:angle_side', '@style:night']);
    });

    it('handles punctuation around tokens', () => {
      const tokens = parsePromptRefs('@hero, @style:night.');
      expect(tokens.map(t => t.key)).toEqual(['@hero', '@style:night']);
    });

    it('returns empty for text without @', () => {
      expect(parsePromptRefs('a plain prompt')).toEqual([]);
      expect(parsePromptRefs('')).toEqual([]);
    });
  });

  describe('extractRefsFromText', () => {
    it('dedupes and excludes frame tokens', () => {
      const tokens = extractRefsFromText('@hero @hero @FRAME:shot_01_first @:angle_side');
      expect(tokens.map(t => t.key)).toEqual(['@hero', '@:angle_side']);
    });
  });

  describe('extractFrameRefs', () => {
    it('returns only frame tokens', () => {
      const tokens = extractFrameRefs('@hero @FRAME:shot_01_first @FRAME:shot_02_last');
      expect(tokens.map(t => t.key)).toEqual(['@FRAME:shot_01_first', '@FRAME:shot_02_last']);
    });
  });

  describe('extractAllRefs', () => {
    it('combines tokens across multiple text fields and dedupes', () => {
      const tokens = extractAllRefs(
        '@hero in the room',
        'visual brief: @:angle_side',
        '@hero stands tall',
      );
      expect(tokens.map(t => t.key).sort()).toEqual(['@:angle_side', '@hero']);
    });

    it('skips undefined fields', () => {
      const tokens = extractAllRefs(undefined, '@hero', undefined);
      expect(tokens.map(t => t.key)).toEqual(['@hero']);
    });
  });
});
