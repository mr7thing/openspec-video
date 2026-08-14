import fs from 'fs';
import path from 'path';
import { FrontmatterParser } from '../../core/FrontmatterParser';
import { fromFrontmatter, toFrontmatter } from '../schema/convert';

const FIXTURES = path.resolve(__dirname, 'fixtures');

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

describe('Canonical Model frontmatter round-trip (P1)', () => {
  const cases = [
    ['shotlist.md', 'shotlist'],
    ['music.md', 'music'],
    ['character.md', 'character'],
  ] as const;

  for (const [file, category] of cases) {
    describe(file, () => {
      const content = readFixture(file);
      const { frontmatter, body } = FrontmatterParser.parseRaw(content);

      it(`parses as ${category}`, () => {
        expect(frontmatter.category).toBe(category);
      });

      it('extracts typed fields from the frontmatter', () => {
        const doc = fromFrontmatter(frontmatter, body);
        expect(doc.category).toBe(frontmatter.category);
        expect(doc.status).toBe(frontmatter.status);
        expect(doc.bodyRaw).toBe(body);
        if (frontmatter.id) expect(doc.id).toBe(frontmatter.id);
      });

      it('preserves the complete frontmatter record in raw', () => {
        const doc = fromFrontmatter(frontmatter, body);
        expect(doc.raw).toEqual(frontmatter);
      });

      it('round-trips the frontmatter record losslessly', () => {
        const doc = fromFrontmatter(frontmatter, body);
        expect(toFrontmatter(doc)).toEqual(frontmatter);
      });

      it('preserves unmodeled fields through raw', () => {
        const doc = fromFrontmatter(frontmatter, body);
        const modeledKeys = new Set([
          'category', 'status', 'id', 'prompt', 'visual_brief', 'visual_detailed',
          'negative_prompt', 'refs', 'reviews',
        ]);
        for (const key of Object.keys(frontmatter)) {
          if (!modeledKeys.has(key)) {
            expect(doc.raw[key]).toEqual(frontmatter[key]);
          }
        }
      });
    });
  }

  describe('refs extraction', () => {
    it('extracts external refs from the shotlist refs map', () => {
      const { frontmatter, body } = FrontmatterParser.parseRaw(readFixture('shotlist.md'));
      const doc = fromFrontmatter(frontmatter, body);
      expect(doc.refs.external).toHaveLength(1);
      expect(doc.refs.external[0]).toMatchObject({
        type: 'reference',
        namespace: 'asset',
        id: 'Music-BanShengWeiMan',
        raw: '@Music-BanShengWeiMan',
      });
      expect(doc.refs.design).toEqual([]);
    });

    it('extracts design refs from the character refs map', () => {
      const { frontmatter, body } = FrontmatterParser.parseRaw(readFixture('character.md'));
      const doc = fromFrontmatter(frontmatter, body);
      expect(doc.refs.design).toHaveLength(1);
      expect(doc.refs.design[0]).toMatchObject({ id: 'main', raw: '@:main' });
      expect(doc.refs.external).toEqual([]);
    });

    it('handles an empty refs map (music.md)', () => {
      const { frontmatter, body } = FrontmatterParser.parseRaw(readFixture('music.md'));
      const doc = fromFrontmatter(frontmatter, body);
      expect(doc.refs.external).toEqual([]);
      expect(doc.refs.design).toEqual([]);
    });
  });

  describe('typed prompt fields', () => {
    it('extracts visual_brief / prompt from character.md', () => {
      const { frontmatter, body } = FrontmatterParser.parseRaw(readFixture('character.md'));
      const doc = fromFrontmatter(frontmatter, body);
      expect(doc.visualBrief).toBe(frontmatter.visual_brief);
      expect(doc.prompt).toBe(frontmatter.prompt);
    });
  });
});
