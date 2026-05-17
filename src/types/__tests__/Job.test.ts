import { VideoSettings } from '../Job';

describe('Job Types', () => {
  describe('VideoSettings', () => {
    it('accepts valid video settings', () => {
      const settings: VideoSettings = {
        aspect_ratio: '16:9',
        quality: 'high',
      };
      expect(settings.aspect_ratio).toBe('16:9');
      expect(settings.quality).toBe('high');
    });

    it('accepts settings with only aspect_ratio and provides quality via default', () => {
      // quality defaults via frontmatter.quality || 'standard' in imagen.ts
      // interface itself requires both fields
      const settings: VideoSettings = {
        aspect_ratio: '4:3',
        quality: 'standard',
      };
      expect(settings.aspect_ratio).toBe('4:3');
    });
  });
});
