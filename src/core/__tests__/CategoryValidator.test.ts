import { validateCategory, validateRefsBidirectional } from '../CategoryValidator';
import { CategoryRule } from '../../utils/categoryValidateLoader';

describe('CategoryValidator', () => {
  describe('required_fields', () => {
    const rule: CategoryRule = { required_fields: ['status', 'prompt'] };

    it('reports missing required fields', () => {
      const issues = validateCategory({ category: 'shot', status: 'drafting' }, '', rule);
      expect(issues.some(i => i.field === 'prompt')).toBe(true);
      expect(issues.every(i => i.severity === 'error')).toBe(true);
    });

    it('passes when all required present', () => {
      const issues = validateCategory(
        { category: 'shot', status: 'drafting', prompt: 'a scene' },
        '',
        rule,
      );
      expect(issues).toEqual([]);
    });
  });

  describe('field_schema.min_length', () => {
    const rule: CategoryRule = {
      field_schema: {
        prompt: { min_length: 10 },
      },
    };

    it('reports too-short prompt', () => {
      const issues = validateCategory({ category: 'shot', prompt: 'short' }, '', rule);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('min_length');
    });

    it('passes when length meets minimum', () => {
      const issues = validateCategory({ category: 'shot', prompt: 'a long enough prompt' }, '', rule);
      expect(issues).toEqual([]);
    });
  });

  describe('field_schema.no_placeholder', () => {
    const rule: CategoryRule = {
      field_schema: {
        prompt: { no_placeholder: true },
      },
    };

    it('detects TODO/FIXME placeholders', () => {
      const issues = validateCategory({ category: 'shot', prompt: 'a scene TODO: refine' }, '', rule);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('placeholder');
    });

    it('passes clean prompt', () => {
      const issues = validateCategory({ category: 'shot', prompt: 'a clean prompt' }, '', rule);
      expect(issues).toEqual([]);
    });
  });

  describe('skip_prompt_check', () => {
    const rule: CategoryRule = {
      skip_prompt_check: true,
      field_schema: {
        prompt: { min_length: 100 },
      },
    };

    it('bypasses prompt checks when skip_prompt_check is true', () => {
      const issues = validateCategory({ category: 'project', prompt: 'short' }, '', rule);
      expect(issues).toEqual([]);
    });
  });

  describe('refs_in_prompt_must_match_refs (bidirectional)', () => {
    it('errors when prompt @id missing from refs', () => {
      const issues = validateRefsBidirectional(
        {
          category: 'shot',
          prompt: '@hero in scene',
          refs: { image: {} },
        },
        '',
        'error',
      );
      expect(issues.some(i => i.message.includes('@hero') && i.message.includes('missing from refs'))).toBe(true);
    });

    it('errors when refs key not used in prompt', () => {
      const issues = validateRefsBidirectional(
        {
          category: 'shot',
          prompt: 'plain prompt',
          refs: { image: { '@hero': ['/p/hero.png'] } },
        },
        '',
        'error',
      );
      expect(issues.some(i => i.message.includes('@hero') && i.message.includes('not used'))).toBe(true);
    });

    it('passes when prompt and refs align', () => {
      const issues = validateRefsBidirectional(
        {
          category: 'shot',
          prompt: '@hero in @:angle_side',
          refs: { image: { '@hero': ['/p/hero.png'], '@:angle_side': ['/p/side.png'] } },
        },
        '',
        'error',
      );
      expect(issues).toEqual([]);
    });
  });

  describe('severity', () => {
    it('respects field-level severity override', () => {
      const rule: CategoryRule = {
        severity: 'error',
        field_schema: {
          prompt: { min_length: 100, severity: 'warning' },
        },
      };
      const issues = validateCategory({ category: 'shot', prompt: 'short' }, '', rule);
      expect(issues[0].severity).toBe('warning');
    });
  });
});
