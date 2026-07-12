import { compilePrompt } from '../../RefEngine';
import { ResolvedRef } from '../../../types/FrontmatterSchema';

const refs: ResolvedRef[] = [
  { key: '@hero', type: 'image', kind: 'external', id: 'hero', paths: ['/p/hero.png'] },
  { key: '@:angle_side', type: 'image', kind: 'doc', id: 'angle_side', paths: ['/p/side.png'] },
  { key: '@style:night', type: 'image', kind: 'external', id: 'style', variant: 'night', paths: ['/p/night.png'] },
  { key: '@bgm', type: 'audio', kind: 'external', id: 'bgm', paths: ['/p/bgm.mp3'] },
];

describe('PromptCompiler', () => {
  describe('mode: keep', () => {
    it('returns prompt unchanged and full refsMap', () => {
      const result = compilePrompt('@hero in @style:night with @:angle_side and @bgm', refs, 'keep');
      expect(result.prompt).toBe('@hero in @style:night with @:angle_side and @bgm');
      expect(result.refsMap).toEqual({
        '@hero': '@hero',
        '@:angle_side': '@:angle_side',
        '@style:night': '@style:night',
        '@bgm': '@bgm',
      });
    });
  });

  describe('mode: index', () => {
    it('rewrites @-tokens to typeN sequence', () => {
      const result = compilePrompt('@hero with @:angle_side and @style:night plus @bgm', refs, 'index');
      expect(result.prompt).toBe('image1 with image2 and image3 plus audio1');
      expect(result.refsMap).toEqual({
        '@hero': 'image1',
        '@:angle_side': 'image2',
        '@style:night': 'image3',
        '@bgm': 'audio1',
      });
    });

    it('leaves frame tokens untouched', () => {
      const result = compilePrompt('@hero with @FRAME:shot_01_first', refs, 'index');
      expect(result.prompt).toBe('image1 with @FRAME:shot_01_first');
    });
  });

  describe('mode: name', () => {
    it('rewrites to bare ids', () => {
      const result = compilePrompt('@hero @:angle_side @style:night @bgm', refs, 'name');
      expect(result.prompt).toBe('hero angle_side style bgm');
      expect(result.refsMap['@:angle_side']).toBe('angle_side');
    });
  });

  describe('empty inputs', () => {
    it('returns empty result for empty prompt', () => {
      expect(compilePrompt('', refs, 'keep')).toEqual({ prompt: '', refsMap: {} });
    });

    it('handles no refs gracefully', () => {
      expect(compilePrompt('plain text', [], 'index')).toEqual({ prompt: 'plain text', refsMap: {} });
    });
  });
});
