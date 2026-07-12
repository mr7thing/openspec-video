import { validateCategory, validateRefsBidirectional } from '../CategoryValidator';
import { CategoryRule } from '../../utils/categoryValidateLoader';

describe('CategoryValidator', () => {
  describe('required_fields', () => {
    const rule: CategoryRule = { required_fields: ['status', 'prompt'] };

    it('reports missing required fields', () => {
      const issues = validateCategory({ category: 'shot', status: 'drafting' }, '', rule);
      expect(issues.some(i => i.field === 'prompt')).toBe(true);
      // All required-field issues should be errors (brief warning is separate)
      const requiredIssues = issues.filter(i => i.field !== 'brief');
      expect(requiredIssues.every(i => i.severity === 'error')).toBe(true);
    });

    it('passes when all required present (ignoring brief warning)', () => {
      const issues = validateCategory(
        { category: 'shot', status: 'drafting', prompt: 'a scene with enough detail' },
        '',
        rule,
      );
      // brief warning is expected — filter it out for this test
      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toEqual([]);
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
      const promptIssues = issues.filter(i => i.field === 'prompt');
      expect(promptIssues.length).toBeGreaterThanOrEqual(1);
      expect(promptIssues[0].message).toContain('min_length');
    });

    it('passes when length meets minimum', () => {
      const issues = validateCategory({ category: 'shot', prompt: 'a long enough prompt' }, '', rule);
      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toEqual([]);
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
      const promptIssues = issues.filter(i => i.field === 'prompt');
      expect(promptIssues.length).toBeGreaterThanOrEqual(1);
      expect(promptIssues[0].message).toContain('placeholder');
    });

    it('passes clean prompt', () => {
      const issues = validateCategory({ category: 'shot', prompt: 'a clean prompt' }, '', rule);
      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toEqual([]);
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
      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toEqual([]);
    });
  });

  describe('refs_in_prompt_must_match_refs (bidirectional, prompt-only)', () => {
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

    it('ignores @-tokens in visual_brief / visual_detailed / body (prompt-only)', () => {
      const issues = validateRefsBidirectional(
        {
          category: 'shot',
          prompt: '@hero alone',
          visual_brief: 'meanwhile @villain is plotting',
          visual_detailed: '@villain in @bar',
          refs: { image: { '@hero': ['/p/hero.png'] } },
        },
        '@brother elsewhere',
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
      const promptIssues = issues.filter(i => i.field === 'prompt');
      expect(promptIssues[0].severity).toBe('warning');
    });
  });
});
