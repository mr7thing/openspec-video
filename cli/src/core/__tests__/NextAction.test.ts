import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildNextAction, renderNextActionCommand, WORK_PACKET_CONTRACT_VERSION } from '../NextAction';
import { buildWorkPacket } from '../WorkPacket';
import { ManifestReader } from '../ManifestReader';

const BASE_CTX = {
  asset: 'hero',
  status: 'drafting',
  profileKind: 'production' as const,
  profileName: 'shot-video',
  profileHasMaterialize: false,
  skillName: 'create-shot',
  skillAction: 'compile',
  skillFound: true,
  circleManifests: [] as string[],
  circleManifestsRelative: [] as string[],
  sourceDirRelative: 'videospec/shots',
  issueCodes: [] as string[],
};

describe('Profile input slots and capability binding (T07)', () => {
  let root: string;
  const PACK_YAML = [
    'id: test',
    'version: 1',
    'categories:',
    '  compo: categories/compo.yaml',
    '  scene: categories/scene.yaml',
    '  character: categories/character.yaml',
    'profiles:',
    '  compo-2refs: profiles/compo-2refs.yaml',
    'skills:',
    '  make: skills/make/skill.yaml',
    '',
  ].join('\n');
  const PROFILE_YAML = [
    'kind: production',
    'capability: scene-character-compositing',
    'skill: make',
    'outputs: [image]',
    'inputs:',
    '  - { slot: scene, category: scene, ref_type: image, required: true }',
    '  - { slot: role1, category: character, ref_type: image, required: true }',
    '',
  ].join('\n');

  function setup(withBinding = true): void {
    const pack = path.join(root, '.opsv', 'packs', 'test');
    fs.mkdirSync(path.join(pack, 'categories'), { recursive: true });
    fs.mkdirSync(path.join(pack, 'profiles'), { recursive: true });
    fs.mkdirSync(path.join(pack, 'skills', 'make'), { recursive: true });
    fs.mkdirSync(path.join(root, 'videospec', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), withBinding
      ? 'packs:\n  - id: test\nbindings:\n  scene-character-compositing: test.model\n'
      : 'packs:\n  - id: test\nbindings:\n  other: test.model\n');
    fs.writeFileSync(path.join(pack, 'pack.yaml'), PACK_YAML);
    fs.writeFileSync(path.join(pack, 'categories', 'compo.yaml'), 'default_profile: compo-2refs\nprofiles: [compo-2refs]\n');
    fs.writeFileSync(path.join(pack, 'categories', 'scene.yaml'), 'profiles: []\n');
    fs.writeFileSync(path.join(pack, 'categories', 'character.yaml'), 'profiles: []\n');
    fs.writeFileSync(path.join(pack, 'profiles', 'compo-2refs.yaml'), PROFILE_YAML);
    fs.writeFileSync(path.join(pack, 'skills', 'make', 'skill.yaml'), 'action: compile\ncategory: compo\nprofile: compo-2refs\ngates: [work-check]\n');
  }

  function writeSource(id: string, category: string): void {
    fs.writeFileSync(path.join(root, 'videospec', 'assets', `${id}.md`), `---\ncategory: ${category}\nstatus: approved\n---\n## Approved References\n\n![main](${id}.png)\n`);
  }

  function writeCompo(refs: string[]): void {
    const lines = refs.map(r => `    "@${r}": [main]`).join('\n');
    fs.writeFileSync(path.join(root, 'videospec', 'assets', 'hero-compo.md'), `---\ncategory: compo\nstatus: drafting\nrefs:\n  image:\n${lines}\n---\n`);
  }

  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-inputs-')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('blocks when a required input slot is missing', () => {
    setup();
    writeSource('scene-courtyard', 'scene');
    writeCompo(['scene-courtyard']);
    const packet = buildWorkPacket(root, 'hero-compo');
    expect(packet.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PROFILE_INPUT_MISSING' })]));
    expect(packet.nextAction?.kind).toBe('blocked');
  });

  it('blocks when refs are present but in the wrong category order', () => {
    setup();
    writeSource('scene-courtyard', 'scene');
    writeSource('character-hero', 'character');
    writeCompo(['character-hero', 'scene-courtyard']);
    const packet = buildWorkPacket(root, 'hero-compo');
    expect(packet.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PROFILE_INPUT_MISMATCH' })]));
  });

  it('blocks on extra refs of a constrained type', () => {
    setup();
    writeSource('scene-courtyard', 'scene');
    writeSource('character-hero', 'character');
    writeSource('character-extra', 'character');
    writeCompo(['scene-courtyard', 'character-hero', 'character-extra']);
    const packet = buildWorkPacket(root, 'hero-compo');
    expect(packet.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PROFILE_INPUT_MISMATCH' })]));
  });

  it('passes when slots are satisfied in declaration order', () => {
    setup();
    writeSource('scene-courtyard', 'scene');
    writeSource('character-hero', 'character');
    writeCompo(['scene-courtyard', 'character-hero']);
    const packet = buildWorkPacket(root, 'hero-compo');
    expect(packet.issues).toEqual([]);
    expect(packet.nextAction).toEqual({ kind: 'circle', asset: 'hero-compo', sourceDir: 'videospec/assets' });
  });

  it('surfaces an unbound capability as a blocked issue instead of throwing', () => {
    setup(false);
    writeSource('scene-courtyard', 'scene');
    writeSource('character-hero', 'character');
    writeCompo(['scene-courtyard', 'character-hero']);
    const packet = buildWorkPacket(root, 'hero-compo');
    expect(packet.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CAPABILITY_BINDING_MISSING' })]));
    expect(packet.nextAction?.kind).toBe('blocked');
  });
});

describe('buildNextAction', () => {
  it('returns sync for syncing assets before anything else', () => {
    const { action } = buildNextAction({ ...BASE_CTX, status: 'syncing', issueCodes: ['REF_MISSING'] });
    expect(action).toEqual({ kind: 'sync', asset: 'hero' });
  });

  it('returns draft for a workflow skill with action draft (F1)', () => {
    const { action, issues } = buildNextAction({ ...BASE_CTX, profileKind: 'workflow', profileName: 'music-map', skillName: 'opsv-mv-music', skillAction: 'draft' });
    expect(action).toEqual({ kind: 'draft', asset: 'hero', skill: 'opsv-mv-music' });
    expect(issues).toEqual([]);
    expect(renderNextActionCommand(action)).toBeUndefined();
  });

  it('returns materialize only when the skill asks AND the profile declares rules', () => {
    const ok = buildNextAction({ ...BASE_CTX, profileKind: 'workflow', profileName: 'shotlist', profileHasMaterialize: true, skillAction: 'materialize' });
    expect(ok.action).toEqual({ kind: 'materialize', asset: 'hero', profile: 'shotlist', dryRunSupported: true });

    const noRules = buildNextAction({ ...BASE_CTX, profileKind: 'workflow', profileName: 'music-map', profileHasMaterialize: false, skillAction: 'materialize' });
    expect(noRules.action?.kind).toBe('blocked');
    expect(noRules.issues[0].code).toBe('SKILL_ACTION_UNSUPPORTED');
  });

  it('blocks workflow profiles whose skill action is missing or unsupported', () => {
    const { action, issues } = buildNextAction({ ...BASE_CTX, profileKind: 'workflow', skillAction: undefined });
    expect(action?.kind).toBe('blocked');
    expect(issues[0].code).toBe('SKILL_ACTION_UNSUPPORTED');
  });

  it('returns circle for production assets not yet in a circle', () => {
    const { action } = buildNextAction(BASE_CTX);
    expect(action).toEqual({ kind: 'circle', asset: 'hero', sourceDir: 'videospec/shots' });
    expect(renderNextActionCommand(action)).toBe('opsv circle create --dir videospec/shots');
  });

  it('returns compile with manifest and asset for a unique circle (F2)', () => {
    const { action } = buildNextAction({
      ...BASE_CTX,
      circleManifests: ['/proj/opsv-queue/shots_circle1/_manifest.json'],
      circleManifestsRelative: ['opsv-queue/shots_circle1/_manifest.json'],
    });
    expect(action).toEqual({ kind: 'compile', asset: 'hero', manifest: 'opsv-queue/shots_circle1/_manifest.json' });
    expect(renderNextActionCommand(action)).toBe('opsv produce --manifest opsv-queue/shots_circle1/_manifest.json --file hero');
  });

  it('returns CIRCLE_AMBIGUOUS when multiple circles contain the asset', () => {
    const { action, issues } = buildNextAction({
      ...BASE_CTX,
      circleManifests: ['/proj/opsv-queue/a/_manifest.json', '/proj/opsv-queue/b/_manifest.json'],
      circleManifestsRelative: ['opsv-queue/a/_manifest.json', 'opsv-queue/b/_manifest.json'],
    });
    expect(issues[0].code).toBe('CIRCLE_AMBIGUOUS');
    expect(issues[0].message).toContain('opsv-queue/a/_manifest.json');
    expect(issues[0].message).toContain('opsv-queue/b/_manifest.json');
    expect(action?.kind).toBe('blocked');
    expect(renderNextActionCommand(action)).toBeUndefined();
  });

  it('fails closed when the profile skill is not exported (F3)', () => {
    const { action, issues } = buildNextAction({ ...BASE_CTX, skillFound: false });
    expect(issues[0].code).toBe('PACK_PROFILE_SKILL_MISSING');
    expect(action?.kind).toBe('blocked');
  });

  it('never returns an executable action when issues exist', () => {
    const { action } = buildNextAction({ ...BASE_CTX, issueCodes: ['REF_UNAVAILABLE'] });
    expect(action?.kind).toBe('blocked');
    expect(action).toEqual({ kind: 'blocked', issueCodes: ['REF_UNAVAILABLE'] });
  });

  it('locks the work packet contract version', () => {
    expect(WORK_PACKET_CONTRACT_VERSION).toBe(2);
  });
});

describe('Work Packet structured next action', () => {
  let root: string;
  const packDir = () => path.join(root, '.opsv', 'packs', 'test');

  function setupPack(profile: string, skill: string): void {
    const pack = packDir();
    fs.mkdirSync(path.join(pack, 'categories'), { recursive: true });
    fs.mkdirSync(path.join(pack, 'profiles'), { recursive: true });
    fs.mkdirSync(path.join(pack, 'skills', 'make'), { recursive: true });
    fs.mkdirSync(path.join(root, 'videospec', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs:\n  - id: test\nbindings:\n  image: test.model\n');
    fs.writeFileSync(path.join(pack, 'pack.yaml'), 'id: test\nversion: 1\ncategories:\n  image: categories/image.yaml\nprofiles:\n  image: profiles/image.yaml\nskills:\n  make: skills/make/skill.yaml\n');
    fs.writeFileSync(path.join(pack, 'categories', 'image.yaml'), 'default_profile: image\n');
    fs.writeFileSync(path.join(pack, 'profiles', 'image.yaml'), profile);
    fs.writeFileSync(path.join(pack, 'skills', 'make', 'skill.yaml'), skill);
  }

  function writeAsset(name: string, frontmatter: string): void {
    fs.writeFileSync(path.join(root, 'videospec', 'assets', `${name}.md`), `---\n${frontmatter}\n---\n`);
  }

  function writeCircle(circle: string, assets: string[]): string {
    const dir = path.join(root, 'opsv-queue', circle);
    fs.mkdirSync(dir, { recursive: true });
    const manifest = { circle, assets: Object.fromEntries(assets.map(a => [a, { status: 'pending' }])) };
    fs.writeFileSync(path.join(dir, '_manifest.json'), JSON.stringify(manifest, null, 2));
    return path.join(dir, '_manifest.json');
  }

  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-next-action-')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('workflow draft profile returns a draft action, never a materialize command', () => {
    setupPack('kind: workflow\nskill: make\n', 'action: draft\ncategory: image\nprofile: image\ngates: [work-check]\n');
    writeAsset('music', 'category: image\nstatus: drafting\n');
    const packet = buildWorkPacket(root, 'music');
    expect(packet.contractVersion).toBe(2);
    expect(packet.pack).toMatchObject({ id: 'test', version: '1' });
    expect(packet.pack?.contentDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(packet.nextAction).toEqual({ kind: 'draft', asset: 'music', skill: 'make' });
    expect(packet.command).toBeUndefined();
    expect(packet.action).toBe('draft');
  });

  it('production asset in a unique circle returns a scoped compile command', () => {
    setupPack('kind: production\ncapability: image\nskill: make\noutputs: [image]\n', 'action: compile\ncategory: image\nprofile: image\ngates: [work-check]\n');
    writeAsset('hero', 'category: image\nstatus: drafting\n');
    writeCircle('assets_circle1', ['hero']);
    const packet = buildWorkPacket(root, 'hero');
    expect(packet.nextAction).toEqual({ kind: 'compile', asset: 'hero', manifest: 'opsv-queue/assets_circle1/_manifest.json' });
    expect(packet.command).toBe('opsv produce --manifest opsv-queue/assets_circle1/_manifest.json --file hero');
  });

  it('rendered compile command resolves from the project root against the real manifest', () => {
    setupPack('kind: production\ncapability: image\nskill: make\noutputs: [image]\n', 'action: compile\ncategory: image\nprofile: image\ngates: [work-check]\n');
    writeAsset('hero', 'category: image\nstatus: drafting\n');
    writeAsset('villain', 'category: image\nstatus: drafting\n');
    writeCircle('assets_circle1', ['hero', 'villain']);
    const packet = buildWorkPacket(root, 'hero');
    const command = packet.command!;
    const manifestArg = command.match(/--manifest (\S+)/)![1];
    const fileArg = command.match(/--file (\S+)/)![1];
    // Execute the command's resolution semantics from the project root.
    const previousCwd = process.cwd();
    process.chdir(root);
    let resolved: string;
    try {
      resolved = path.resolve(new ManifestReader().resolveForProduce(root, manifestArg));
    } finally {
      process.chdir(previousCwd);
    }
    const manifest = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    expect(Object.keys(manifest.assets)).toContain(fileArg);
    expect(fileArg).toBe('hero');
  });

  it('ambiguous circles block the packet with CIRCLE_AMBIGUOUS', () => {
    setupPack('kind: production\ncapability: image\nskill: make\noutputs: [image]\n', 'action: compile\ncategory: image\nprofile: image\ngates: [work-check]\n');
    writeAsset('hero', 'category: image\nstatus: drafting\n');
    writeCircle('assets_circle1', ['hero']);
    writeCircle('assets_circle2', ['hero']);
    const packet = buildWorkPacket(root, 'hero');
    expect(packet.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CIRCLE_AMBIGUOUS' })]));
    expect(packet.nextAction?.kind).toBe('blocked');
    expect(packet.command).toBeUndefined();
  });

  it('profile skill miss fails closed with an explicit issue instead of empty gates', () => {
    setupPack('kind: workflow\nskill: ghost\n', 'action: draft\ncategory: image\nprofile: image\ngates: [work-check]\n');
    writeAsset('music', 'category: image\nstatus: drafting\n');
    const packet = buildWorkPacket(root, 'music');
    expect(packet.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PACK_PROFILE_SKILL_MISSING' })]));
    expect(packet.nextAction?.kind).toBe('blocked');
    expect(packet.command).toBeUndefined();
  });

  it('blocked packets never carry an executable action', () => {
    setupPack('kind: production\ncapability: image\nskill: make\noutputs: [image]\nrequired_ref_categories: [storyboard]\n', 'action: compile\ncategory: image\nprofile: image\ngates: [work-check]\n');
    writeAsset('hero', 'category: image\nstatus: drafting\nrefs:\n  image:\n    "@source": [x]\n');
    const packet = buildWorkPacket(root, 'hero');
    expect(packet.issues.length).toBeGreaterThan(0);
    expect(packet.nextAction?.kind).toBe('blocked');
    expect(packet.command).toBeUndefined();
  });
});
