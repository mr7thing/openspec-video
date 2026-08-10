import fs from 'fs';
import os from 'os';
import path from 'path';
import { checkConformance, ConformanceReport } from '../Conformance';
import { writeBootstrap } from '../Bootstrap';

// Fixture: one Pack with a two-stage object-form workflow graph. `script`
// takes a `brief` document (exported Category), `shot` takes the upstream
// `script` stage; both declare outputs.contract, completion, and roles.
const PACK_FILES: Record<string, string> = {
  'pack.yaml': [
    'id: pipe',
    'version: 1',
    'categories:',
    '  brief: categories/brief.yaml',
    '  script: categories/script.yaml',
    '  shot: categories/shot.yaml',
    'profiles:',
    '  draft-script: profiles/draft-script.yaml',
    '  i2v: profiles/i2v.yaml',
    'skills:',
    '  draft-script: skills/draft-script/skill.yaml',
    '  create-shot: skills/create-shot/skill.yaml',
    '',
  ].join('\n'),
  'graph.yaml': [
    'workflow:',
    '  script:',
    '    depends_on: []',
    '    inputs: [brief]',
    '    outputs:',
    '      contract: script-doc',
    '    completion: [document_status_approved]',
    '    roles:',
    '      document-author: required',
    '      contract-checker: required',
    '      production-dispatcher: not_applicable',
    '      asset-quality-reviewer: optional',
    '  shot:',
    '    depends_on: [script]',
    '    inputs: [script]',
    '    outputs:',
    '      contract: shot-video',
    '    completion: [output_exists, output_contract_valid]',
    '    recommended_capabilities: [continuous-i2v]',
    '    roles:',
    '      document-author: optional',
    '      contract-checker: required',
    '      production-dispatcher: required',
    '      asset-quality-reviewer: required',
    '',
  ].join('\n'),
  'categories/brief.yaml': 'profiles: []\n',
  'categories/script.yaml': 'default_profile: draft-script\nprofiles: [draft-script]\n',
  'categories/shot.yaml': 'default_profile: i2v\nprofiles: [i2v]\n',
  'profiles/draft-script.yaml': 'kind: workflow\nskill: draft-script\n',
  'profiles/i2v.yaml': 'kind: production\ncapability: continuous-i2v\nskill: create-shot\noutputs: [video]\n',
  'skills/draft-script/skill.yaml': 'action: draft\ncategory: script\nprofile: draft-script\ncompletion: doc-approved\n',
  'skills/create-shot/skill.yaml': 'action: compile\ncategory: shot\nprofile: i2v\ngates: [work-check, refs-valid]\n',
};

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

/** 1-based line of the first fixture line exactly matching `needle` (trimmed). */
function lineOf(content: string, needle: string): number {
  const index = content.split('\n').findIndex(line => line.trim() === needle);
  if (index < 0) throw new Error(`fixture line not found: ${needle}`);
  return index + 1;
}

function check(report: ConformanceReport, id: string) {
  const found = report.checks.find(c => c.id === id);
  if (!found) throw new Error(`check not found: ${id}`);
  return found;
}

describe('Conformance', () => {
  let root: string;
  let packRoot: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-conformance-'));
    packRoot = path.join(root, 'pack');
    writeFiles(packRoot, PACK_FILES);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('passes all six checks for a fully declared Pack', () => {
    const report = checkConformance(packRoot);
    expect(report.pack.id).toBe('pipe');
    expect(report.checks.map(c => c.id)).toEqual([
      'stage-inputs',
      'stage-output-contracts',
      'role-context',
      'review-iterate-sync',
      'recommended-not-whitelist',
      'constraint-layering',
    ]);
    for (const result of report.checks) {
      expect(result.status).toBe('pass');
      expect(result.findings).toEqual([]);
    }
    expect(report.ok).toBe(true);
  });

  it('passes role-context when the project bootstrap materialized Role templates', () => {
    // Project with the Pack resolved through .opsv/packs + a fresh bootstrap.
    const projectRoot = path.join(root, 'project');
    writeFiles(path.join(projectRoot, '.opsv', 'packs', 'pipe'), PACK_FILES);
    fs.writeFileSync(
      path.join(projectRoot, '.opsv', 'project.yaml'),
      'packs:\n  - id: pipe\nbindings:\n  continuous-i2v: test.model\n',
    );
    writeBootstrap(projectRoot);

    const report = checkConformance(path.join(projectRoot, '.opsv', 'packs', 'pipe'), { projectRoot });
    expect(check(report, 'role-context').status).toBe('pass');
    expect(report.ok).toBe(true);
  });

  it('warns (not fails) role-context when the project has no bootstrap manifest', () => {
    const projectRoot = path.join(root, 'project');
    fs.mkdirSync(projectRoot, { recursive: true });
    const report = checkConformance(packRoot, { projectRoot });
    const roleContext = check(report, 'role-context');
    expect(roleContext.status).toBe('warn');
    expect(roleContext.findings.some(f => f.file === '.opsv/bootstrap/manifest.json')).toBe(true);
    expect(report.ok).toBe(true); // warnings never block
  });

  it('fails stage-output-contracts with the stage line when outputs.contract is missing', () => {
    // Remove only the shot stage's outputs block (its two lines follow `shot:`).
    const lines = PACK_FILES['graph.yaml'].split('\n');
    const shotIndex = lines.findIndex(line => line.trim() === 'shot:');
    const graph = lines.filter((_, index) => index !== shotIndex + 3 && index !== shotIndex + 4).join('\n');
    fs.writeFileSync(path.join(packRoot, 'graph.yaml'), graph);

    const report = checkConformance(packRoot);
    const result = check(report, 'stage-output-contracts');
    expect(result.status).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].file).toBe('graph.yaml');
    expect(result.findings[0].line).toBe(lineOf(graph, 'shot:'));
    expect(result.findings[0].message).toContain('Stage "shot"');
    expect(report.ok).toBe(false);
  });

  it('warns (not fails) stage-inputs with the input item line when an input is unresolvable', () => {
    // Analysis §5.1 sanctions descriptive input names and user-provided
    // inputs, so an unresolvable name is a located warning, never a fail.
    const graph = PACK_FILES['graph.yaml'].replace('    inputs: [brief]', '    inputs:\n      - nonexistent');
    fs.writeFileSync(path.join(packRoot, 'graph.yaml'), graph);

    const report = checkConformance(packRoot);
    const result = check(report, 'stage-inputs');
    expect(result.status).toBe('warn');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].file).toBe('graph.yaml');
    expect(result.findings[0].line).toBe(lineOf(graph, '- nonexistent'));
    expect(result.findings[0].message).toContain('"nonexistent"');
    expect(result.findings[0].message).toContain('user-provided/external');
    expect(report.ok).toBe(true); // warnings never block
  });

  it('resolves descriptive input names to the normalized document vocabulary', () => {
    // `brief_doc` -> exported Category `brief`; `script` -> upstream Stage;
    // `shot_video` -> the shot Stage's outputs.contract stem (`shot-video`).
    const graph = PACK_FILES['graph.yaml'].replace('    inputs: [brief]', '    inputs: [brief_doc, shot_video]');
    fs.writeFileSync(path.join(packRoot, 'graph.yaml'), graph);

    const report = checkConformance(packRoot);
    const result = check(report, 'stage-inputs');
    expect(result.status).toBe('pass');
    expect(result.findings).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('fails recommended-not-whitelist when a recommended capability is used as a hard gate', () => {
    fs.writeFileSync(
      path.join(packRoot, 'skills', 'create-shot', 'skill.yaml'),
      'action: compile\ncategory: shot\nprofile: i2v\ngates: [work-check, continuous-i2v]\n',
    );

    const report = checkConformance(packRoot);
    const result = check(report, 'recommended-not-whitelist');
    expect(result.status).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].file).toBe('skills/create-shot/skill.yaml');
    expect(result.findings[0].line).toBe(4);
    expect(result.findings[0].message).toContain('continuous-i2v');
    expect(report.ok).toBe(false);
  });

  it('warns constraint-layering for stage fields that cannot be attributed to a layer', () => {
    const graph = PACK_FILES['graph.yaml'].replace('    inputs: [brief]', '    inputs: [brief]\n    owner: team-a');
    fs.writeFileSync(path.join(packRoot, 'graph.yaml'), graph);

    const report = checkConformance(packRoot);
    const result = check(report, 'constraint-layering');
    expect(result.status).toBe('warn');
    const finding = result.findings.find(f => f.message.includes('"owner"'));
    expect(finding).toBeDefined();
    expect(finding!.file).toBe('graph.yaml');
    expect(finding!.line).toBe(lineOf(graph, 'owner: team-a'));
    expect(report.ok).toBe(true);
  });

  it('fails checks 2 and 3 with stage lines for legacy array-form stages', () => {
    fs.writeFileSync(path.join(packRoot, 'graph.yaml'), 'workflow:\n  script: []\n  shot: [script]\n');

    const report = checkConformance(packRoot);
    const outputs = check(report, 'stage-output-contracts');
    expect(outputs.status).toBe('fail');
    expect(outputs.findings.map(f => f.line)).toEqual([2, 3]);
    expect(check(report, 'role-context').status).toBe('fail');
    expect(check(report, 'stage-inputs').status).toBe('warn'); // no inputs declared
    expect(report.ok).toBe(false);
  });

  it('fails review-iterate-sync when no review path exists', () => {
    const graph = PACK_FILES['graph.yaml'].replace('    completion: [document_status_approved]', '    completion: [output_exists]');
    fs.writeFileSync(path.join(packRoot, 'graph.yaml'), graph);

    const report = checkConformance(packRoot);
    const result = check(report, 'review-iterate-sync');
    expect(result.status).toBe('fail');
    expect(result.findings[0].message).toContain('No review path');
    expect(report.ok).toBe(false);
  });

  it('passes review-iterate-sync for a category-less Pack with a review-action Skill', () => {
    // Production-only Packs (mv-3d-previs shape): no document Categories;
    // the review path targets the produced artifact via the review Skill.
    writeFiles(packRoot, {
      'pack.yaml': 'id: previs\nversion: 1\nskills:\n  previs: skills/previs/skill.yaml\n',
      'graph.yaml': [
        'workflow:',
        '  previs:',
        '    inputs: [shot_plan]',
        '    outputs:',
        '      contract: previs-bundle-v1',
        '    completion: [output_exists]',
        '    roles:',
        '      production-dispatcher: required',
        '',
      ].join('\n'),
      'skills/previs/skill.yaml': 'action: review\ngates: [previs-plan-valid]\ncompletion: previs-approved\n',
    });

    const report = checkConformance(packRoot);
    const result = check(report, 'review-iterate-sync');
    expect(result.status).toBe('pass');
    expect(result.findings).toEqual([]);
  });

  it('warns (not fails) review-iterate-sync for a category-less Pack without any review path', () => {
    writeFiles(packRoot, {
      'pack.yaml': 'id: previs\nversion: 1\nskills:\n  previs: skills/previs/skill.yaml\n',
      'graph.yaml': [
        'workflow:',
        '  previs:',
        '    inputs: [shot_plan]',
        '    outputs:',
        '      contract: previs-bundle-v1',
        '    completion: [output_exists]',
        '    roles:',
        '      production-dispatcher: required',
        '',
      ].join('\n'),
      'skills/previs/skill.yaml': 'action: compile\ncategory: previs\nprofile: previs\ncompletion: previs-done\n',
    });

    const report = checkConformance(packRoot);
    const result = check(report, 'review-iterate-sync');
    expect(result.status).toBe('warn');
    expect(result.findings[0].file).toBe('pack.yaml');
    expect(result.findings[0].message).toContain('no Categories');
  });

  it('fails all six checks with a located pack.yaml finding when the manifest is missing', () => {
    const emptyRoot = path.join(root, 'empty');
    fs.mkdirSync(emptyRoot, { recursive: true });
    const report = checkConformance(emptyRoot);
    expect(report.ok).toBe(false);
    expect(report.checks).toHaveLength(6);
    for (const result of report.checks) {
      expect(result.status).toBe('fail');
      expect(result.findings[0].file).toBe('pack.yaml');
      expect(result.findings[0].line).toBe(1);
    }
  });
});
