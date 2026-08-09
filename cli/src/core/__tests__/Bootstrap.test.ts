import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  BOOTSTRAP_MANIFEST_REL,
  BOOTSTRAP_ROLES_DIR_REL,
  buildBootstrapManifest,
  checkBootstrapStale,
  writeBootstrap,
} from '../Bootstrap';
import {
  BOOTSTRAP_CONTRACT_VERSION,
  BOOTSTRAP_ROLES,
  BootstrapManifestSchema,
} from '../../types/BootstrapManifest';
import { REF_SYNTAX_FORMS, WORK_CONTEXT_ROLES } from '../WorkContext';
import { resolvePacks, writePackLock } from '../ProjectConfig';

// Fixture: one pack with a two-stage workflow graph (list-form dependencies),
// a workflow profile, and a production profile with an input slot + gates.
const PACK_FILES: Record<string, string> = {
  'pack.yaml': [
    'id: pipe',
    'version: 1',
    'policy:',
    '  execute: human',
    'categories:',
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
  'graph.yaml': ['workflow:', '  script: []', '  shot: [script]', ''].join('\n'),
  'categories/script.yaml': 'default_profile: draft-script\nprofiles: [draft-script]\n',
  'categories/shot.yaml': 'default_profile: i2v\nprofiles: [i2v]\n',
  'profiles/draft-script.yaml': 'kind: workflow\nskill: draft-script\n',
  'profiles/i2v.yaml': [
    'kind: production',
    'capability: continuous-i2v',
    'skill: create-shot',
    'outputs: [video]',
    'inputs:',
    '  - slot: reference',
    '    category: script',
    '    ref_type: image',
    '',
  ].join('\n'),
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

describe('Bootstrap', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-bootstrap-'));
    writeFiles(path.join(root, '.opsv', 'packs', 'pipe'), PACK_FILES);
    fs.writeFileSync(
      path.join(root, '.opsv', 'project.yaml'),
      'packs:\n  - id: pipe\nbindings:\n  continuous-i2v: test.model\npolicy:\n  draft: ask\n',
    );
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  describe('manifest build', () => {
    it('derives the Workflow Graph from graph.yaml + profiles', () => {
      const manifest = buildBootstrapManifest(root);
      expect(manifest.contractVersion).toBe(BOOTSTRAP_CONTRACT_VERSION);
      expect(manifest.workflowGraph.map(node => node.id)).toEqual(['script', 'shot']);
      const [script, shot] = manifest.workflowGraph;
      expect(script).toMatchObject({ pack: 'pipe', dependsOn: [] });
      expect(shot).toMatchObject({
        pack: 'pipe',
        dependsOn: ['script'],
        category: { path: '.opsv/packs/pipe/categories/shot.yaml', defaultProfile: 'i2v', profiles: ['i2v'] },
        profile: { name: 'i2v', kind: 'production', capability: 'continuous-i2v', skill: 'create-shot', outputs: ['video'] },
        gates: ['work-check', 'refs-valid'],
      });
      expect(shot.profile?.inputs).toEqual([{ slot: 'reference', category: 'script', refType: 'image', required: true }]);
    });

    it('surfaces stage-object fields verbatim (forward-compatible with the C2 Stage Contract)', () => {
      fs.writeFileSync(path.join(root, '.opsv', 'packs', 'pipe', 'graph.yaml'), [
        'workflow:',
        '  script: []',
        '  shot:',
        '    depends_on: [script]',
        '    inputs: [script_doc]',
        '    outputs:',
        '      contract: shot-ref-v1',
        '    completion: [output_exists, document_status_approved]',
        '    quality_guidance: references/shot-quality.md',
        '    roles:',
        '      document-author: required',
        '      production-dispatcher: optional',
        '    recommended_capabilities: [shot_renderer]',
        '',
      ].join('\n'));
      const manifest = buildBootstrapManifest(root);
      const shot = manifest.workflowGraph.find(node => node.id === 'shot');
      expect(shot?.dependsOn).toEqual(['script']);
      expect(shot?.stage).toEqual({
        inputs: ['script_doc'],
        outputs: { contract: 'shot-ref-v1' },
        completion: ['output_exists', 'document_status_approved'],
        qualityGuidance: 'references/shot-quality.md',
        roles: { 'document-author': 'required', 'production-dispatcher': 'optional' },
        recommendedCapabilities: ['shot_renderer'],
      });
    });

    it('accepts the C2 list-form quality_guidance and passthrough outputs (never stricter than pack check)', () => {
      fs.writeFileSync(path.join(root, '.opsv', 'packs', 'pipe', 'graph.yaml'), [
        'workflow:',
        '  script: []',
        '  shot:',
        '    depends_on: [script]',
        '    outputs:',
        '      contract: shot-ref-v1',
        '    quality_guidance:',
        '      - references/shot-quality.md',
        '      - references/shot-style.md',
        '',
      ].join('\n'));
      const manifest = buildBootstrapManifest(root);
      expect(manifest.diagnostics.filter(d => d.code === 'BOOTSTRAP_GRAPH_INVALID')).toEqual([]);
      const shot = manifest.workflowGraph.find(node => node.id === 'shot');
      expect(shot?.stage?.qualityGuidance).toEqual(['references/shot-quality.md', 'references/shot-style.md']);
      expect(shot?.stage?.outputs).toEqual({ contract: 'shot-ref-v1' });
    });

    it('carries Document/Prompt Contract references and Input/Output definitions', () => {
      const manifest = buildBootstrapManifest(root);
      expect(manifest.documentContracts).toEqual([
        { category: 'script', pack: 'pipe', path: '.opsv/packs/pipe/categories/script.yaml', defaultProfile: 'draft-script', profiles: ['draft-script'] },
        { category: 'shot', pack: 'pipe', path: '.opsv/packs/pipe/categories/shot.yaml', defaultProfile: 'i2v', profiles: ['i2v'] },
      ]);
      expect(manifest.promptContract.refSyntax).toEqual([...REF_SYNTAX_FORMS]);
      expect(manifest.io.inputs).toEqual([
        { pack: 'pipe', profile: 'i2v', slot: 'reference', category: 'script', refType: 'image', required: true },
      ]);
      expect(manifest.io.outputs).toEqual([{ pack: 'pipe', profile: 'i2v', outputs: ['video'] }]);
    });

    it('records Gate/Policy, recommended capabilities, and pack lock info', () => {
      const manifest = buildBootstrapManifest(root);
      const policy = manifest.policy.packs.find(entry => entry.pack === 'pipe');
      expect(policy?.effective).toMatchObject({ execute: 'human', draft: 'ask', delete: 'never' });
      expect(manifest.policy.project).toEqual({ draft: 'ask' });
      expect(manifest.gates).toEqual([
        { pack: 'pipe', skill: 'draft-script', action: 'draft', gates: [] },
        { pack: 'pipe', skill: 'create-shot', action: 'compile', gates: ['work-check', 'refs-valid'] },
      ]);
      expect(manifest.recommendedCapabilities).toEqual([
        { capability: 'continuous-i2v', pack: 'pipe', profiles: ['i2v'], binding: 'test.model' },
      ]);
      expect(manifest.packs).toHaveLength(1);
      expect(manifest.packs[0]).toMatchObject({ id: 'pipe', version: '1', locked: false, graphDigest: expect.any(String) });
      // No lock file yet: the diagnostic stays visible instead of failing.
      expect(manifest.diagnostics).toEqual([expect.objectContaining({ code: 'PACK_LOCK_MISSING' })]);
    });

    it('marks packs locked when pack-lock.yaml v2 matches the live digests', () => {
      writePackLock(root, resolvePacks(root));
      const manifest = buildBootstrapManifest(root);
      expect(manifest.packs[0].locked).toBe(true);
      expect(manifest.diagnostics).toEqual([]);
    });

    it('surfaces the legacy-lock diagnostic for v1 pack locks', () => {
      fs.writeFileSync(path.join(root, '.opsv', 'pack-lock.yaml'), 'version: 1\npacks:\n  - id: pipe\n    version: 1\n    source: .opsv/packs/pipe\n    digest: abc\n');
      const manifest = buildBootstrapManifest(root);
      expect(manifest.diagnostics).toEqual([expect.objectContaining({ code: 'PACK_LOCK_LEGACY' })]);
      expect(manifest.packs[0].locked).toBe(false);
    });

    it('leaves Role Context template reference slots for all four standard roles', () => {
      expect(BOOTSTRAP_ROLES).toEqual(WORK_CONTEXT_ROLES);
      const manifest = buildBootstrapManifest(root);
      expect(manifest.roles).toEqual([
        { role: 'document-author', template: '.opsv/bootstrap/roles/document-author.md', status: 'pending' },
        { role: 'contract-checker', template: '.opsv/bootstrap/roles/contract-checker.md', status: 'pending' },
        { role: 'production-dispatcher', template: '.opsv/bootstrap/roles/production-dispatcher.md', status: 'pending' },
        { role: 'asset-quality-reviewer', template: '.opsv/bootstrap/roles/asset-quality-reviewer.md', status: 'pending' },
      ]);
    });

    it('works without .trellis/ (standalone)', () => {
      expect(fs.existsSync(path.join(root, '.trellis'))).toBe(false);
      const manifest = buildBootstrapManifest(root);
      expect(manifest.workflowGraph).toHaveLength(2);
    });
  });

  describe('writeBootstrap', () => {
    it('writes a schema-valid manifest.json and the roles reference directory', () => {
      const { manifestPath, manifest } = writeBootstrap(root);
      expect(manifestPath).toBe(path.join(root, BOOTSTRAP_MANIFEST_REL));
      expect(fs.existsSync(path.join(root, BOOTSTRAP_ROLES_DIR_REL))).toBe(true);
      const onDisk = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const parsed = BootstrapManifestSchema.safeParse(onDisk);
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data).toEqual(manifest);
    });

    it('produces a stable contentDigest across rebuilds of unchanged inputs', () => {
      const first = buildBootstrapManifest(root);
      const second = buildBootstrapManifest(root);
      expect(first.contentDigest).toBe(second.contentDigest);
      expect(first.contentDigest).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // C3 — Role Context template materialization (analysis §10.2): the four
  // templates reference Pack files by path, never copy Pack content.
  describe('role templates (C3)', () => {
    const readTemplate = (role: string): string =>
      fs.readFileSync(path.join(root, BOOTSTRAP_ROLES_DIR_REL, `${role}.md`), 'utf8');

    it('materializes all four templates and flips the manifest slots to materialized', () => {
      const { manifest, manifestPath } = writeBootstrap(root);
      expect(manifest.roles).toEqual(BOOTSTRAP_ROLES.map(role => ({
        role,
        template: `.opsv/bootstrap/roles/${role}.md`,
        status: 'materialized',
      })));
      for (const entry of manifest.roles) {
        expect(fs.existsSync(path.join(root, entry.template))).toBe(true);
      }
      // The on-disk manifest records the same materialized statuses.
      expect(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).roles).toEqual(manifest.roles);
    });

    it('document-author references the document contracts, prompt syntax, and guidance docs', () => {
      fs.writeFileSync(path.join(root, '.opsv', 'packs', 'pipe', 'SKILL.md'), '# Pipe Guidance\n');
      writeBootstrap(root);
      const body = readTemplate('document-author');
      expect(body).toContain('.opsv/packs/pipe/categories/script.yaml');
      expect(body).toContain('.opsv/packs/pipe/categories/shot.yaml');
      expect(body).toContain('default profile: i2v');
      expect(body).toContain('@id:variant');
      expect(body).toContain('.opsv/packs/pipe/SKILL.md');
    });

    it('contract-checker references schemas, dependency rules, IO contracts, and gates', () => {
      writeBootstrap(root);
      const body = readTemplate('contract-checker');
      expect(body).toContain('.opsv/packs/pipe/pack.yaml');
      expect(body).toContain('.opsv/packs/pipe/categories/shot.yaml');
      expect(body).toContain('shot (pack pipe) depends on: script');
      expect(body).toContain('pipe/i2v slot "reference": category script, ref image (required)');
      expect(body).toContain('pipe/i2v outputs: video');
      expect(body).toContain('pipe/create-shot (compile): work-check, refs-valid');
      // C4: the role is read-only — the template states its scope and never
      // carries produce/run/approve write-directive examples.
      expect(body).toContain('read-only validation');
      expect(body).not.toMatch(/\b(produce|run|approve)\b/i);
    });

    it('production-dispatcher references IO, produce/run rules, and recommended providers', () => {
      fs.writeFileSync(path.join(root, '.opsv', 'packs', 'pipe', 'SKILL.md'), '# Pipe Guidance\n');
      writeBootstrap(root);
      const body = readTemplate('production-dispatcher');
      expect(body).toContain('pipe/i2v slot "reference": category script, ref image (required)');
      expect(body).toContain('pipe/i2v outputs: video');
      expect(body).toContain('.opsv/packs/pipe/SKILL.md');
      expect(body).toContain('pipe effective policy: execute=human');
      expect(body).toContain('continuous-i2v (pack pipe; profiles: i2v) — project binding: test.model');
    });

    it('asset-quality-reviewer references Pack quality guidance and review targets', () => {
      writeFiles(path.join(root, '.opsv', 'packs', 'pipe'), { 'references/shot-quality.md': '# Shot Quality\n' });
      fs.writeFileSync(path.join(root, '.opsv', 'packs', 'pipe', 'graph.yaml'), [
        'workflow:',
        '  script: []',
        '  shot:',
        '    depends_on: [script]',
        '    outputs:',
        '      contract: shot-ref-v1',
        '    completion: [output_exists, output_contract_valid]',
        '    quality_guidance: references/shot-quality.md',
        '',
      ].join('\n'));
      writeBootstrap(root);
      const body = readTemplate('asset-quality-reviewer');
      expect(body).toContain('shot (pack pipe): .opsv/packs/pipe/references/shot-quality.md');
      expect(body).toContain('shot (pack pipe): completion [output_exists, output_contract_valid] output contract: shot-ref-v1');
    });

    it('degrades gracefully when the Pack declares no guidance or stage fields', () => {
      writeBootstrap(root);
      for (const role of BOOTSTRAP_ROLES) {
        const body = readTemplate(role);
        expect(body).toContain(`# Role Context: ${role}`);
      }
      expect(readTemplate('asset-quality-reviewer')).toContain('(none declared)');
    });
  });

  describe('checkBootstrapStale (fail-closed)', () => {
    it('is fresh right after bootstrap', () => {
      writeBootstrap(root);
      const status = checkBootstrapStale(root);
      expect(status).toMatchObject({ status: 'fresh', stale: false, issues: [], manifestPath: BOOTSTRAP_MANIFEST_REL });
    });

    it('reports BOOTSTRAP_MISSING when no manifest exists', () => {
      const status = checkBootstrapStale(root);
      expect(status.stale).toBe(true);
      expect(status.status).toBe('missing');
      expect(status.issues).toEqual([expect.objectContaining({ code: 'BOOTSTRAP_MISSING' })]);
    });

    it('reports BOOTSTRAP_INVALID for a corrupt manifest', () => {
      fs.mkdirSync(path.join(root, '.opsv', 'bootstrap'), { recursive: true });
      fs.writeFileSync(path.join(root, BOOTSTRAP_MANIFEST_REL), '{ not json');
      const status = checkBootstrapStale(root);
      expect(status.stale).toBe(true);
      expect(status.status).toBe('invalid');
      expect(status.issues).toEqual([expect.objectContaining({ code: 'BOOTSTRAP_INVALID' })]);
    });

    it('reports bootstrap_stale when graph.yaml changes', () => {
      writeBootstrap(root);
      fs.writeFileSync(path.join(root, '.opsv', 'packs', 'pipe', 'graph.yaml'), 'workflow:\n  script: []\n  shot: []\n');
      const status = checkBootstrapStale(root);
      expect(status.status).toBe('stale');
      expect(status.stale).toBe(true);
      expect(status.issues).toEqual([
        expect.objectContaining({ code: 'BOOTSTRAP_STALE', context: { component: 'graph', pack: 'pipe' } }),
      ]);
      expect(status.issues[0].message).toContain('graph.yaml');
    });

    it('reports bootstrap_stale when the Project Config changes', () => {
      writeBootstrap(root);
      fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs:\n  - id: pipe\nbindings:\n  continuous-i2v: other.model\n');
      const status = checkBootstrapStale(root);
      expect(status.issues).toEqual([
        expect.objectContaining({ code: 'BOOTSTRAP_STALE', context: { component: 'project.yaml' } }),
      ]);
    });

    it('reports bootstrap_stale when pack content changes (pack.yaml/categories/profiles)', () => {
      writeBootstrap(root);
      fs.appendFileSync(path.join(root, '.opsv', 'packs', 'pipe', 'profiles', 'i2v.yaml'), 'frame_directive: true\n');
      const status = checkBootstrapStale(root);
      expect(status.issues).toEqual([
        expect.objectContaining({ code: 'BOOTSTRAP_STALE', context: { component: 'pack', pack: 'pipe' } }),
      ]);
    });

    it('reports bootstrap_stale when a Pack is added to or removed from the stack', () => {
      writeBootstrap(root);
      fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs: []\n');
      const removed = checkBootstrapStale(root);
      expect(removed.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'BOOTSTRAP_STALE', context: { component: 'pack', pack: 'pipe' } }),
        expect.objectContaining({ code: 'BOOTSTRAP_STALE', context: { component: 'project.yaml' } }),
      ]));
    });

    it('returns to fresh after re-bootstrapping the changed inputs', () => {
      writeBootstrap(root);
      fs.writeFileSync(path.join(root, '.opsv', 'packs', 'pipe', 'graph.yaml'), 'workflow:\n  script: []\n  shot: []\n');
      expect(checkBootstrapStale(root).stale).toBe(true);
      writeBootstrap(root);
      expect(checkBootstrapStale(root).stale).toBe(false);
    });
  });
});

// Environment-limited integration: the sibling opsv-packs checkout is only
// present on maintainer machines (mirrors ArchitectureFlow.test.ts reaching
// outside the package). Skipped automatically when absent. The pack is copied
// into the tmp project so the shared checkout is never mutated.
const MULTI_REF_PACK = path.resolve(__dirname, '../../../../../opsv-packs/opsv-multi-ref-pipeline');
const describeMultiRef = fs.existsSync(path.join(MULTI_REF_PACK, 'pack.yaml')) ? describe : describe.skip;
describeMultiRef('Bootstrap on opsv-multi-ref-pipeline (sibling opsv-packs checkout)', () => {
  let root: string;
  let packCopy: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-bootstrap-multi-ref-'));
    packCopy = path.join(root, 'packs', 'opsv-multi-ref-pipeline');
    fs.cpSync(MULTI_REF_PACK, packCopy, {
      recursive: true,
      filter: (source) => !source.includes(`${path.sep}.git`),
    });
    fs.mkdirSync(path.join(root, '.opsv'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.opsv', 'project.yaml'),
      `packs:\n  - id: opsv-multi-ref\n    source: "${packCopy.split(path.sep).join('/')}"\n`,
    );
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('generates a manifest with Workflow Graph nodes and Role template reference slots', () => {
    const { manifest } = writeBootstrap(root);
    const ids = manifest.workflowGraph.map(node => node.id);
    for (const stage of ['project', 'script', 'shotlist', 'storyboard', 'clip', 'shot']) {
      expect(ids).toContain(stage);
    }
    const shot = manifest.workflowGraph.find(node => node.id === 'shot');
    expect(shot).toMatchObject({ pack: 'opsv-multi-ref', dependsOn: [] });
    expect(manifest.workflowGraph.find(node => node.id === 'clip')?.dependsOn).toContain('shot');
    expect(shot?.profile).toMatchObject({ name: 'multi-ref-video', kind: 'production', capability: 'video-generation' });
    expect(manifest.roles.map(entry => entry.role)).toEqual([...BOOTSTRAP_ROLES]);
    expect(manifest.roles.every(entry => entry.template.startsWith('.opsv/bootstrap/roles/') && entry.status === 'materialized')).toBe(true);
    expect(checkBootstrapStale(root).stale).toBe(false);
    fs.appendFileSync(path.join(packCopy, 'graph.yaml'), '# drift probe\n');
    const status = checkBootstrapStale(root);
    expect(status.issues).toEqual([
      expect.objectContaining({ code: 'BOOTSTRAP_STALE', context: { component: 'graph', pack: 'opsv-multi-ref' } }),
    ]);
  });
});
