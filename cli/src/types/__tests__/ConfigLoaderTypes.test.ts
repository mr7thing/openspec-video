import { ProjectSettings } from '../../utils/configLoader';

describe('ConfigLoader Types', () => {
  describe('ProjectSettings', () => {
    it('accepts settings with dirs and polling', () => {
      const settings: ProjectSettings = {
        dirs: {
          videospec: 'videospec',
          queue: 'opsv-queue',
        },
        polling: {
          intervals: [{ thresholdMinutes: 5, intervalSeconds: 30 }],
        },
      };
      expect(settings.dirs?.videospec).toBe('videospec');
      expect(settings.polling?.intervals).toHaveLength(1);
    });

    it('accepts settings with only dirs', () => {
      const settings: ProjectSettings = {
        dirs: {
          videospec: 'custom-videospec',
        },
      };
      expect(settings.dirs?.videospec).toBe('custom-videospec');
    });

    it('accepts empty settings', () => {
      const settings: ProjectSettings = {};
      expect(settings.dirs).toBeUndefined();
      expect(settings.polling).toBeUndefined();
    });
  });
});
