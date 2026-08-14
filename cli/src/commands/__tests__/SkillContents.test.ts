import fs from 'fs';
import path from 'path';

const SKILL_PATH = path.resolve(__dirname, '../../../../opsv-cli-skill/SKILL.md');
// Video/image-generation providers whose prompt/tool guidance must NOT live in
// the operator skill (they belong to external capability skills). 'comfy' is
// intentionally excluded — ComfyUI is a legitimate generic example of an
// external capability, not generation guidance.
const PROVIDER_NAMES = ['seedance', 'veo', 'kling', 'volcengine', 'siliconflow', 'minimax'];

describe('OPSV Operator Skill (P4) — thin operator contract', () => {
  const skill = fs.readFileSync(SKILL_PATH, 'utf8');

  it('is a thin operator skill (under ~150 lines)', () => {
    expect(skill.split('\n').length).toBeLessThan(150);
  });

  it('teaches the Commit Boundary', () => {
    expect(skill).toContain('## Commit Boundary');
    expect(skill).toContain('opsv commit <artifact>');
    expect(skill).toContain('opsv import <path>');
    expect(skill).toContain('Only committed artifacts are OPSV assets');
  });

  it('teaches capability discovery', () => {
    expect(skill).toContain('## Capabilities');
    expect(skill).toContain('opsv capabilities');
    expect(skill).toContain('video.generate');
  });

  it('teaches review as state mutation', () => {
    expect(skill).toContain('## Review');
    expect(skill).toContain('review → rejected');
    expect(skill).toContain('rejected → candidate');
    expect(skill).toContain('approved → superseded');
  });

  it('contains no provider-specific generation guidance', () => {
    const lower = skill.toLowerCase();
    for (const name of PROVIDER_NAMES) {
      expect(lower).not.toContain(name);
    }
  });
});
