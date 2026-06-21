import { bindRefs, parseKey } from '../RefBinder';
import { RefsByType } from '../../types/Refs';
import { InputTypesLoader } from '../../utils/inputTypesLoader';

describe('RefBinder (v0.10.0)', () => {
  describe('parseKey', () => {
    it('parses external @id', () => {
      expect(parseKey('@hero')).toEqual({ kind: 'external', id: 'hero' });
    });

    it('parses external @id:variant', () => {
      expect(parseKey('@style:night')).toEqual({ kind: 'external', id: 'style', variant: 'night' });
    });

    it('parses doc @:key', () => {
      expect(parseKey('@:angle_side')).toEqual({ kind: 'doc', id: 'angle_side' });
    });

    it('rejects malformed keys', () => {
      expect(parseKey('hero')).toBeNull();
      expect(parseKey('@')).toBeNull();
      expect(parseKey('@:')).toBeNull();
      expect(parseKey('@id:')).toBeNull();
      expect(parseKey('@:key:variant')).not.toBeNull(); // @:key gets the rest
    });
  });

  describe('bindRefs', () => {
    const inputTypes = new InputTypesLoader();

    it('resolves grouped refs into ResolvedRef[]', () => {
      const raw: RefsByType = {
        image: {
          '@hero': ['/p/hero.png'],
          '@:angle_side': ['/p/side.png'],
        },
        audio: {
          '@bgm': ['/p/bgm.mp3'],
        },
      };
      const result = bindRefs(raw, { projectRoot: '/tmp', inputTypes });
      expect(result.errors).toEqual([]);
      expect(result.resolved).toHaveLength(3);
      expect(result.groupedInputs.image).toEqual(['/p/hero.png', '/p/side.png']);
      expect(result.groupedInputs.audio).toEqual(['/p/bgm.mp3']);
    });

    it('reports error for unknown input_type', () => {
      const raw: RefsByType = {
        plasma: {
          '@hero': ['/p/hero.png'],
        },
      };
      const result = bindRefs(raw, { projectRoot: '/tmp', inputTypes });
      expect(result.errors.some(e => e.includes('plasma'))).toBe(true);
    });

    it('reports error for empty paths array', () => {
      const raw: RefsByType = {
        image: {
          '@hero': [],
        },
      };
      const result = bindRefs(raw, { projectRoot: '/tmp', inputTypes });
      expect(result.errors.some(e => e.includes('non-empty'))).toBe(true);
    });

    it('reports error for malformed key', () => {
      const raw: RefsByType = {
        image: {
          'hero': ['/p/hero.png'],
        },
      };
      const result = bindRefs(raw, { projectRoot: '/tmp', inputTypes });
      expect(result.errors.some(e => e.includes('invalid key syntax'))).toBe(true);
    });

    it('returns empty result when refs undefined', () => {
      const result = bindRefs(undefined, { projectRoot: '/tmp', inputTypes });
      expect(result.resolved).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('preserves variant in resolved entries', () => {
      const raw: RefsByType = {
        image: {
          '@style:night': ['/p/night.png'],
        },
      };
      const result = bindRefs(raw, { projectRoot: '/tmp', inputTypes });
      expect(result.resolved[0].variant).toBe('night');
      expect(result.resolved[0].id).toBe('style');
    });
  });
});
