import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildWorkPacket } from '../WorkPacket';
import { buildWorkContext } from '../WorkContext';
import { ReviewService } from '../ReviewService';
import { appendTransition, currentStateSync } from '../../canonical/state/TransitionStore';
import { AssetState } from '../../canonical/schema';

function setupProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-state-wiring-'));
  const pack = path.join(root, '.opsv', 'packs', 'test');
  fs.mkdirSync(path.join(pack, 'categories'), { recursive: true });
  fs.mkdirSync(path.join(pack, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(pack, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(root, 'videospec', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs:\n  - id: test\nbindings:\n  image: test.model\n');
  fs.writeFileSync(path.join(pack, 'pack.yaml'), 'id: test\nversion: 1\ncategories:\n  image: categories/image.yaml\nprofiles:\n  image: profiles/image.yaml\nskills:\n  make: skills/make.yaml\n');
  fs.writeFileSync(path.join(pack, 'categories', 'image.yaml'), 'default_profile: image\n');
  fs.writeFileSync(path.join(pack, 'profiles', 'image.yaml'), 'kind: production\ncapability: image\nskill: make\noutputs: [image]\n');
  fs.writeFileSync(path.join(pack, 'skills', 'make.yaml'), 'gates: [work-check, refs-valid]\n');
  fs.writeFileSync(path.join(root, 'videospec', 'assets', 'hero.md'), '---\ncategory: image\nstatus: drafting\n---\n');
  return root;
}

async function walkTo(root: string, asset: string, states: Array<[AssetState, AssetState]>): Promise<void> {
  for (const [from, to] of states) {
    await appendTransition(root, {
      asset,
      artifact: `${asset}:v1`,
      from,
      to,
      actor: { type: 'agent', id: 'test' },
      timestamp: new Date().toISOString(),
    });
  }
}

describe('P7 — canonical state machine wired into the agent control surface', () => {
  describe('WorkPacket.assetState', () => {
    it('defaults to draft when no transition log exists', () => {
      const root = setupProject();
      const packet = buildWorkPacket(root, 'hero');
      expect(packet.assetState).toEqual({ state: 'draft', transitions: 0 });
    });

    it('surfaces the recorded artifact state and transition count', async () => {
      const root = setupProject();
      await walkTo(root, 'hero', [['draft', 'candidate'], ['candidate', 'review']]);
      const packet = buildWorkPacket(root, 'hero');
      expect(packet.assetState).toEqual({ state: 'review', transitions: 2 });
    });
  });

  describe('WorkContext.assetState', () => {
    it('includes the asset state in the context manifest', async () => {
      const root = setupProject();
      await walkTo(root, 'hero', [['draft', 'candidate']]);
      const manifest = buildWorkContext(root, 'hero', 'production-dispatcher');
      expect(manifest.assetState).toEqual({ state: 'candidate', transitions: 1 });
    });
  });

  describe('ReviewService.revise', () => {
    it('reopens a reviewed asset through the revision loop', async () => {
      const root = setupProject();
      await walkTo(root, 'hero', [['draft', 'candidate'], ['candidate', 'review']]);
      const service = new ReviewService(root);
      await service.revise('hero', 'change the outfit');
      expect(currentStateSync(root, 'hero').state).toBe('candidate');
    });

    it('characterizes partial success when the review entry is written but lifecycle persistence fails', async () => {
      const root = setupProject();
      const brokenLogPath = path.join(root, '.opsv', 'state', 'hero.jsonl');
      fs.mkdirSync(brokenLogPath, { recursive: true });
      const service = new ReviewService(root);

      await expect(service.revise('hero', 'keep the written review')).resolves.toContain('hero.md');

      const document = fs.readFileSync(path.join(root, 'videospec', 'assets', 'hero.md'), 'utf-8');
      expect(document).toContain('keep the written review');
      expect(fs.statSync(brokenLogPath).isDirectory()).toBe(true);
    });

    it('does not fail when the asset is not yet in review (draft)', async () => {
      const root = setupProject();
      const service = new ReviewService(root);
      await service.revise('hero', 'tweak the framing');
      // draft has no revision-loop path — the review entry is still written, state stays draft
      expect(currentStateSync(root, 'hero').state).toBe('draft');
    });
  });
});
