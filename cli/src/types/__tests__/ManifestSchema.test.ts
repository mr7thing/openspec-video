import { ManifestAssetEntrySchema } from '../ManifestSchema';

describe('ManifestSchema', () => {
  describe('ManifestAssetEntrySchema', () => {
    it('passes when category is present', () => {
      const entry = {
        status: 'approved',
        index: 2,
        category: 'shot-production',
      };
      const result = ManifestAssetEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
    });

    it('fails when category is missing', () => {
      const entry = {
        status: 'approved',
        index: 2,
      };
      const result = ManifestAssetEntrySchema.safeParse(entry);
      expect(result.success).toBe(false);
    });
  });
});
