import fs from 'fs';
import path from 'path';
import { parseAssetDocument } from '../parser/CanonicalNormalizer';
import { toFrontmatter } from '../schema/convert';
import { FrontmatterParser } from '../../core/FrontmatterParser';

const FIXTURES = path.resolve(__dirname, 'fixtures');

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

describe('Canonical Normalizer (P2)', () => {
  it('assembles a CanonicalAsset from a shotlist document', () => {
    const asset = parseAssetDocument(readFixture('shotlist.md'), {
      docPath: 'videospec/shotlist.md',
    });
    expect(asset.category).toBe('shotlist');
    expect(asset.id).toBe('Shotlist-BanShengWeiMan');
    expect(asset.docPath).toBe('videospec/shotlist.md');
    expect(asset.status).toBe('drafting');
    expect(asset.refs.external).toHaveLength(1);
  });

  it('derives a timeline from recognized shot sections', () => {
    const content = [
      '---',
      'category: shot',
      'status: drafting',
      'id: shot-023',
      '---',
      '',
      '### Shot 023',
      '',
      '0-4s',
      '',
      'Alice walks toward the temple.',
      '',
      '### Shot 024',
      '',
      '4-8s',
      '',
      'Temple interior.',
    ].join('\n');
    const asset = parseAssetDocument(content, { docPath: 'videospec/shots/shot-023.md' });
    expect(asset.timeline).toBeDefined();
    expect(asset.timeline!.segments).toHaveLength(2);
    expect(asset.timeline!.segments[0]).toMatchObject({ id: '023', start: 0, end: 4 });
    expect(asset.timeline!.segments[1]).toMatchObject({ id: '024', start: 4, end: 8 });
  });

  it('leaves the frontmatter round-trip lossless through the asset', () => {
    const content = readFixture('character.md');
    const asset = parseAssetDocument(content, { docPath: 'videospec/elements/character-protagonist.md' });
    expect(toFrontmatter(asset.document)).toEqual(FrontmatterParser.parseRaw(content).frontmatter);
  });

  it('infers the asset id from docPath when the frontmatter has none', () => {
    const content = [
      '---',
      'category: scene',
      'status: drafting',
      '---',
      '',
      'Temple courtyard.',
    ].join('\n');
    const asset = parseAssetDocument(content, { docPath: 'videospec/scenes/temple.md' });
    expect(asset.id).toBe('temple');
  });

  it('does not fabricate a timeline when no segments are recognized', () => {
    const asset = parseAssetDocument(readFixture('music.md'), { docPath: 'videospec/music.md' });
    expect(asset.timeline).toBeUndefined();
    expect(asset.document.bodyRaw).toContain('## Segments');
  });
});
