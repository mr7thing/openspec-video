import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildWorkPacket } from '../WorkPacket';
import { buildWorkContext, isWorkContextRole, REF_SYNTAX_FORMS, WORK_CONTEXT_ROLES } from '../WorkContext';
import { writeBootstrap } from '../Bootstrap';
import { WORK_PACKET_CONTRACT_VERSION } from '../NextAction';

// Fixture: one pack exporting a production category whose skill carries a
// SKILL.md guidance doc and a completion condition.
const PACK_FILES: Record<string, string> = {
  'pack.yaml': [
    'id: ctx',
    'version: 1',
    'policy:',
    '  execute: human',
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
  'skills/create-shot/skill.yaml': 'action: compile\ncategory: shot\nprofile: i2v\ngates: [work-check, refs-valid]\ncompletion: task-compiled\n',
  'skills/create-shot/SKILL.md': '# Create Shot\n',
  'SKILL.md': '# Pack Guidance\n',
};

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

describe('Work Context Manifest', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-work-context-'));
    writeFiles(path.join(root, '.opsv', 'packs', 'ctx'), PACK_FILES);
    fs.mkdirSync(path.join(root, 'videospec', 'shots'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs:\n  - id: ctx\nbindings:\n  continuous-i2v: test.model\n');
    fs.writeFileSync(path.join(root, 'videospec', 'shots', 'hero.md'), '---\nid: hero\ncategory: shot\nstatus: drafting\n---\n');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('fixes the stage-A role set', () => {
    expect(WORK_CONTEXT_ROLES).toEqual(['document-author', 'contract-checker', 'production-dispatcher', 'asset-quality-reviewer']);
    expect(isWorkContextRole('contract-checker')).toBe(true);
    expect(isWorkContextRole('dispatcher')).toBe(false);
  });

  it('mirrors the Work Packet fields exactly (single source of truth)', () => {
    const packet = buildWorkPacket(root, 'hero');
    const manifest = buildWorkContext(root, 'hero', 'contract-checker');
    expect(manifest.contractVersion).toBe(WORK_PACKET_CONTRACT_VERSION);
    expect(manifest.contractVersion).toBe(packet.contractVersion);
    expect(manifest.asset).toBe(packet.asset);
    expect(manifest.nextAction).toEqual(packet.nextAction);
    expect(manifest.refs).toEqual(packet.refs);
    expect(manifest.policy).toEqual(packet.policy);
    expect(manifest.issues).toEqual(packet.issues);
    expect(manifest.role).toBe('contract-checker');
  });

  it('attaches the resolved Document Contract and Pack guidance paths', () => {
    const manifest = buildWorkContext(root, 'hero', 'document-author');
    expect(manifest.documentContract).toMatchObject({
      category: 'shot',
      path: '.opsv/packs/ctx/categories/shot.yaml',
      contract: { default_profile: 'i2v', profiles: ['i2v'] },
      profile: { name: 'i2v', kind: 'production', capability: 'continuous-i2v', model: 'test.model' },
    });
    expect(manifest.documentContract?.profile?.contract).toMatchObject({ outputs: ['video'] });
    expect(manifest.guidanceRefs).toEqual([
      '.opsv/packs/ctx/skills/create-shot/SKILL.md',
      '.opsv/packs/ctx/SKILL.md',
    ]);
    expect(manifest.promptContract.refSyntax).toEqual([...REF_SYNTAX_FORMS]);
    expect(manifest.promptContract.completion).toBe('task-compiled');
  });

  it('keeps a blocked asset visible: manifest materializes with the packet issues', () => {
    fs.writeFileSync(path.join(root, 'videospec', 'shots', 'target.md'), '---\ncategory: shot\nstatus: drafting\nrefs:\n  image:\n    "@ghost": [x]\n---\n');
    const packet = buildWorkPacket(root, 'target');
    const manifest = buildWorkContext(root, 'target', 'production-dispatcher');
    expect(packet.issues.some(i => i.code === 'REF_MISSING')).toBe(true);
    expect(manifest.issues).toEqual(packet.issues);
    expect(manifest.nextAction).toEqual(packet.nextAction);
    expect(manifest.nextAction?.kind).toBe('blocked');
  });

  it('degrades documentContract when the capability binding is missing (issue already on packet)', () => {
    fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs:\n  - id: ctx\n');
    const manifest = buildWorkContext(root, 'hero', 'contract-checker');
    expect(manifest.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CAPABILITY_BINDING_MISSING' })]));
    expect(manifest.documentContract).toEqual({ category: 'shot' });
  });

  it('materializes without a documentContract when the category is missing', () => {
    fs.writeFileSync(path.join(root, 'videospec', 'shots', 'bare.md'), '---\nstatus: drafting\n---\n');
    const manifest = buildWorkContext(root, 'bare', 'asset-quality-reviewer');
    expect(manifest.issues).toEqual([{ code: 'CATEGORY_MISSING', message: 'Asset document has no category' }]);
    expect(manifest.documentContract).toBeUndefined();
  });

  it('rejects an unknown role with ROLE_UNKNOWN', () => {
    expect(() => buildWorkContext(root, 'hero', 'director')).toThrow(/^ROLE_UNKNOWN: "director"/);
  });

  it('works without .trellis/ (standalone)', () => {
    expect(fs.existsSync(path.join(root, '.trellis'))).toBe(false);
    const manifest = buildWorkContext(root, 'hero', 'contract-checker');
    expect(manifest.documentContract?.category).toBe('shot');
  });

  // C2 — Stage view (graph.yaml) in the manifest: pure increment.
  it('surfaces the Stage completion and roles when the Pack declares a graph node', () => {
    writeFiles(path.join(root, '.opsv', 'packs', 'ctx'), {
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
    const manifest = buildWorkContext(root, 'hero', 'contract-checker');
    expect(manifest.stage).toEqual({
      name: 'shot',
      dependsOn: ['script'],
      inputs: ['script_doc'],
      outputs: { contract: 'shot-ref-v1' },
      completion: ['output_exists', 'output_contract_valid', 'document_status_approved'],
      roles: {
        'document-author': 'required',
        'contract-checker': 'required',
        'production-dispatcher': 'optional',
        'asset-quality-reviewer': 'not_applicable',
      },
      recommendedCapabilities: ['shot_renderer'],
      qualityGuidance: ['.opsv/packs/ctx/references/shot-quality.md'],
    });
    // Existing A1 manifest fields stay intact (pure increment).
    expect(manifest.documentContract?.category).toBe('shot');
    expect(manifest.promptContract.completion).toBe('task-compiled');
  });

  it('omits the Stage view when the Pack declares no graph node for the category', () => {
    const manifest = buildWorkContext(root, 'hero', 'document-author');
    expect(manifest.stage).toBeUndefined();
  });

  // C3 — Role Context template consumption + ROLE_NOT_APPLICABLE.
  it('attaches the bootstrap-materialized role template when present', () => {
    const dir = path.join(root, '.opsv', 'bootstrap', 'roles');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'contract-checker.md'), '# Role Context: contract-checker\n');
    const manifest = buildWorkContext(root, 'hero', 'contract-checker');
    expect(manifest.roleTemplate).toEqual({
      path: '.opsv/bootstrap/roles/contract-checker.md',
      content: '# Role Context: contract-checker\n',
    });
  });

  it('omits roleTemplate when bootstrap has not materialized templates (pure increment)', () => {
    const manifest = buildWorkContext(root, 'hero', 'contract-checker');
    expect(manifest.roleTemplate).toBeUndefined();
    // Existing fields stay intact.
    expect(manifest.documentContract?.category).toBe('shot');
  });

  it('consumes the bootstrap-materialized template end to end (bootstrap -> work context)', () => {
    writeBootstrap(root);
    const manifest = buildWorkContext(root, 'hero', 'contract-checker');
    expect(manifest.roleTemplate?.path).toBe('.opsv/bootstrap/roles/contract-checker.md');
    expect(manifest.roleTemplate?.content).toContain('# Role Context: contract-checker');
    expect(manifest.roleTemplate?.content).toContain('.opsv/packs/ctx/categories/shot.yaml');
  });

  const STAGE_ROLES_GRAPH = [
    'workflow:',
    '  shot:',
    '    depends_on: []',
    '    roles:',
    '      document-author: required',
    '      contract-checker: required',
    '      production-dispatcher: optional',
    '      asset-quality-reviewer: not_applicable',
    '',
  ].join('\n');

  it('throws ROLE_NOT_APPLICABLE when the stage declares the role not_applicable', () => {
    fs.writeFileSync(path.join(root, '.opsv', 'packs', 'ctx', 'graph.yaml'), STAGE_ROLES_GRAPH);
    expect(() => buildWorkContext(root, 'hero', 'asset-quality-reviewer'))
      .toThrow(/^ROLE_NOT_APPLICABLE: role "asset-quality-reviewer" is declared not_applicable for stage "shot"/);
  });

  it('materializes normally for required/optional roles on the same stage', () => {
    fs.writeFileSync(path.join(root, '.opsv', 'packs', 'ctx', 'graph.yaml'), STAGE_ROLES_GRAPH);
    expect(buildWorkContext(root, 'hero', 'document-author').stage?.roles?.['document-author']).toBe('required');
    expect(buildWorkContext(root, 'hero', 'production-dispatcher').role).toBe('production-dispatcher');
  });

  it('emits absolute (never ../../-escaping) paths for Packs outside the project root', () => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-ext-pack-'));
    try {
      writeFiles(external, PACK_FILES);
      fs.writeFileSync(
        path.join(root, '.opsv', 'project.yaml'),
        `packs:\n  - id: ctx\n    source: "${external}"\nbindings:\n  continuous-i2v: test.model\n`,
      );
      const manifest = buildWorkContext(root, 'hero', 'contract-checker');
      const posixExternal = external.split(path.sep).join('/');
      expect(manifest.documentContract?.path).toBe(`${posixExternal}/categories/shot.yaml`);
      expect(manifest.guidanceRefs).toEqual([
        `${posixExternal}/skills/create-shot/SKILL.md`,
        `${posixExternal}/SKILL.md`,
      ]);
      for (const ref of manifest.guidanceRefs) expect(ref.startsWith('..')).toBe(false);
    } finally {
      fs.rmSync(external, { recursive: true, force: true });
    }
  });
});
