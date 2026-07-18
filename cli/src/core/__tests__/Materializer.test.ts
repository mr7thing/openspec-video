import fs from 'fs';
import os from 'os';
import path from 'path';
import { materializeWorkflowDocument } from '../Materializer';
import { ResolvedDocumentContract } from '../PackContracts';

describe('materializeWorkflowDocument', () => {
  let root: string;
  const contract = {
    profileName: 'shotlist',
    profile: { kind: 'workflow', materialize: {
      clips: { directory: 'videospec/clips', category: 'clip' },
      shots: { directory: 'videospec/shots', category: 'shot' },
    } },
  } as ResolvedDocumentContract;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-materialize-'));
    fs.mkdirSync(path.join(root, 'videospec'), { recursive: true });
    fs.writeFileSync(path.join(root, 'videospec', 'plan.md'), '---\ncategory: shotlist\nplan:\n  - shot: arrival\n    clips: [door-open, pause]\n---\n');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('creates missing Clip and Shot documents without overwriting existing work', () => {
    const workflow = path.join(root, 'videospec', 'plan.md');
    fs.mkdirSync(path.join(root, 'videospec', 'clips'), { recursive: true });
    fs.writeFileSync(path.join(root, 'videospec', 'clips', 'pause.md'), 'manual content');
    const result = materializeWorkflowDocument(root, workflow, contract);
    expect(result.created).toHaveLength(2);
    expect(result.existing).toContain(path.join(root, 'videospec', 'clips', 'pause.md'));
    expect(fs.readFileSync(path.join(root, 'videospec', 'clips', 'pause.md'), 'utf8')).toBe('manual content');
    expect(fs.readFileSync(path.join(root, 'videospec', 'shots', 'arrival.md'), 'utf8')).toContain('category: shot');
  });

  it('rejects a plan that reuses one stable ID for both a Clip and a Shot', () => {
    const workflow = path.join(root, 'videospec', 'plan.md');
    fs.writeFileSync(workflow, '---\ncategory: shotlist\nplan:\n  - shot: arrival\n    clips: [arrival]\n---\n');
    expect(() => materializeWorkflowDocument(root, workflow, contract)).toThrow('globally unique');
  });
});
