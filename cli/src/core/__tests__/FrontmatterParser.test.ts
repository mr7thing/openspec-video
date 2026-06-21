import { FrontmatterParser } from '../FrontmatterParser';
import { ValidationError } from '../../errors/OpsVError';

describe('FrontmatterParser', () => {
  describe('parseRaw', () => {
    it('parses basic frontmatter', () => {
      const content = `---\nstatus: drafting\ncategory: character\n---\n# Hero\nA brave hero.`;
      const result = FrontmatterParser.parseRaw(content);
      expect(result.frontmatter.status).toBe('drafting');
      expect(result.frontmatter.category).toBe('character');
      expect(result.body).toBe('# Hero\nA brave hero.');
    });

    it('parses empty frontmatter', () => {
      const content = `---\n\n---\nBody text`;
      const result = FrontmatterParser.parseRaw(content);
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe('Body text');
    });

    it('throws on missing frontmatter', () => {
      expect(() => FrontmatterParser.parseRaw('No frontmatter here')).toThrow(ValidationError);
    });

    it('handles CRLF line endings', () => {
      const content = `---\r\nstatus: approved\r\n---\r\nBody`;
      const result = FrontmatterParser.parseRaw(content);
      expect(result.frontmatter.status).toBe('approved');
      expect(result.body).toBe('Body');
    });
  });

  describe('updateField', () => {
    it('updates a field in frontmatter', () => {
      const content = `---\nstatus: drafting\n---\nBody`;
      const updated = FrontmatterParser.updateField(content, 'status', 'approved');
      expect(updated).toContain('status: approved');
      expect(updated).toContain('Body');
    });

    it('adds a new field', () => {
      const content = `---\nstatus: drafting\n---\nBody`;
      const updated = FrontmatterParser.updateField(content, 'category', 'character');
      expect(updated).toContain('category: character');
    });
  });

  describe('appendReview', () => {
    it('appends a review entry string', () => {
      const content = `---\nstatus: drafting\n---\nBody`;
      const updated = FrontmatterParser.appendReview(content, '2024-01-01 approved');
      expect(updated).toContain('reviews:');
      expect(updated).toContain('2024-01-01 approved');
    });

    it('appends to existing reviews', () => {
      const content = `---\nreviews:\n  - old review\n---\nBody`;
      const updated = FrontmatterParser.appendReview(content, 'new review');
      expect(updated).toContain('old review');
      expect(updated).toContain('new review');
    });
  });

  describe('extractFirstParagraph', () => {
    it('extracts first paragraph', () => {
      const body = `# Title\n\nFirst paragraph.\n\nSecond paragraph.`;
      expect(FrontmatterParser.extractFirstParagraph(body)).toBe('First paragraph.');
    });

    it('skips images', () => {
      const body = `![img](url)\n\nReal text here.`;
      expect(FrontmatterParser.extractFirstParagraph(body)).toBe('Real text here.');
    });

    it('skips HTML comments', () => {
      const body = `<!-- comment -->\n\nActual content.`;
      expect(FrontmatterParser.extractFirstParagraph(body)).toBe('Actual content.');
    });

    it('returns fallback for empty body', () => {
      expect(FrontmatterParser.extractFirstParagraph('')).toBe('(no description)');
    });
  });

  describe('parse with schema', () => {
    it('validates against schema', () => {
      const content = `---\nstatus: drafting\ncategory: character\n---\nBody`;
      const { BaseFrontmatterSchema } = require('../../types/FrontmatterSchema');
      const result = FrontmatterParser.parse(content, BaseFrontmatterSchema);
      expect(result.frontmatter.status).toBe('drafting');
    });

    it('throws validation error on mismatch', () => {
      const content = `---\nstatus: 123\n---\nBody`;
      const { BaseFrontmatterSchema } = require('../../types/FrontmatterSchema');
      expect(() => FrontmatterParser.parse(content, BaseFrontmatterSchema)).toThrow(ValidationError);
    });
  });
});
