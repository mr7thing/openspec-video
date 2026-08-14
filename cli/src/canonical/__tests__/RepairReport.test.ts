import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildRepairReport, suggestAction } from '../repair/RepairReport';
import { appendTransition } from '../state/TransitionStore';

describe('Repair Report — Generate→Verify→Repair (Q5)', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-repair-'));
    fs.mkdirSync(path.join(root, 'videospec', 'shots'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function writeShot(id: string, category = 'shot'): void {
    fs.writeFileSync(path.join(root, 'videospec', 'shots', `${id}.md`), `---\nid: ${id}\ncategory: ${category}\nstatus: drafting\n---\n`);
  }

  describe('suggestAction', () => {
    it('maps each state to a deterministic repair action', () => {
      expect(suggestAction('draft')).toContain('opsv commit');
      expect(suggestAction('rejected')).toContain('re-commit');
      expect(suggestAction('review')).toContain('revise');
      expect(suggestAction('candidate')).toContain('compile');
      expect(suggestAction('approved')).toContain('supersede');
    });
  });

  it('reports a missing document without crashing', () => {
    const report = buildRepairReport(root, 'missing');
    expect(report.exists).toBe(false);
    expect(report.suggested).toContain('create the Asset Document');
  });

  it('reports a valid document with no transitions as draft + commit', () => {
    writeShot('shot1');
    const report = buildRepairReport(root, 'shot1');
    expect(report.exists).toBe(true);
    expect(report.canonicalOk).toBe(true);
    expect(report.state).toBe('draft');
    expect(report.suggested).toContain('opsv commit');
  });

  it('reports a rejected asset with the re-commit repair action', async () => {
    writeShot('shot1');
    await appendTransition(root, {
      asset: 'shot1',
      artifact: 'shot1:v1',
      from: 'draft',
      to: 'candidate',
      actor: { type: 'agent', id: 'test' },
      timestamp: new Date().toISOString(),
    });
    await appendTransition(root, {
      asset: 'shot1',
      artifact: 'shot1:v1',
      from: 'candidate',
      to: 'review',
      actor: { type: 'agent', id: 'test' },
      timestamp: new Date().toISOString(),
    });
    await appendTransition(root, {
      asset: 'shot1',
      artifact: 'shot1:v1',
      from: 'review',
      to: 'rejected',
      actor: { type: 'human', id: 'reviewer' },
      timestamp: new Date().toISOString(),
    });
    const report = buildRepairReport(root, 'shot1');
    expect(report.state).toBe('rejected');
    expect(report.transitions).toBe(3);
    expect(report.suggested).toContain('re-commit');
  });

  it('flags a broken frontmatter as canonicalOk=false', () => {
    fs.writeFileSync(path.join(root, 'videospec', 'shots', 'broken.md'), 'no frontmatter here\n');
    const report = buildRepairReport(root, 'broken');
    expect(report.exists).toBe(true);
    expect(report.canonicalOk).toBe(false);
    expect(report.canonicalError).toBeTruthy();
  });
});
