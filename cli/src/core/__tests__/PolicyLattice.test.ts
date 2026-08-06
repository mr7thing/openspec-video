import { mergePolicies, POLICY_DEFAULTS, rank, stricter } from '../PolicyLattice';

describe('PolicyLattice', () => {
  it('ranks auto < ask < human', () => {
    expect(rank('auto')).toBeLessThan(rank('ask'));
    expect(rank('ask')).toBeLessThan(rank('human'));
    expect(stricter('auto', 'human')).toBe('human');
    expect(stricter('ask', 'auto')).toBe('ask');
  });

  it('applies the full tightening matrix', () => {
    const levels = ['auto', 'ask', 'human'] as const;
    for (const pack of levels) {
      for (const project of levels) {
        const { effective, issues } = mergePolicies(
          { draft: 'auto' },
          { draft: pack },
          { draft: project },
        );
        const expected = levels[Math.max(levels.indexOf(pack), levels.indexOf(project))];
        expect(effective.draft).toBe(expected);
        if (levels.indexOf(project) < levels.indexOf(pack)) {
          expect(issues).toEqual([
            expect.objectContaining({ code: 'PROJECT_POLICY_LOOSENS_PACK', action: 'draft', pack, project, effective: pack }),
          ]);
        } else {
          expect(issues).toEqual([]);
        }
      }
    }
  });

  it('falls back to defaults when policies are missing', () => {
    const { effective, issues } = mergePolicies({}, undefined, undefined);
    expect(effective).toEqual(POLICY_DEFAULTS);
    expect(issues).toEqual([]);
  });

  it('keeps delete: never regardless of layer values', () => {
    const { effective } = mergePolicies({}, { delete: 'never' }, { delete: 'never' });
    expect(effective.delete).toBe('never');
  });

  it('ignores null policy values (empty YAML value means inherit)', () => {
    const { effective, issues } = mergePolicies({}, { sync: 'human' }, { sync: null });
    expect(effective.sync).toBe('human');
    expect(issues).toEqual([]);
  });

  it('warns on unknown project policy keys without applying them', () => {
    const { effective, issues } = mergePolicies({}, {}, { teleport: 'auto' } as any);
    expect(issues).toEqual([expect.objectContaining({ code: 'PROJECT_POLICY_UNKNOWN_KEY', severity: 'warning' })]);
    expect((effective as any).teleport).toBeUndefined();
  });

  it('lets projects tighten packs without diagnostics', () => {
    const { effective, issues } = mergePolicies({}, { compile: 'auto' }, { compile: 'human' });
    expect(effective.compile).toBe('human');
    expect(issues).toEqual([]);
  });

  it('rejects a project override looser than the built-in safety floor', () => {
    const { effective, issues } = mergePolicies({}, {}, { execute: 'auto' });
    expect(effective.execute).toBe('ask'); // built-in default floor holds
    expect(issues).toEqual([
      expect.objectContaining({ code: 'PROJECT_POLICY_LOOSENS_PACK', action: 'execute', project: 'auto', effective: 'ask' }),
    ]);
  });

  it('treats the pack floor as the stricter of pack value and built-in default', () => {
    const { effective, issues } = mergePolicies({}, { execute: 'human' }, { execute: 'ask' });
    expect(effective.execute).toBe('human');
    expect(issues).toEqual([
      expect.objectContaining({ code: 'PROJECT_POLICY_LOOSENS_PACK', action: 'execute', project: 'ask', effective: 'human' }),
    ]);
  });

  it('lets a pack declare a value looser than the built-in default', () => {
    // pack explicitly opts execute down to 'auto' (looser than the 'ask' default).
    const { effective, issues } = mergePolicies({}, { execute: 'auto' }, {});
    expect(effective.execute).toBe('auto');
    expect(issues).toEqual([]);
    // ...but a project may not loosen that floor any further, nor below it.
    const also = mergePolicies({}, { execute: 'auto' }, { execute: 'auto' });
    expect(also.effective.execute).toBe('auto');
    expect(also.issues).toEqual([]);
  });
});
