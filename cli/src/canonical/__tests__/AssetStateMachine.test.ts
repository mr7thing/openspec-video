import {
  ASSET_STATES,
  ASSET_TRANSITIONS,
  isValidTransition,
  assertValidTransition,
  reachablePath,
} from '../state/AssetStateMachine';
import { OpsVErrorCode } from '../../errors/OpsVError';

describe('Asset State Machine (P3a)', () => {
  it('exposes exactly the seven states', () => {
    expect([...ASSET_STATES].sort()).toEqual([
      'approved',
      'candidate',
      'draft',
      'rejected',
      'released',
      'review',
      'superseded',
    ]);
  });

  describe('legal transitions', () => {
    const legal: Array<[string, string]> = [
      ['draft', 'candidate'],
      ['candidate', 'review'],
      ['review', 'approved'],
      ['review', 'rejected'],
      ['rejected', 'candidate'],
      ['approved', 'superseded'],
      ['approved', 'released'],
    ];
    for (const [from, to] of legal) {
      it(`${from} → ${to}`, () => {
        expect(isValidTransition(from as never, to as never)).toBe(true);
        expect(() => assertValidTransition(from as never, to as never)).not.toThrow();
      });
    }
  });

  describe('illegal transitions', () => {
    const illegal: Array<[string, string]> = [
      ['approved', 'generating'],
      ['approved', 'review'],
      ['released', 'draft'],
      ['generating', 'approved'],
      ['draft', 'released'],
      ['candidate', 'approved'], // must pass through review
      ['rejected', 'approved'], // must pass through candidate
      ['superseded', 'approved'],
      ['released', 'candidate'],
    ];
    for (const [from, to] of illegal) {
      it(`${from} → ${to} is rejected`, () => {
        expect(isValidTransition(from as never, to as never)).toBe(false);
      });
    }

    it('assertValidTransition throws E1005 with transition details', () => {
      try {
        assertValidTransition('approved', 'generating' as never);
        fail('should have thrown');
      } catch (err: any) {
        expect(err.code).toBe(OpsVErrorCode.ASSET_STATE_INVALID_TRANSITION);
        expect(err.message).toContain('approved');
        expect(err.message).toContain('generating');
        expect(err.details.assetState).toEqual({ from: 'approved', to: 'generating' });
      }
    });
  });

  it('terminal states have no outgoing edges', () => {
    expect(ASSET_TRANSITIONS.released).toEqual([]);
    expect(ASSET_TRANSITIONS.superseded).toEqual([]);
  });

  describe('reachablePath', () => {
    it('finds the shortest path candidate → approved', () => {
      expect(reachablePath('candidate', 'approved')).toEqual(['review', 'approved']);
    });

    it('finds the full path draft → approved', () => {
      expect(reachablePath('draft', 'approved')).toEqual(['candidate', 'review', 'approved']);
    });

    it('returns [to] when already at the target', () => {
      expect(reachablePath('approved', 'approved')).toEqual(['approved']);
    });

    it('returns null for unreachable targets', () => {
      expect(reachablePath('released', 'approved')).toBeNull();
      expect(reachablePath('superseded', 'candidate')).toBeNull();
    });
  });
});
