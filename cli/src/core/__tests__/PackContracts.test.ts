import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadGraphStages, resolveDocumentContract, ResolvedStage } from '../PackContracts';
import { checkPack } from '../PackChecker';
import { STAGE_ROLES } from '../../types/PackSchemas';

describe('Pack contracts', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-pack-contract-'));
    const pack = path.join(root, '.opsv', 'packs', 'drama');
    fs.mkdirSync(path.join(pack, 'categories'), { recursive: true });
    fs.mkdirSync(path.join(pack, 'profiles'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs:\n  - id: drama\nbindings:\n  continuous-i2v: rh.director\n');
    fs.writeFileSync(path.join(pack, 'pack.yaml'), 'id: drama\nversion: 1\ncategories:\n  shot: categories/shot.yaml\nprofiles:\n  i2v: profiles/i2v.yaml\n');
    fs.writeFileSync(path.join(pack, 'categories', 'shot.yaml'), 'default_profile: i2v\nprofiles: [i2v]\n');
    fs.writeFileSync(path.join(pack, 'profiles', 'i2v.yaml'), 'kind: production\ncapability: continuous-i2v\nskill: create-shot\noutputs: [video]\n');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  it('resolves a category default profile and project capability binding', () => {
    const resolved = resolveDocumentContract(root, 'shot');
    expect(resolved.profileName).toBe('i2v');
    expect(resolved.boundModel).toBe('rh.director');
  });

  it('resolves a Project-derived Profile through its declared Pack Profile', () => {
    fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs:\n  - id: drama\nbindings:\n  preferred-i2v: rh.preferred\nprofiles:\n  hero-i2v:\n    extends: i2v\n    capability: preferred-i2v\n    defaults:\n      duration: 5\n');
    const resolved = resolveDocumentContract(root, 'shot', 'hero-i2v');
    expect(resolved).toMatchObject({ profileName: 'hero-i2v', boundModel: 'rh.preferred', defaults: { duration: 5 } });
  });

  it('rejects export paths escaping the pack root at runtime (F11)', () => {
    const pack = path.join(root, '.opsv', 'packs', 'drama');
    fs.writeFileSync(path.join(pack, 'pack.yaml'), 'id: drama\nversion: 1\ncategories:\n  shot: categories/shot.yaml\nprofiles:\n  i2v: ../outside.yaml\n');
    expect(() => resolveDocumentContract(root, 'shot')).toThrow('PACK_EXPORT_OUTSIDE_ROOT');
  });

  // C2 — Stage contract consumption.
  it('exposes the Stage contract (inputs/completion/roles) for the Category node', () => {
    const pack = path.join(root, '.opsv', 'packs', 'drama');
    fs.writeFileSync(path.join(pack, 'graph.yaml'), [
      'workflow:',
      '  shot:',
      '    depends_on: [script]',
      '    inputs: [script_doc]',
      '    outputs:',
      '      contract: shot-ref-v1',
      '    completion: [output_exists, document_status_approved]',
      '    roles:',
      '      document-author: required',
      '      asset-quality-reviewer: not_applicable',
      '    recommended_capabilities: [shot_renderer]',
      '  script: []',
      '',
    ].join('\n'));
    const resolved = resolveDocumentContract(root, 'shot');
    expect(resolved.stage).toMatchObject({
      name: 'shot',
      dependsOn: ['script'],
      inputs: ['script_doc'],
      outputs: { contract: 'shot-ref-v1' },
      completion: ['output_exists', 'document_status_approved'],
      roles: { 'document-author': 'required', 'asset-quality-reviewer': 'not_applicable' },
      recommended_capabilities: ['shot_renderer'],
    });
  });

  it('normalizes the legacy dependency-array node form', () => {
    const pack = path.join(root, '.opsv', 'packs', 'drama');
    fs.writeFileSync(path.join(pack, 'graph.yaml'), 'workflow:\n  script: [shot]\n  shot: []\n');
    const resolved = resolveDocumentContract(root, 'shot');
    expect(resolved.stage).toEqual({ name: 'shot', dependsOn: [] });
  });

  it('omits the Stage view when the Pack has no graph or no node for the Category', () => {
    expect(resolveDocumentContract(root, 'shot').stage).toBeUndefined();
    const pack = path.join(root, '.opsv', 'packs', 'drama');
    fs.writeFileSync(path.join(pack, 'graph.yaml'), 'workflow:\n  script: []\n');
    expect(resolveDocumentContract(root, 'shot').stage).toBeUndefined();
  });

  it('stays lenient when graph.yaml is undecodable (pack check owns the error)', () => {
    const pack = path.join(root, '.opsv', 'packs', 'drama');
    fs.writeFileSync(path.join(pack, 'graph.yaml'), 'workflow:\n  shot:\n    roles: 42\n');
    expect(resolveDocumentContract(root, 'shot').stage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// D1 — the four migrated Packs declare the Stage Contract (inputs /
// outputs.contract / completion / roles) in graph.yaml and pass pack check
// with zero errors. Main-repo packs are always present; the
// opsv-multi-ref-pipeline fixture uses the sibling opsv-packs checkout when
// it exists (same skip convention as Bootstrap.test.ts).
// ---------------------------------------------------------------------------

const MAIN_PACKS = path.resolve(__dirname, '../../../../packs');
const MULTI_REF_PACK = path.resolve(__dirname, '../../../../../opsv-packs/opsv-multi-ref-pipeline');
const describeMultiRef = fs.existsSync(path.join(MULTI_REF_PACK, 'pack.yaml')) ? describe : describe.skip;
// packs/mv-3d-previs and packs/mv-3d-ref are git-ignored "local 3D packs"
// (.gitignore): present on maintainer machines, absent on fresh clones — same
// presence-gated convention as the sibling opsv-packs checkout.
const describeLocal3d = fs.existsSync(path.join(MAIN_PACKS, 'mv-3d-ref', 'pack.yaml')) ? describe : describe.skip;

/** Every declared Stage must carry the full D1 contract surface. */
function expectFullStageContract(stage: ResolvedStage): void {
  expect(stage.inputs?.length).toBeGreaterThan(0);
  expect(stage.outputs?.contract).toEqual(expect.any(String));
  expect(stage.completion?.length).toBeGreaterThan(0);
  for (const role of STAGE_ROLES) {
    expect(['required', 'optional', 'not_applicable']).toContain(stage.roles?.[role]);
  }
}

function projectWithPack(packId: string, packRoot: string, bindings: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-d1-pack-'));
  fs.mkdirSync(path.join(root, '.opsv'), { recursive: true });
  const bindingLines = Object.entries(bindings).map(([capability, model]) => `  ${capability}: ${model}`).join('\n');
  fs.writeFileSync(
    path.join(root, '.opsv', 'project.yaml'),
    `packs:\n  - id: ${packId}\n    source: "${packRoot.split(path.sep).join('/')}"\nbindings:\n${bindingLines}\n`,
  );
  return root;
}

describe('D1 migrated Packs (main repo)', () => {
  it('short-drama passes pack check with zero errors', () => {
    const report = checkPack(path.join(MAIN_PACKS, 'short-drama'));
    expect(report.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('short-drama declares Stages for all four Categories with production roles', () => {
    const packRoot = path.join(MAIN_PACKS, 'short-drama');
    const stages = loadGraphStages(packRoot);
    expect([...stages.keys()]).toEqual(['shotlist', 'clip', 'shot', 'shotsdeck']);
    for (const stage of stages.values()) expectFullStageContract(stage);
    expect(stages.get('shotlist')?.roles?.['production-dispatcher']).toBe('not_applicable');
    expect(stages.get('shotsdeck')?.dependsOn).toEqual(['shot']);

    const root = projectWithPack('short-drama', packRoot, {
      'image-generation': 'image.model',
      'video-generation': 'video.model',
      'continuous-i2v': 'i2v.model',
    });
    try {
      const shot = resolveDocumentContract(root, 'shot');
      expect(shot.stage).toMatchObject({
        name: 'shot',
        dependsOn: ['shotlist'],
        outputs: { contract: 'shot-doc-v1' },
        completion: ['output_exists', 'output_contract_valid'],
        roles: { 'production-dispatcher': 'required' },
        recommended_capabilities: ['video-generation'],
      });
      const shotlist = resolveDocumentContract(root, 'shotlist');
      expect(shotlist.stage?.completion).toContain('document_status_approved');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describeLocal3d('D1 migrated Packs (git-ignored local 3D packs)', () => {
  it.each(['mv-3d-previs', 'mv-3d-ref'])('%s passes pack check with zero errors', (name) => {
    const report = checkPack(path.join(MAIN_PACKS, name));
    expect(report.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('mv-3d-previs declares the clay-previs Stage with document-author not_applicable', () => {
    const stages = loadGraphStages(path.join(MAIN_PACKS, 'mv-3d-previs'));
    const stage = stages.get('clay-previs');
    expect(stage).toBeDefined();
    expectFullStageContract(stage!);
    expect(stage).toMatchObject({
      dependsOn: [],
      outputs: { contract: 'clay-previs-bundle-v1' },
      roles: { 'document-author': 'not_applicable' },
    });
  });

  it('mv-3d-ref declares the three-stage chain and resolves the render Stage contract', () => {
    const packRoot = path.join(MAIN_PACKS, 'mv-3d-ref');
    const stages = loadGraphStages(packRoot);
    expect([...stages.keys()]).toEqual(['style-references', 'clay-keyframes', 'render']);
    for (const stage of stages.values()) expectFullStageContract(stage);
    expect(stages.get('clay-keyframes')?.dependsOn).toEqual(['style-references']);
    expect(stages.get('render')?.dependsOn).toEqual(['clay-keyframes']);

    const root = projectWithPack('mv-3d-ref', packRoot, { 'image-to-video': 'i2v.model' });
    try {
      const resolved = resolveDocumentContract(root, 'render');
      expect(resolved.profileName).toBe('render-to-real');
      expect(resolved.stage).toMatchObject({
        name: 'render',
        outputs: { contract: 'render-to-real-v1' },
        completion: ['output_exists', 'output_contract_valid', 'document_status_approved'],
        roles: { 'production-dispatcher': 'required', 'asset-quality-reviewer': 'required' },
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describeMultiRef('D1 migrated Pack: opsv-multi-ref-pipeline (sibling opsv-packs checkout)', () => {
  it('passes pack check with zero errors', () => {
    const report = checkPack(MULTI_REF_PACK);
    expect(report.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('declares the full Stage Contract for every workflow node, edges unchanged', () => {
    const stages = loadGraphStages(MULTI_REF_PACK);
    expect([...stages.keys()]).toEqual([
      'project', 'script', 'shotlist', 'character', 'prop', 'scene', 'storyboard', 'clip', 'shot',
    ]);
    for (const stage of stages.values()) expectFullStageContract(stage);
    // Legacy dependency semantics preserved verbatim (dependsOn normalization).
    expect(stages.get('project')?.dependsOn).toEqual(['script']);
    expect(stages.get('script')?.dependsOn).toEqual(['shotlist']);
    expect(stages.get('shotlist')?.dependsOn).toEqual(['character', 'prop', 'scene', 'storyboard']);
    expect(stages.get('storyboard')?.dependsOn).toEqual(['clip']);
    expect(stages.get('clip')?.dependsOn).toEqual(['shot']);
    expect(stages.get('shot')?.dependsOn).toEqual([]);
  });

  it('surfaces the Stage view (completion/roles) through resolveDocumentContract', () => {
    const root = projectWithPack('opsv-multi-ref', MULTI_REF_PACK, {
      'image-generation': 'image.model',
      'video-generation': 'video.model',
    });
    try {
      const shot = resolveDocumentContract(root, 'shot');
      expect(shot.stage).toMatchObject({
        name: 'shot',
        dependsOn: [],
        outputs: { contract: 'shotclip-doc-v1' },
        completion: ['output_exists', 'output_contract_valid'],
        roles: {
          'document-author': 'required',
          'contract-checker': 'required',
          'production-dispatcher': 'required',
          'asset-quality-reviewer': 'required',
        },
        recommended_capabilities: ['video-generation'],
      });
      // Dependency-only nodes in the legacy graph are now declared Stages.
      const character = resolveDocumentContract(root, 'character');
      expect(character.stage).toMatchObject({
        name: 'character',
        outputs: { contract: 'character-doc-v1' },
        roles: { 'production-dispatcher': 'required' },
      });
      // Workflow-document stages exclude the dispatcher role and require approval.
      const shotlist = resolveDocumentContract(root, 'shotlist');
      expect(shotlist.stage?.roles?.['production-dispatcher']).toBe('not_applicable');
      expect(shotlist.stage?.completion).toContain('document_status_approved');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
