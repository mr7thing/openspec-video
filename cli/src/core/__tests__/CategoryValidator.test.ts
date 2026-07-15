// ============================================================================
// CategoryValidator Tests (v0.11.0)
// ============================================================================

import { validateCategory, validateRefsBidirectional } from '../CategoryValidator';
import { CategoryRule } from '../../utils/categoryValidateLoader';

// ------------------------------------------------------------------
// Test fixtures
// ------------------------------------------------------------------

/** Minimal valid frontmatter with all optional check-passing values. */
function validFrontmatter(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    category: 'shot',
    prompt: 'A hero walks through a misty forest, cinematic composition',
    brief: 'A hero in a forest scene',
    ...overrides,
  };
}

describe('CategoryValidator — generic rules', () => {
  // ------------------------------------------------------------------
  // required_fields
  // ------------------------------------------------------------------
  describe('required_fields', () => {
    it('reports missing required fields', () => {
      const rule: CategoryRule = { required_fields: ['status', 'prompt'] };
      const issues = validateCategory({ category: 'shot', status: 'drafting' }, '', rule);
      expect(issues.some(i => i.field === 'prompt')).toBe(true);
    });

    it('passes when all required fields present', () => {
      const rule: CategoryRule = { required_fields: ['status', 'prompt'] };
      const issues = validateCategory(
        { category: 'shot', status: 'drafting', prompt: 'a scene with enough detail' },
        '',
        rule,
      );
      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // type
  // ------------------------------------------------------------------
  describe('field_schema.type', () => {
    it('errors when field is not the expected type', () => {
      const rule: CategoryRule = {
        field_schema: {
          camera_count: { type: 'integer' },
        },
      };
      const issues = validateCategory(
        { category: 'perf', camera_count: 'five' } as any,
        '',
        rule,
      );
      const err = issues.find(i => i.field === 'camera_count');
      expect(err).toBeDefined();
      expect(err!.message).toContain('type');
    });

    it('passes when field matches expected type', () => {
      const rule: CategoryRule = {
        field_schema: {
          camera_count: { type: 'integer' },
        },
      };
      const issues = validateCategory(
        validFrontmatter({ category: 'perf', camera_count: 6 }) as any,
        '',
        rule,
      );
      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toEqual([]);
    });

    it('supports type: array', () => {
      const rule: CategoryRule = {
        field_schema: {
          segments: { type: 'array' },
        },
      };
      const ok = validateCategory(
        validFrontmatter({ category: 'cs', segments: ['a', 'b'] }),
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(ok).toEqual([]);

      const fail = validateCategory(
        validFrontmatter({ category: 'cs', segments: 'not-an-array' }) as any,
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(fail.length).toBeGreaterThan(0);
    });

    it('supports type: object', () => {
      const rule: CategoryRule = {
        field_schema: {
          refs: { type: 'object' },
        },
      };
      const ok = validateCategory(
        validFrontmatter({ category: 's', refs: { image: {} } }) as any,
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(ok).toEqual([]);
    });

    it('supports type: number', () => {
      const rule: CategoryRule = {
        field_schema: {
          bpm: { type: 'number' },
        },
      };
      const ok = validateCategory(
        validFrontmatter({ category: 'm', bpm: 120.5 }) as any,
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(ok).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // min / max (numeric)
  // ------------------------------------------------------------------
  describe('field_schema.min / max', () => {
    it('errors when numeric value < min', () => {
      const rule: CategoryRule = {
        field_schema: {
          camera_count: { type: 'integer', min: 5 },
        },
      };
      const issues = validateCategory(
        { category: 'perf', camera_count: 3 } as any,
        '',
        rule,
      );
      expect(issues.some(i => i.field === 'camera_count' && i.message.includes('< min'))).toBe(true);
    });

    it('errors when numeric value > max', () => {
      const rule: CategoryRule = {
        field_schema: {
          camera_count: { type: 'integer', max: 8 },
        },
      };
      const issues = validateCategory(
        { category: 'perf', camera_count: 12 } as any,
        '',
        rule,
      );
      expect(issues.some(i => i.field === 'camera_count' && i.message.includes('> max'))).toBe(true);
    });

    it('passes when numeric value is within range', () => {
      const rule: CategoryRule = {
        field_schema: {
          camera_count: { type: 'integer', min: 5, max: 8 },
        },
      };
      const errors = validateCategory(
        validFrontmatter({ category: 'perf', camera_count: 6 }) as any,
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(errors).toEqual([]);
    });

    it('applies to number type (not just integer)', () => {
      const rule: CategoryRule = {
        field_schema: {
          bpm: { type: 'number', min: 60, max: 200 },
        },
      };
      const errors = validateCategory(
        validFrontmatter({ category: 'm', bpm: 120 }) as any,
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(errors).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // min_items / max_items (array)
  // ------------------------------------------------------------------
  describe('field_schema.min_items / max_items', () => {
    it('errors when array has fewer than min_items', () => {
      const rule: CategoryRule = {
        field_schema: {
          appears_in: { type: 'array', min_items: 2 },
        },
      };
      const issues = validateCategory(
        validFrontmatter({ category: 'char', appears_in: ['scene1'] }),
        '',
        rule,
      );
      expect(issues.some(i => i.field === 'appears_in' && i.message.includes('min_items'))).toBe(true);
    });

    it('errors when array has more than max_items', () => {
      const rule: CategoryRule = {
        field_schema: {
          segments: { type: 'array', max_items: 3 },
        },
      };
      const issues = validateCategory(
        { category: 'cs', segments: ['a', 'b', 'c', 'd'] } as any,
        '',
        rule,
      );
      expect(issues.some(i => i.field === 'segments' && i.message.includes('max_items'))).toBe(true);
    });

    it('passes when array size is within range', () => {
      const rule: CategoryRule = {
        field_schema: {
          segments: { type: 'array', min_items: 2, max_items: 5 },
        },
      };
      const errors = validateCategory(
        validFrontmatter({ category: 'cs', segments: ['a', 'b', 'c'] }),
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(errors).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // enum
  // ------------------------------------------------------------------
  describe('field_schema.enum', () => {
    it('errors when value is not in enum list', () => {
      const rule: CategoryRule = {
        field_schema: {
          role: { enum: ['narrative', 'singer'] },
        },
      };
      const issues = validateCategory(
        { category: 'char', role: 'director' } as any,
        '',
        rule,
      );
      expect(issues.some(i => i.field === 'role' && i.message.includes('not one of'))).toBe(true);
    });

    it('passes when value is in enum list', () => {
      const rule: CategoryRule = {
        field_schema: {
          role: { enum: ['narrative', 'singer'] },
        },
      };
      const errors = validateCategory(
        validFrontmatter({ category: 'char', role: 'singer' }) as any,
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(errors).toEqual([]);
    });

    it('works with numeric enum values', () => {
      const rule: CategoryRule = {
        field_schema: {
          status_code: { enum: [200, 404, 500] },
        },
      };
      const ok = validateCategory(
        validFrontmatter({ category: 't', status_code: 200 }) as any,
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(ok).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // must_include (array)
  // ------------------------------------------------------------------
  describe('field_schema.must_include', () => {
    it('errors when required item is missing from array', () => {
      const rule: CategoryRule = {
        field_schema: {
          refs: { must_include: ['music', 'concept'] },
        },
      };
      const issues = validateCategory(
        validFrontmatter({ refs: ['music'] }),
        '',
        rule,
      );
      expect(issues.some(i => i.field === 'refs' && i.message.includes('must include'))).toBe(true);
    });

    it('passes when all required items are present', () => {
      const rule: CategoryRule = {
        field_schema: {
          refs: { must_include: ['music', 'concept'] },
        },
      };
      const errors = validateCategory(
        validFrontmatter({ refs: ['concept', 'music'] }),
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(errors).toEqual([]);
    });

    it('works with string fields', () => {
      const rule: CategoryRule = {
        field_schema: {
          tags: { must_include: ['hero', 'action'] },
        },
      };
      const issues = validateCategory(
        validFrontmatter({ category: 's', tags: ['hero'] }),
        '',
        rule,
      );
      expect(issues.some(i => i.field === 'tags')).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // min_length / max_length (string)
  // ------------------------------------------------------------------
  describe('field_schema.min_length / max_length', () => {
    it('errors on too-short string', () => {
      const rule: CategoryRule = {
        field_schema: {
          prompt: { min_length: 30 },
        },
      };
      const issues = validateCategory(
        { category: 'char', prompt: 'short', brief: 'a scene' },
        '',
        rule,
      );
      expect(issues.some(i => i.field === 'prompt' && i.message.includes('min_length'))).toBe(true);
    });

    it('errors on too-long string', () => {
      const rule: CategoryRule = {
        field_schema: {
          prompt: { max_length: 10 },
        },
      };
      const issues = validateCategory(
        { category: 'char', prompt: 'this is a very long prompt exceeding the max', brief: 'a scene' },
        '',
        rule,
      );
      expect(issues.some(i => i.field === 'prompt' && i.message.includes('max_length'))).toBe(true);
    });

    it('passes when string length is within range', () => {
      const rule: CategoryRule = {
        field_schema: {
          prompt: { min_length: 5, max_length: 20 },
        },
      };
      const errors = validateCategory(
        { category: 'char', prompt: 'medium length', brief: 'a scene' },
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(errors).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // no_placeholder
  // ------------------------------------------------------------------
  describe('field_schema.no_placeholder', () => {
    it('detects TODO/FIXME/XXX/TBD placeholders', () => {
      const rule: CategoryRule = {
        field_schema: {
          prompt: { no_placeholder: true },
        },
      };
      const issues = validateCategory(
        { category: 'char', prompt: 'scene TODO: add more detail', brief: 'a scene' },
        '',
        rule,
      );
      expect(issues.some(i => i.field === 'prompt' && i.message.includes('placeholder'))).toBe(true);
    });

    it('passes clean prompt', () => {
      const rule: CategoryRule = {
        field_schema: {
          prompt: { no_placeholder: true },
        },
      };
      const errors = validateCategory(
        { category: 'char', prompt: 'A beautiful sunset over the ocean', brief: 'a scene' },
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(errors).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // refs_in_prompt_must_match_refs (prompt field)
  // ------------------------------------------------------------------
  describe('field_schema.refs_in_prompt_must_match_refs (prompt)', () => {
    it('errors when @id in prompt missing from refs', () => {
      const rule: CategoryRule = {
        field_schema: {
          prompt: { refs_in_prompt_must_match_refs: true },
        },
      };
      const issues = validateCategory(
        { category: 'shot', prompt: '@hero enters the room', brief: 'a scene', refs: { image: {} } },
        '',
        rule,
      );
      expect(issues.some(i => i.field === 'refs' && i.message.includes('@hero') && i.message.includes('missing from refs'))).toBe(true);
    });

    it('errors when refs key not used in prompt', () => {
      const rule: CategoryRule = {
        field_schema: {
          prompt: { refs_in_prompt_must_match_refs: true },
        },
      };
      const issues = validateCategory(
        { category: 'shot', prompt: 'plain prompt', brief: 'a scene', refs: { image: { '@hero': ['/p/hero.png'] } } },
        '',
        rule,
      );
      expect(issues.some(i => i.field === 'refs' && i.message.includes('@hero') && i.message.includes('not used'))).toBe(true);
    });

    it('passes when prompt and refs align', () => {
      const rule: CategoryRule = {
        field_schema: {
          prompt: { refs_in_prompt_must_match_refs: true },
        },
      };
      const issues = validateCategory(
        { category: 'shot', prompt: '@hero in @:angle_side', brief: 'a scene', refs: { image: { '@hero': ['/p/hero.png'], '@:angle_side': ['/p/side.png'] } } },
        '',
        rule,
      );
      expect(issues).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // severity override
  // ------------------------------------------------------------------
  describe('severity override', () => {
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

    it('respects category-level severity', () => {
      const rule: CategoryRule = {
        severity: 'warning',
        required_fields: ['status'],
      };
      const issues = validateCategory({ category: 'proj' }, '', rule);
      const errs = issues.filter(i => i.severity === 'error');
      expect(errs).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // skip_prompt_check
  // ------------------------------------------------------------------
  describe('skip_prompt_check', () => {
    it('bypasses prompt checks when skip_prompt_check is true', () => {
      const rule: CategoryRule = {
        skip_prompt_check: true,
        field_schema: {
          prompt: { min_length: 100 },
        },
      };
      const errors = validateCategory(
        { category: 'proj', prompt: 'short', brief: 'a scene' },
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(errors).toEqual([]);
    });

    it('bypasses field_schema prompt checks too', () => {
      const rule: CategoryRule = {
        skip_prompt_check: true,
        field_schema: {
          prompt: { no_placeholder: true },
        },
      };
      const issues = validateCategory(
        validFrontmatter({ category: 'proj', prompt: 'TODO: fix this' }),
        '',
        rule,
      );
      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // Combined: MV-style realistic config
  // ------------------------------------------------------------------
  describe('MV-style combined rules', () => {
    it('validates camera_count with type + min + max', () => {
      const rule: CategoryRule = {
        field_schema: {
          camera_count: { type: 'integer', min: 5, max: 8 },
        },
      };
      const tooLow = validateCategory(
        { category: 'perf', prompt: 'a hero singing', camera_count: 2 } as any,
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(tooLow.some(i => i.field === 'camera_count')).toBe(true);

      const tooHigh = validateCategory(
        { category: 'perf', prompt: 'a hero singing', camera_count: 15 } as any,
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(tooHigh.some(i => i.field === 'camera_count')).toBe(true);

      const ok = validateCategory(
        validFrontmatter({ category: 'perf', camera_count: 6 }) as any,
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(ok).toEqual([]);
    });

    it('validates role with enum', () => {
      const rule: CategoryRule = {
        field_schema: {
          role: { enum: ['narrative', 'singer'] },
        },
      };
      const invalid = validateCategory(
        { category: 'char', prompt: 'a dramatic scene', role: 'antagonist' } as any,
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(invalid.some(i => i.field === 'role')).toBe(true);

      const ok = validateCategory(
        { category: 'char', prompt: 'a dramatic scene', role: 'singer' } as any,
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(ok).toEqual([]);
    });

    it('validates appears_in with type: array + min_items', () => {
      const rule: CategoryRule = {
        field_schema: {
          appears_in: { type: 'array', min_items: 1 },
        },
      };
      const empty = validateCategory(
        { category: 'char', prompt: 'a dramatic scene', appears_in: [] } as any,
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(empty.some(i => i.field === 'appears_in')).toBe(true);

      const ok = validateCategory(
        { category: 'char', prompt: 'a dramatic scene', appears_in: ['scene1'] } as any,
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(ok).toEqual([]);
    });

    it('validates prompt with type + min_length + max_length + no_placeholder', () => {
      const rule: CategoryRule = {
        field_schema: {
          prompt: { type: 'string', min_length: 30, max_length: 2000, no_placeholder: true },
        },
      };
      const short = validateCategory(
        { category: 'char', prompt: 'short', brief: 'a scene' },
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(short.length).toBeGreaterThan(0);

      const placeholder = validateCategory(
        { category: 'char', prompt: 'A scene TODO: add details here and there', brief: 'a scene' },
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(placeholder.length).toBeGreaterThan(0);

      const ok = validateCategory(
        validFrontmatter({ category: 'char', prompt: 'A hero stands in a misty forest, dramatic lighting, cinematic composition' }),
        '',
        rule,
      ).filter(i => i.severity === 'error');
      expect(ok).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // refs_in_prompt_must_match_refs on refs field itself
  // ------------------------------------------------------------------
  describe('refs field with refs_in_prompt_must_match_refs', () => {
    it('validates bidirectional refs when declared on refs field', () => {
      const rule: CategoryRule = {
        field_schema: {
          refs: { refs_in_prompt_must_match_refs: true },
        },
      };
      const issues = validateCategory(
        {
          category: 'shot',
          prompt: '@hero walks in',
          refs: { image: {} },
        },
        '',
        rule,
      );
      expect(issues.some(i => i.field === 'refs' && i.message.includes('missing from refs'))).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // Unknown rule keys → handled by loader (not validator)
  // ------------------------------------------------------------------
  describe('unknown rule keys in config', () => {
    it('validator ignores unknown keys (loader flags them)', () => {
      // The loader reports unknown keys as warnings at load time.
      // The validator only processes known keys.
      const rule = {
        field_schema: {
          prompt: {
            min_length: 10,
            // unknown_key is not a known FieldCheck key
            custom_rule: 'ignored',
          },
        },
      } as CategoryRule;

      // Should not throw, should just process known keys
      const errors = validateCategory(
        { category: 's', prompt: 'very long prompt for sure', brief: 'a scene' },
        '',
        rule,
      ).filter(i => i.severity === 'error');
      // custom_rule is ignored — no error about it
      expect(errors).toEqual([]);
    });
  });
});
