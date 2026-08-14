import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  appendTransition,
  readTransitions,
  projectState,
  currentState,
  currentStateSync,
  transitionToState,
  stateLogPath,
} from '../state/TransitionStore';
import { AssetTransition } from '../state/TransitionStore';

function makeTransition(partial: Partial<AssetTransition> = {}): AssetTransition {
  return {
    asset: 'shot-023',
    artifact: 'shot-023:v1',
    from: 'draft',
    to: 'candidate',
    actor: { type: 'agent', id: 'test' },
    reason: 'commit accepted',
    timestamp: '2026-08-14T10:00:00.000Z',
    ...partial,
  };
}

describe('Transition Store (P3a)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-state-test-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('appends a transition and reads it back', async () => {
    await appendTransition(tmp, makeTransition());
    const transitions = await readTransitions(tmp, 'shot-023');
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({ from: 'draft', to: 'candidate' });
  });

  it('rejects an illegal state-machine transition without writing', async () => {
    // Both states are valid; the edge approved → review is illegal (must supersede first).
    await expect(
      appendTransition(tmp, makeTransition({ from: 'approved', to: 'review' })),
    ).rejects.toThrow(/Illegal asset state transition/);
    expect(fs.existsSync(stateLogPath(tmp, 'shot-023'))).toBe(false);
  });

  it('rejects an unknown state via the schema', async () => {
    await expect(
      appendTransition(tmp, makeTransition({ from: 'not-a-state' as never })),
    ).rejects.toThrow(/Invalid asset transition/);
  });

  it('rejects a path-traversal asset id', async () => {
    await expect(
      appendTransition(tmp, makeTransition({ asset: '../../etc/passwd' })),
    ).rejects.toThrow(/Invalid asset id/);
  });

  it('is append-only: two appends produce two lines', async () => {
    await appendTransition(tmp, makeTransition({ to: 'candidate' }));
    await appendTransition(tmp, makeTransition({ to: 'candidate' }));
    const raw = fs.readFileSync(stateLogPath(tmp, 'shot-023'), 'utf-8');
    expect(raw.trim().split('\n')).toHaveLength(2);
  });

  describe('projectState', () => {
    it('drafts when there are no transitions', () => {
      expect(projectState([])).toBe('draft');
    });

    it('projects the full lifecycle chain', () => {
      const chain: AssetTransition[] = [
        makeTransition({ to: 'candidate' }),
        makeTransition({ from: 'candidate', to: 'review' }),
        makeTransition({ from: 'review', to: 'approved' }),
      ];
      expect(projectState(chain)).toBe('approved');
    });

    it('projects review → rejected', () => {
      const chain: AssetTransition[] = [
        makeTransition({ to: 'candidate' }),
        makeTransition({ from: 'candidate', to: 'review' }),
        makeTransition({ from: 'review', to: 'rejected' }),
      ];
      expect(projectState(chain)).toBe('rejected');
    });
  });

  it('currentState returns state + full log', async () => {
    await appendTransition(tmp, makeTransition({ to: 'candidate' }));
    await appendTransition(tmp, makeTransition({ from: 'candidate', to: 'review' }));
    const { state, transitions } = await currentState(tmp, 'shot-023');
    expect(state).toBe('review');
    expect(transitions).toHaveLength(2);
  });

  describe('Phase 0 legacy characterization', () => {
    it('projects a corrupt-only log as draft in the synchronous path', () => {
      const log = stateLogPath(tmp, 'shot-corrupt');
      fs.mkdirSync(path.dirname(log), { recursive: true });
      fs.writeFileSync(log, '{not-json}\n');

      expect(currentStateSync(tmp, 'shot-corrupt')).toEqual({ state: 'draft', transitions: [] });
    });

    it('projects an I/O read failure as draft in the synchronous path', () => {
      const log = stateLogPath(tmp, 'shot-io-error');
      fs.mkdirSync(log, { recursive: true });

      expect(currentStateSync(tmp, 'shot-io-error')).toEqual({ state: 'draft', transitions: [] });
    });

    it('stores different artifact revisions in the same asset-keyed stream and projection', async () => {
      await appendTransition(tmp, makeTransition({ artifact: 'shot-023:v1' }));
      await appendTransition(tmp, makeTransition({
        artifact: 'shot-023:v2',
        from: 'candidate',
        to: 'review',
      }));

      const result = await currentState(tmp, 'shot-023');
      expect(result.state).toBe('review');
      expect(result.transitions.map(transition => transition.artifact)).toEqual([
        'shot-023:v1',
        'shot-023:v2',
      ]);
      expect(fs.readdirSync(path.join(tmp, '.opsv', 'state'))).toEqual(['shot-023.jsonl']);
    });

    it('transitionToState appends every intermediate edge in one call', async () => {
      const appended = await transitionToState(tmp, {
        asset: 'shot-multistep',
        artifact: 'shot-multistep:v1',
        actor: { type: 'system', id: 'legacy-normalizer' },
        reason: 'legacy approval normalization',
        timestamp: '2026-08-14T10:00:00.000Z',
      }, 'approved');

      expect(appended.map(({ from, to }) => `${from}->${to}`)).toEqual([
        'draft->candidate',
        'candidate->review',
        'review->approved',
      ]);
    });
  });

  it('recovers a torn tail on append', async () => {
    const log = stateLogPath(tmp, 'shot-023');
    fs.mkdirSync(path.dirname(log), { recursive: true });
    fs.writeFileSync(log, `${JSON.stringify(makeTransition())}\n{"asset":"shot-023","artifac`); // torn
    await appendTransition(tmp, makeTransition({ to: 'candidate' }));
    const transitions = await readTransitions(tmp, 'shot-023');
    expect(transitions).toHaveLength(2);
  });
});
