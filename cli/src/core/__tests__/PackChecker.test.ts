import fs from 'fs';
import os from 'os';
import path from 'path';
import { checkPack, PACK_ISSUE_CODES } from '../PackChecker';

function writePack(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

const VALID_PACK: Record<string, string> = {
  'pack.yaml': [
    'id: demo',
    'version: 1.0.0',
    'policy:',
    '  draft: auto',
    '  sync: human',
    '  delete: never',
    'categories:',
    '  shot: categories/shot.yaml',
    'profiles:',
    '  i2v: profiles/i2v.yaml',
    'skills:',
    '  create-shot: skills/create-shot/skill.yaml',
    '',
  ].join('\n'),
  'categories/shot.yaml': 'default_profile: i2v\nprofiles: [i2v]\n',
  'profiles/i2v.yaml': 'kind: production\ncapability: continuous-i2v\nskill: create-shot\noutputs: [video]\n',
  'skills/create-shot/skill.yaml': 'action: compile\ncategory: shot\nprofile: i2v\ngates: [work-check]\ncompletion: task-compiled\n',
};

describe('PackChecker', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-pack-check-')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('passes a minimal valid pack with zero errors', () => {
    writePack(root, VALID_PACK);
    const report = checkPack(root);
    expect(report.issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.pack).toMatchObject({ id: 'demo', version: '1.0.0' });
  });

  it('locks the stable issue code list', () => {
    expect([...PACK_ISSUE_CODES].sort()).toEqual([
      'PACK_CAPABILITY_CONCRETE_MODEL',
      'PACK_DEFAULT_PROFILE_INVALID',
      'PACK_EXPORT_MISSING',
      'PACK_EXPORT_OUTSIDE_ROOT',
      'PACK_ORPHAN_FILE',
      'PACK_POLICY_INVALID',
      'PACK_PROFILE_INPUT_INVALID',
      'PACK_PROFILE_NOT_ALLOWED',
      'PACK_PROFILE_SKILL_MISSING',
      'PACK_SCHEMA_INVALID',
      'PACK_SKILL_CATEGORY_MISSING',
      'PACK_SKILL_PROFILE_MISSING',
      'PACK_STAGE_INVALID',
    ]);
  });

  it('rejects input slots referencing non-exported categories', () => {
    writePack(root, {
      ...VALID_PACK,
      'profiles/i2v.yaml': 'kind: production\ncapability: continuous-i2v\nskill: create-shot\noutputs: [video]\ninputs:\n  - { slot: scene, category: nowhere, ref_type: image, required: true }\n',
    });
    const report = checkPack(root);
    const issue = report.issues.find(i => i.code === 'PACK_PROFILE_INPUT_INVALID');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
    expect(issue?.path).toBe('profiles/i2v.yaml');
    expect(report.ok).toBe(false);
  });

  it('accepts valid ordered input slots', () => {
    writePack(root, {
      ...VALID_PACK,
      'profiles/i2v.yaml': 'kind: production\ncapability: continuous-i2v\nskill: create-shot\noutputs: [video]\ninputs:\n  - { slot: scene, category: shot, ref_type: image, required: true }\n  - { slot: role1, category: shot, ref_type: image, required: true }\n',
    });
    const report = checkPack(root);
    expect(report.issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('rejects duplicate input slot names as schema-invalid', () => {
    writePack(root, {
      ...VALID_PACK,
      'profiles/i2v.yaml': 'kind: production\ncapability: continuous-i2v\nskill: create-shot\noutputs: [video]\ninputs:\n  - { slot: a, category: shot }\n  - { slot: a, category: shot }\n',
    });
    const report = checkPack(root);
    expect(report.issues.some(i => i.code === 'PACK_SCHEMA_INVALID' && i.path === 'profiles/i2v.yaml')).toBe(true);
  });

  it('fails closed when a Profile references a non-exported Skill', () => {
    writePack(root, { ...VALID_PACK, 'profiles/i2v.yaml': 'kind: production\ncapability: continuous-i2v\nskill: ghost-skill\noutputs: [video]\n' });
    const report = checkPack(root);
    const issue = report.issues.find(i => i.code === 'PACK_PROFILE_SKILL_MISSING');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
    expect(issue?.path).toBe('profiles/i2v.yaml');
    expect(issue?.context).toMatchObject({ skill: 'ghost-skill' });
    expect(report.ok).toBe(false);
  });

  it('fails when a Skill references a missing Profile or Category', () => {
    writePack(root, { ...VALID_PACK, 'skills/create-shot/skill.yaml': 'action: compile\ncategory: nowhere\nprofile: ghost-profile\ngates: [work-check]\n' });
    const report = checkPack(root);
    expect(report.issues.some(i => i.code === 'PACK_SKILL_PROFILE_MISSING')).toBe(true);
    expect(report.issues.some(i => i.code === 'PACK_SKILL_CATEGORY_MISSING')).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('fails when the Skill profile is not in the Category allow-list', () => {
    writePack(root, { ...VALID_PACK, 'categories/shot.yaml': 'default_profile: i2v\nprofiles: [other]\n' });
    const report = checkPack(root);
    expect(report.issues.some(i => i.code === 'PACK_PROFILE_NOT_ALLOWED')).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('fails when a Category default profile is not exported or not allowed', () => {
    writePack(root, { ...VALID_PACK, 'categories/shot.yaml': 'default_profile: ghost\nprofiles: [i2v]\n' });
    const report = checkPack(root);
    expect(report.issues.some(i => i.code === 'PACK_DEFAULT_PROFILE_INVALID')).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('fails when an exported file does not exist', () => {
    const files = { ...VALID_PACK };
    delete files['profiles/i2v.yaml'];
    writePack(root, files);
    const report = checkPack(root);
    const issue = report.issues.find(i => i.code === 'PACK_EXPORT_MISSING');
    expect(issue).toBeDefined();
    expect(issue?.path).toBe('profiles/i2v.yaml');
    expect(report.ok).toBe(false);
  });

  it('rejects export paths escaping the pack root', () => {
    writePack(root, {
      ...VALID_PACK,
      'pack.yaml': VALID_PACK['pack.yaml'].replace('profiles/i2v.yaml', '../outside.yaml'),
    });
    const report = checkPack(root);
    expect(report.issues.some(i => i.code === 'PACK_EXPORT_OUTSIDE_ROOT')).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('reports schema-invalid manifests with a stable code', () => {
    writePack(root, { ...VALID_PACK, 'profiles/i2v.yaml': 'kind: nonsense\n' });
    const report = checkPack(root);
    expect(report.issues.some(i => i.code === 'PACK_SCHEMA_INVALID' && i.path === 'profiles/i2v.yaml')).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('reports invalid policy values and non-never delete', () => {
    writePack(root, {
      ...VALID_PACK,
      'pack.yaml': VALID_PACK['pack.yaml'].replace('  sync: human', '  sync: whenever'),
    });
    const report = checkPack(root);
    expect(report.issues.some(i => i.code === 'PACK_POLICY_INVALID')).toBe(true);

    writePack(root, {
      ...VALID_PACK,
      'pack.yaml': VALID_PACK['pack.yaml'].replace('  delete: never', '  delete: ask'),
    });
    const report2 = checkPack(root);
    expect(report2.issues.some(i => i.code === 'PACK_POLICY_INVALID')).toBe(true);
  });

  it('flags capabilities that look like concrete provider/model keys', () => {
    writePack(root, { ...VALID_PACK, 'profiles/i2v.yaml': 'kind: production\ncapability: rh-workflow-v2.i2v\nskill: create-shot\noutputs: [video]\n' });
    const report = checkPack(root);
    expect(report.issues.some(i => i.code === 'PACK_CAPABILITY_CONCRETE_MODEL')).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('warns about orphan contract files without failing the pack', () => {
    writePack(root, { ...VALID_PACK, 'profiles/wip-draft.yaml': 'kind: workflow\n' });
    const report = checkPack(root);
    const orphan = report.issues.find(i => i.code === 'PACK_ORPHAN_FILE');
    expect(orphan).toBeDefined();
    expect(orphan?.severity).toBe('warning');
    expect(orphan?.path).toBe('profiles/wip-draft.yaml');
    expect(report.ok).toBe(true);
  });

  it('reports workflow profiles declaring production-only fields', () => {
    writePack(root, { ...VALID_PACK, 'profiles/i2v.yaml': 'kind: workflow\noutputs: [video]\nskill: create-shot\n' });
    const report = checkPack(root);
    expect(report.issues.some(i => i.code === 'PACK_SCHEMA_INVALID' && i.path === 'profiles/i2v.yaml')).toBe(true);
  });

  it('reports production profiles missing outputs', () => {
    writePack(root, { ...VALID_PACK, 'profiles/i2v.yaml': 'kind: production\ncapability: continuous-i2v\nskill: create-shot\n' });
    const report = checkPack(root);
    expect(report.issues.some(i => i.code === 'PACK_SCHEMA_INVALID' && i.path === 'profiles/i2v.yaml')).toBe(true);
  });

  it('emits issues in deterministic order (path, then code)', () => {
    writePack(root, {
      ...VALID_PACK,
      'profiles/i2v.yaml': 'kind: production\ncapability: continuous-i2v\nskill: ghost\noutputs: [video]\n',
      'skills/create-shot/skill.yaml': 'action: compile\ncategory: nowhere\nprofile: ghost\ngates: []\n',
    });
    const report = checkPack(root);
    const keys = report.issues.map(i => `${i.path}${i.code}`);
    expect(keys).toEqual([...keys].sort());
  });

  // C2 — Stage contract (graph.yaml) evolution.
  it('accepts a legacy dependency-array graph (backward compatible)', () => {
    writePack(root, { ...VALID_PACK, 'graph.yaml': 'workflow:\n  script: [shot]\n  shot: []\n' });
    const report = checkPack(root);
    expect(report.issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('passes a pack with full Stage fields declared', () => {
    writePack(root, {
      ...VALID_PACK,
      'references/shot-quality.md': '# Shot Quality\n',
      'graph.yaml': [
        'workflow:',
        '  shot:',
        '    depends_on: [script]',
        '    inputs: [script_doc]',
        '    outputs:',
        '      contract: shot-ref-v1',
        '    completion: [output_exists, output_contract_valid, document_status_approved]',
        '    quality_guidance: references/shot-quality.md',
        '    roles:',
        '      document-author: required',
        '      contract-checker: required',
        '      production-dispatcher: optional',
        '      asset-quality-reviewer: not_applicable',
        '    recommended_capabilities: [shot_renderer]',
        '  script: []',
        '',
      ].join('\n'),
    });
    const report = checkPack(root);
    expect(report.issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('reports PACK_STAGE_INVALID for an illegal roles value', () => {
    writePack(root, {
      ...VALID_PACK,
      'graph.yaml': 'workflow:\n  shot:\n    roles:\n      document-author: mandatory\n',
    });
    const report = checkPack(root);
    const issue = report.issues.find(i => i.code === 'PACK_STAGE_INVALID');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
    expect(issue?.path).toBe('graph.yaml');
    expect(report.ok).toBe(false);
  });

  it('reports PACK_STAGE_INVALID for an unknown role key or completion rule', () => {
    writePack(root, {
      ...VALID_PACK,
      'graph.yaml': 'workflow:\n  shot:\n    completion: [looks_good]\n    roles:\n      director: required\n',
    });
    const report = checkPack(root);
    expect(report.issues.some(i => i.code === 'PACK_STAGE_INVALID' && i.severity === 'error')).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('flags quality_guidance escaping the pack root and warns on missing docs', () => {
    writePack(root, {
      ...VALID_PACK,
      'graph.yaml': 'workflow:\n  shot:\n    quality_guidance: ../outside.md\n  script:\n    quality_guidance: references/missing.md\n',
    });
    const report = checkPack(root);
    const stageIssues = report.issues.filter(i => i.code === 'PACK_STAGE_INVALID');
    expect(stageIssues.some(i => i.severity === 'error' && /outside the pack root/.test(i.message))).toBe(true);
    expect(stageIssues.some(i => i.severity === 'warning' && /missing file/.test(i.message))).toBe(true);
    expect(report.ok).toBe(false);
  });
});
