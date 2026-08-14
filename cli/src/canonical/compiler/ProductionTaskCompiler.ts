import { deepFreeze } from './CanonicalSnapshot';
import type { CanonicalProductionInput, CanonicalResolvedInput, CanonicalSnapshot } from './CanonicalSnapshot';
import { canonicalDigest } from './CanonicalDigest';

export interface ProductionTask {
  schema: 'opsv.production-task';
  version: 1;
  id: string;
  revision: string;
  digest: string;
  snapshotDigest: string;
  source: {
    path: string;
    digest: string;
  };
  capability?: string;
  boundModel?: string;
  outputs: string[];
  references: CanonicalResolvedInput[];
  production: CanonicalProductionInput;
}

type ProductionTaskIdentity = Omit<ProductionTask, 'revision' | 'digest'>;

export function compileProductionTask(snapshot: CanonicalSnapshot): ProductionTask {
  const identity: ProductionTaskIdentity = {
    schema: 'opsv.production-task',
    version: 1,
    id: snapshot.asset.id,
    snapshotDigest: snapshot.digest,
    source: { ...snapshot.source },
    capability: snapshot.contract.profile.capability,
    boundModel: snapshot.contract.boundModel,
    outputs: [...snapshot.contract.outputs],
    references: snapshot.references.map((reference) => ({ ...reference })),
    production: {
      ...snapshot.production,
      payload: structuredClone(snapshot.production.payload),
      references: {
        image: [...snapshot.production.references.image],
        video: [...snapshot.production.references.video],
        audio: [...snapshot.production.references.audio],
      },
    },
  };
  const semanticIdentity = {
    ...identity,
    source: { path: identity.source.path },
  };
  const digest = canonicalDigest(semanticIdentity, 'production-task', identity.version);
  return deepFreeze({ ...identity, revision: digest, digest });
}
