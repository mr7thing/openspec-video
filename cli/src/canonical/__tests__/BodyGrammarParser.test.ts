import { parseBody, parseTimelineRange } from '../parser/BodyGrammarParser';

describe('Body Grammar Parser (P2)', () => {
  describe('parseTimelineRange', () => {
    it('parses inline second ranges', () => {
      expect(parseTimelineRange('0-4s')).toEqual({ start: 0, end: 4 });
      expect(parseTimelineRange('3 - 7s')).toEqual({ start: 3, end: 7 });
      expect(parseTimelineRange('10s - 15s')).toEqual({ start: 10, end: 15 });
    });

    it('parses clock ranges', () => {
      expect(parseTimelineRange('00:32 - 00:36')).toEqual({ start: 32, end: 36 });
      expect(parseTimelineRange('01:00-01:05')).toEqual({ start: 60, end: 65 });
    });

    it('returns null for a non-range or inverted range', () => {
      expect(parseTimelineRange('Alice walks')).toBeNull();
      expect(parseTimelineRange('7-4s')).toBeNull();
    });
  });

  describe('parseBody', () => {
    it('recognizes Approved References and Design References sections', () => {
      const body = [
        '## Design References',
        '',
        '### image',
        '![main](ref/main.png)',
        '',
        '## Approved References',
        '',
        '![v1](out/shot_1.png)',
      ].join('\n');
      const parsed = parseBody(body);
      expect(parsed.approvedRefSection).toContain('![v1](out/shot_1.png)');
      expect(parsed.designRefSection).toContain('![main](ref/main.png)');
    });

    it('recognizes semantic Subject/Scene/Action/Camera blocks', () => {
      const body = [
        '## Subject',
        '@alice:v3',
        '',
        '## Camera',
        'Slow dolly in.',
      ].join('\n');
      const parsed = parseBody(body);
      expect(parsed.semanticSections.subject).toContain('@alice:v3');
      expect(parsed.semanticSections.camera).toContain('Slow dolly in.');
    });

    it('recognizes ### Shot headings as segment drafts with ranges', () => {
      const body = [
        '### Shot 023',
        '',
        '0-4s',
        '',
        'Alice walks toward the temple.',
      ].join('\n');
      const parsed = parseBody(body);
      expect(parsed.segmentDrafts).toHaveLength(1);
      expect(parsed.segmentDrafts[0]).toMatchObject({
        id: '023',
        start: 0,
        end: 4,
      });
    });

    it('recognizes Chinese shot headings with durations', () => {
      const body = '## 镜头 NN-1｜标题 时长 15s\n\nAlice enters.\n\n0-15s';
      const parsed = parseBody(body);
      expect(parsed.segmentDrafts).toHaveLength(1);
      expect(parsed.segmentDrafts[0].id).toBe('NN-1');
      expect(parsed.segmentDrafts[0].start).toBe(0);
    });

    it('is lossless: bodyRaw equals the input', () => {
      const body = 'Free prose that is not structured.\n\n## Camera\nslow push in.';
      const parsed = parseBody(body);
      expect(parsed.bodyRaw).toBe(body);
    });
  });
});
