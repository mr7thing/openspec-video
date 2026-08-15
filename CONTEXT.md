# OPSV Review Context

This context describes how Review UI presents production assets without making the Review session itself a second production authority.

## Language

### Review

**Review Session**:
A temporary workspace for arranging, previewing, comparing, and annotating existing production assets.

**Canonical Timeline**:
The production-facing time structure derived from an Asset Document, containing semantic Segments such as Shot ranges, actions, and camera descriptions.

**Timeline Placement**:
A Review Session association that places an Asset or Artifact against a Canonical Timeline Segment or a review time range.

**Timeline Anchor**:
A playhead position used to place an Asset or Artifact when no semantic time span is available.

**Playback Source**:
An Artifact or media record that can provide time-seekable audio or video during Review playback.

**Primary Playback Source**:
The one Playback Source selected by a Review Session to drive the global playhead in the first Timeline delivery.

**Temporal Annotation**:
A Script, Storyboard, Shot description, or other non-playing asset associated with a time range for review context.

**Context Reference**:
A Reference, Sketch, Design Reference, or Approved Reference shown alongside a time range without being a playback source.

**Review Lane**:
A fixed semantic Timeline lane for Playback Sources, Temporal Annotations, or Context References.

**AssetGraph**:
The explainable graph of Assets, Artifacts, Tasks, Segments, References, and their dependency or provenance relationships.

**Review Read Projection**:
A read-only projection that combines Canonical Assets, lifecycle state, Artifacts, Canonical Timeline data, and AssetGraph relationships for Review modes.

### Production identity

**Asset**:
The stable production identity represented by one Asset Document.

**Artifact**:
A concrete output produced by a Task and versioned independently from the Asset identity.

**Segment**:
A semantic interval inside a Canonical Timeline that describes part of an Asset's temporal production intent.

**Reference**:
A declared input relationship to another Asset, Artifact, or local design material; its dependency meaning is determined by the Canonical Model rather than by UI labels.

## Relationships

- An **Asset Document** may produce one **Asset** and multiple **Artifacts**.
- A **Canonical Timeline** contains zero or more **Segments**.
- A **Timeline Placement** may target one **Segment** or one Review Session time range.
- A **Timeline Anchor** has a position but no implied production duration.
- A **Playback Source** is an **Artifact** or media record that can be placed on a Review Timeline.
- A **Review Session** has at most one **Primary Playback Source** at a time; other Playback Sources are alternates or comparison previews.
- A **Review Session** contains fixed **Review Lanes** for Playback Sources, Temporal Annotations, and Context References.
- One **Asset** or **Artifact** may have multiple **Timeline Placements** in a Review Session.
- A **Temporal Annotation** may be placed against a **Segment** without becoming a Playback Source.
- A **Context Reference** may be associated with a **Segment** without becoming a Playback Source.
- A **Review Session** owns **Timeline Placements** but does not become the authority for production Asset identity or lifecycle.
- A **Review Session** is restored from browser-local state in the first delivery and is not persisted into project production data.
- A **Review Read Projection** exposes **AssetGraph** relationships to both Timeline and Canvas modes.

## Example dialogue

> **Dev:** "If I place a storyboard at 00:04 in the Review Timeline, does that change the Asset Document?"
> **Domain expert:** "No. It creates a Timeline Placement in the Review Session; the Canonical Timeline remains the production authority."
>
> **Dev:** "Can the storyboard play?"
> **Domain expert:** "No. It is a Temporal Annotation. A generated video Artifact may be the Playback Source for the same Segment."
>
> **Dev:** "What does the Canvas show?"
> **Domain expert:** "It shows the AssetGraph relationship between the Asset, its Segment, the Playback Source, and its References. It does not infer new dependencies from visual layout."

## Flagged ambiguities

- **Canonical Timeline** and **Review Timeline** must remain distinct: the former is production-facing semantic data; the latter is Review Session arrangement.
- **Reference** is broader than **Context Reference**: a Reference can create a production dependency, while a Context Reference is specifically the Review presentation role.
- A **Timeline Placement** may point to a Segment, but its temporary review position must not silently rewrite that Segment.

## Canvas information hierarchy

The first Canvas delivery is read-only and uses a two-level information hierarchy:

- **Default graph level**: show Asset nodes and explicit AssetGraph edges relevant to dependency, provenance, lifecycle, and production structure.
- **Selected Asset detail**: reveal the selected Asset's Segments, Artifacts, approved Variant, Task/Task Revision, References, provenance parent, and supersedes relationships.
- **Selected Artifact detail**: reveal media capability, duration, lifecycle state, provenance, and its owning Asset/Task; it can be promoted to the Timeline's Playback Source.
- **Selected Segment detail**: reveal its semantic time range and associated annotations/context; selecting it seeks the Timeline playhead to the Segment start.

Canvas layout is presentation state only. Node positions, zoom, and viewport belong to the browser-local Review Session and never create or alter AssetGraph relationships.

The Canvas must not default to provider directories, raw file paths, queue JSON, execution logs, Markdown syntax nodes, or every historical Artifact Revision. These remain available only through an explicit detail/provenance inspection affordance.

## AssetGraph relationship visibility

AssetGraph edges are created only from explicit Canonical Model relationships. The Canvas never infers an edge from category names, filesystem placement, visual proximity, or a user's Canvas layout.

The first relationship vocabulary is:

- **depends-on**: an Asset or Task declares another Asset, Artifact, or Reference as a production input.
- **produced-by**: an Artifact was produced by a Task or Task Revision.
- **derived-from**: an Asset or Artifact is derived from another Asset or Artifact.
- **contains**: an Asset contains a Segment or owns an Artifact.
- **supersedes**: an Asset or Artifact Revision replaces an earlier revision.
- **references**: a declared Reference points to its target.

A production dependency Reference may be displayed as an AssetGraph edge. A presentation-only Context Reference remains Review Session detail or a Timeline association and does not become a production dependency edge.

## Review Read Projection

Timeline and Canvas consume one shared **Review Read Projection**. It has two read shapes:

- **Workspace Projection**: lightweight asset summaries, asset-level graph, lifecycle state, preview kind, and capability flags for initial loading.
- **Focus Projection**: on-demand details for a selected Asset, Artifact, or Segment, including Canonical Timeline, Artifact revisions, media capability, provenance, References, and a graph neighborhood.

The projection is read-only and UI-neutral. It does not contain browser-local Timeline Placements, playhead, Canvas positions, zoom, or viewport. It does not perform lifecycle writes or expose provider implementation details as the UI contract.
