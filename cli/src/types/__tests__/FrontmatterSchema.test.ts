import { ShotDesignFrontmatterSchema, ShotProductionFrontmatterSchema } from '../FrontmatterSchema';

describe('FrontmatterSchema', () => {
  describe('ShotDesignFrontmatterSchema', () => {
    it('passes when prompt is missing (prompt is optional)', () => {
      const doc = {
        category: 'shot-design',
        status: 'drafting',
        visual_brief: 'A cinematic establishing shot',
      };
      const result = ShotDesignFrontmatterSchema.safeParse(doc);
      expect(result.success).toBe(true);
    });

    it('passes when prompt is present', () => {
      const doc = {
        category: 'shot-design',
        status: 'approved',
        prompt: 'A wide shot of ancient architecture',
      };
      const result = ShotDesignFrontmatterSchema.safeParse(doc);
      expect(result.success).toBe(true);
    });

    it('passes when visual_brief is present', () => {
      const doc = {
        category: 'shot-design',
        status: 'drafting',
        visual_brief: 'Dawn light on weathered stone walls',
      };
      const result = ShotDesignFrontmatterSchema.safeParse(doc);
      expect(result.success).toBe(true);
    });

    it('fails when category is missing', () => {
      const doc = {
        status: 'drafting',
        prompt: 'Test prompt',
      };
      const result = ShotDesignFrontmatterSchema.safeParse(doc);
      expect(result.success).toBe(false);
    });

    it('fails when status is missing', () => {
      const doc = {
        category: 'shot-design',
        prompt: 'Test prompt',
      };
      const result = ShotDesignFrontmatterSchema.safeParse(doc);
      expect(result.success).toBe(false);
    });
  });

  describe('ShotProductionFrontmatterSchema', () => {
    it('passes when prompt is missing', () => {
      const doc = {
        category: 'shot-production',
        status: 'drafting',
        first_frame: '0001.png',
        last_frame: '0120.png',
      };
      const result = ShotProductionFrontmatterSchema.safeParse(doc);
      expect(result.success).toBe(true);
    });
  });
});
