import { parseRefs, parseTypedSections, resolveToInputs } from '../RefBinder';
import { RefEntry, ResolvedRef, TypedSectionRef } from '../../types/FrontmatterSchema';

// Mock getProjectDir to return a temp path
jest.mock('../../utils/configLoader', () => ({
  getProjectDir: jest.fn((_root: string, name: string) => `/tmp/opsv-test/${name}`),
}));

jest.mock('../AssetDocIndex', () => ({
  buildAssetDocIndex: jest.fn(() => ({
    entries: new Map([
      ['hero', { filePath: '/tmp/opsv-test/videospec/elements/@hero.md', dirName: 'elements', fileName: '@hero.md' }],
      ['bgm', { filePath: '/tmp/opsv-test/videospec/elements/@bgm.md', dirName: 'elements', fileName: '@bgm.md' }],
      ['style', { filePath: '/tmp/opsv-test/videospec/elements/@style.md', dirName: 'elements', fileName: '@style.md' }],
    ]),
  })),
}));

describe('RefBinder', () => {
  describe('parseRefs', () => {
    it('parses structured refs with id and type', () => {
      const refs: RefEntry[] = [
        { id: '@hero', type: 'image' },
        { id: '@bgm', type: 'audio' },
      ];
      const result = parseRefs(refs, { projectRoot: '/tmp/project' });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('hero');
      expect(result[0].type).toBe('image');
      expect(result[1].id).toBe('bgm');
      expect(result[1].type).toBe('audio');
    });

    it('parses refs with variant (@id:variant)', () => {
      const refs: RefEntry[] = [
        { id: '@style:night', type: 'image' },
      ];
      const result = parseRefs(refs, { projectRoot: '/tmp/project' });
      expect(result[0].id).toBe('style');
      expect(result[0].variant).toBe('night');
      expect(result[0].type).toBe('image');
    });

    it('infers type from id when type not specified', () => {
      const refs: RefEntry[] = [
        { id: '@hero_video' },
      ];
      const result = parseRefs(refs, { projectRoot: '/tmp/project' });
      expect(result[0].type).toBe('video');
    });

    it('defaults to image type when no hint', () => {
      const refs: RefEntry[] = [
        { id: '@hero' },
      ];
      const result = parseRefs(refs, { projectRoot: '/tmp/project' });
      expect(result[0].type).toBe('image');
    });

    it('strips @ prefix from id', () => {
      const refs: RefEntry[] = [
        { id: '@hero', type: 'image' },
      ];
      const result = parseRefs(refs, { projectRoot: '/tmp/project' });
      expect(result[0].id).toBe('hero');
    });
  });

  describe('parseTypedSections', () => {
    it('extracts refs from ### image section', () => {
      const body = `Some intro text

### image
[Hero design](#hero)
[Style ref](#style:night)

### audio
[Background music](#bgm)
`;
      const result = parseTypedSections(body);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ type: 'image', refId: 'hero', label: 'Hero design' });
      expect(result[1]).toEqual({ type: 'image', refId: 'style', label: 'Style ref', variant: 'night' });
      expect(result[2]).toEqual({ type: 'audio', refId: 'bgm', label: 'Background music' });
    });

    it('ignores content outside ### sections', () => {
      const body = `[Some link](#hero)

### image
[Hero design](#hero)
`;
      const result = parseTypedSections(body);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('image');
    });

    it('resets type on ## heading', () => {
      const body = `### image
[Hero](#hero)

## New Section
[Standalone](#bgm)

### audio
[Music](#bgm)
`;
      const result = parseTypedSections(body);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('image');
      expect(result[1].type).toBe('audio');
    });

    it('handles empty body', () => {
      expect(parseTypedSections('')).toEqual([]);
    });

    it('handles body with no typed sections', () => {
      expect(parseTypedSections('Just some text\nno sections')).toEqual([]);
    });
  });

  describe('resolveToInputs', () => {
    it('groups resolved refs by type', () => {
      const resolvedRefs: ResolvedRef[] = [
        { id: 'hero', type: 'image', docPath: '/tmp/hero.md', outputs: ['hero_1.png'] },
        { id: 'bgm', type: 'audio', docPath: '/tmp/bgm.md', outputs: ['bgm_1.mp3'] },
      ];
      const result = resolveToInputs(resolvedRefs, [], { projectRoot: '/tmp/project' });
      expect(result.image).toEqual(['hero_1.png']);
      expect(result.audio).toEqual(['bgm_1.mp3']);
    });

    it('deduplicates outputs', () => {
      const resolvedRefs: ResolvedRef[] = [
        { id: 'hero', type: 'image', docPath: '/tmp/hero.md', outputs: ['hero_1.png'] },
      ];
      const typedRefs: TypedSectionRef[] = [
        { type: 'image', refId: 'hero', label: 'ref' },
      ];
      const result = resolveToInputs(resolvedRefs, typedRefs, { projectRoot: '/tmp/project' });
      expect(result.image).toEqual(['hero_1.png']);
    });
  });
});
