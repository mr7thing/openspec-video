# Canonical Types

> The full schema of the Canonical Model (Layer 3). These are the Zod-schema-backed TypeScript types in `cli/src/canonical/schema/`. This is an **intermediate representation** — it is not a storage format (storage stays Markdown documents + `.opsv/` state).

---

## 1. Core Entities

### 1.1 CanonicalTimeline — first-class semantic container

The timeline is a semantic container, **not a prompt attachment** (`design.md §2.1`).

```ts
CanonicalTimeline = {
  segments: CanonicalSegment[];
  frameRate?: number;              // optional; present when the pack pins fps
  duration?: number;               // derived: sum(segments[i].end - start)
}

CanonicalSegment = {
  id: string;                      // stable id, e.g. seg_001
  start: number;                   // seconds (v1 unit); [start, end) half-open
  end: number;
  subjects: CanonicalRef[];        // @alice:v3
  scene?: CanonicalRef[];          // @temple:v2
  action?: string;                 // structured action description
  camera?: { shot?: string; movement?: string; speed?: string };
  prompt?: string;                 // segment-level generation prompt if the author provides one
  references?: CanonicalRef[];
  constraints?: CanonicalConstraint[];
}
```

Parser sources: `0-4s`, `00:32 - 00:36`, and the MV pack `timeline_data` structure all normalize into `CanonicalSegment[]` (`design.md §3.1`). Fields without a recognized heading stay in `bodyRaw` / `actionRaw` — the parser is lossless, not lossy.

### 1.2 CanonicalReference — ReferenceExpression AST

```ts
CanonicalReference = {
  type: 'reference';
  namespace: string;               // default 'asset'; 'FRAME' reserved for shotsdeck continuity
  id: string;                      // alice / shot-023 / scene.temple
  selector?: string;               // .face / .costume / .output  (v1: pack allowlist only)
  variant?: string;                // :v3
  state?: string;                  // [approved] / [latest]
  raw: string;                     // original text @alice:v3 — round-trip uses this
}
```

Grammar and backward-compat: see [Reference DSL v2](./reference-dsl-v2.md).

### 1.3 CanonicalAsset

```ts
CanonicalAsset = {
  id: string;
  category: string;
  docPath: string;                 // document path relative to project root
  document: CanonicalDocument;     // parsed document structure
  timeline?: CanonicalTimeline;    // shot / clip assets
  refs: { external: CanonicalRef[]; design: CanonicalRef[] };
  approvedRefs: ApprovedVariant[]; // result of ApprovedRefReader
  status: AssetLifecycleStatus;    // document lifecycle, see asset-state-machine.md
  artifacts: CanonicalArtifact[];
  reviews: CanonicalReview[];
}
```

### 1.4 CanonicalArtifact — contract-validated output

```ts
CanonicalArtifact = {
  id: string;
  taskId: string;                  // the Production Task that produced it
  uri: string;                     // relative or absolute path
  type: 'video' | 'image' | 'audio' | 'composite' | string;
  mediaInfo?: { duration?: number; codec?: string; resolution?: { w: number; h: number } };
  provenance: {
    actor: string;                 // agent / human / system
    capability: string;            // e.g. video.generate
    provider?: string;             // seedance / veo / rhcli / ...
    model?: string;
    prompt?: string;
  };
  validation: ArtifactValidationResult;   // see artifact-contract.md
  state: AssetState;               // candidate / review / approved / released / rejected / superseded
}
```

### 1.5 CanonicalReview — review as state mutation

```ts
CanonicalReview = {
  id: string;
  assetId: string;
  artifactId?: string;
  kind: 'annotation' | 'feedback' | 'revise' | 'approve' | 'reject';
  timeline?: { start: number; end: number };   // time-bounded annotation
  target?: string;                 // alice / camera / scene
  issue?: string;                  // identity / motion / duration / ...
  severity?: 'low' | 'medium' | 'high';
  comment: string;
  actor: { type: 'human' | 'agent' | 'system'; id: string };
  timestamp: string;
}
```

### 1.6 Supporting types

```ts
CanonicalConstraint = {
  kind: string;                    // identity / scene / continuity / ...
  level: 'strict' | 'loose';       // or pack-specific enum via category schema
}

ApprovedVariant = {
  variant: string;                 // unique, never reused
  artifactPath: string;
  supersedes?: string;             // older variant name when this one replaces it
}
```

---

## 2. Mapping to Existing Types (migration contract)

| Canonical | Existing source |
|---|---|
| `CanonicalAsset.document` | `FrontmatterParser` (`cli/src/core/FrontmatterParser.ts`) + body parse (P2) |
| `CanonicalReference` | `RefSyntaxParser.parseRefKey` extended (`cli/src/core/RefSyntaxParser.ts`) |
| `CanonicalTimeline` | v1: shot/clip `duration` / `first_frame` / `last_frame` / `frame_ref` + MV pack `timeline_data` |
| `CanonicalArtifact` | `TaskMeta` + output files + `ApproveService` result |
| `CanonicalReview` | `reviews[]` frontmatter + `ReviewEntry` (`types/ManifestSchema.ts`) + `.review-state.json` |
| `ApprovedVariant` | `ApprovedRefReader` (`## Approved References` + `<!-- opsv:supersedes=... -->`) |
| `AssetLifecycleStatus` | existing `status: drafting \| syncing \| approved` |
| `AssetState` (artifact-side) | new state machine — see asset-state-machine.md |

**Migration invariant**: the Canonical Model is derived from documents losslessly; it never becomes a second authority. Round-trip tests in `cli/src/canonical/__tests__/RoundTrip.test.ts` enforce this.

## 3. Schema Authoring Rules

1. All schemas are Zod-backed (`cli/src/canonical/schema/index.ts`), mirroring the existing `cli/src/types/` convention.
2. Every entity carries an `id` and a stable `raw`/source reference so provenance is always traceable.
3. Optional fields stay optional in v1 — the parser fills them only when the document expresses them.
4. Do not introduce a field the existing domain vocabulary forbids (e.g. `asset_type`).

## 4. Phase 1 Production Snapshot and Task Contracts

### 1. Scope / Trigger

These additive TypeScript contracts apply to Pack-backed production compilation. They are immutable in-memory envelopes for the Phase 1 compatibility seam, not editable authoring formats and not yet the Phase 3 persistent Task repository.

### 2. Signatures

```ts
CanonicalSnapshot = {
  schema: 'opsv.canonical-snapshot';
  version: 1;
  source: { path: string; digest: string };
  asset: CanonicalAsset;
  contract: CanonicalSnapshotContract;
  references: CanonicalResolvedInput[];
  production: CanonicalProductionInput;
  digest: string;
};

ProductionTask = {
  schema: 'opsv.production-task';
  version: 1;
  id: string;
  revision: string;
  digest: string;
  snapshotDigest: string;
  source: { path: string; digest: string };
  capability?: string;
  boundModel?: string;
  outputs: string[];
  references: CanonicalResolvedInput[];
  production: CanonicalProductionInput;
};
```

### 3. Contracts

- Digest format is `sha256:<lowercase-hex>` over `opsv:<schema-id>:v<version>\n<canonical-json>`.
- Canonical JSON recursively sorts object keys, preserves array order, omits unsupported optional values, and rejects non-finite numbers.
- `source.digest` preserves exact source-byte fidelity for audit and `isSnapshotStale`; it is excluded from semantic Snapshot/Task identity so comment-only or equivalent YAML formatting changes do not create a semantic revision.
- `asset` fidelity fields (`raw`, `bodyRaw`, `approvedRefSection`, `designRefSection`) are excluded from semantic Snapshot identity but remain available on the frozen Snapshot for round-trip/audit.
- `CanonicalResolvedInput.kind` is `image | video | audio | frame:first | frame:last | workflow`; local `uri` values are contained project-relative POSIX paths with content digests.
- `ProductionTask.revision === ProductionTask.digest` in version 1. The Task binds `snapshotDigest`, resolved inputs, capability/model/output bindings, and provider-neutral production input.
- `createCanonicalSnapshot` and `compileProductionTask` deep-freeze their returned envelopes.

### 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| Non-finite number enters canonical serialization | Throw; do not emit a digest |
| Source bytes differ from `snapshot.source.digest` | `isSnapshotStale` returns `true` |
| Local input is outside project containment, missing, not a file, or has changed content | Reject before provider compilation |
| External HTTP(S)/data input is used | Bind a deterministic URI digest; do not fetch remote bytes |
| Secret-like frontmatter key would enter a canonical Snapshot | Reject document compilation |
| Task bound model differs from requested model | Reject canonical lowering |

### 5. Good / Base / Bad Cases

- Good: semantically identical documents with reordered YAML keys have different raw source digests but the same Snapshot semantic digest.
- Base: a Snapshot with no media references carries `references: []`; this is explicit and digest-protected.
- Bad: replacing `media/reference.png` after Task creation fails lowering rather than silently compiling against new bytes.

### 6. Tests Required

- Golden digest determinism and schema/version domain isolation.
- Deep-freeze assertions for Snapshot and Task envelopes.
- Raw-source staleness versus semantic identity tests.
- Local media/workflow path normalization and content-change tests.
- Production Task determinism and queue metadata mapping tests.
- Provider-neutral lowering tests proving that source Markdown is not reread.

### 7. Wrong vs Correct

#### Wrong

```ts
const snapshotDigest = sha256(markdownBytes); // formatting becomes semantic identity
const task = { ...snapshot, createdAt: new Date().toISOString() }; // nondeterministic Task
```

#### Correct

```ts
const snapshot = createCanonicalSnapshot(draft); // semantic digest + raw source audit digest
const task = compileProductionTask(snapshot);    // deterministic, frozen, provider-neutral
```
