# Ubiquitous Language

Status: agreed terminology (2026-07-18). The remaining open items concern implementation syntax, not the domain model.

## Asset Production

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Asset** | A stable, referenceable production identity represented by exactly one Asset Document. | Output file, task, resource |
| **Asset Document** | The source-of-truth document for one Asset's identity, specification, references, review record, and approved references. | Descriptor, spec file |
| **Production Asset Document** | An Asset Document with an executable Profile that compiles to a Production Task and produces Artifacts. | Workflow Document |
| **Workflow Document** | A Pack-governed document that shapes production work but has no executable Profile or direct Artifact output. | Asset Document |
| **Artifact** | A concrete file or result produced by one Production Task; it is not itself the Asset identity. | Asset, final asset |
| **Production Task** | An immutable execution request compiled from an Asset Document and resolved production configuration. | Asset, job document |
| **Revision** | A new Production Task derived from a prior task without overwriting its Artifact history. | Edit-in-place |
| **Syncing** | The Asset state in which a revised Task has an approved Artifact but its source document still awaits free-form reconciliation. | Failed sync, approval pending |
| **Synchronization** | The explicit reconciliation of a Syncing Asset Document with its approved revised Task, followed by validation and a local Git commit. | Payload reverse-compilation |
| **Approved Reference** | An approved Artifact recorded by an Asset Document and available for downstream consumption. | Final file |
| **Variant** | The unique name of an Approved Reference within one Asset Document. | Index, first result |
| **Approval** | The explicit selection of one Artifact as an Approved Reference under a supplied Variant name. | Batch file scan |
| **Review** | An observation or decision recorded against an Artifact or Asset; it may request revision, provide design feedback, or lead to Approval. | Lifecycle state |
| **Supersession** | The recorded relationship in which a new Approved Reference replaces an older Variant for future selection without deleting history. | Deletion, overwrite |
| **Reference** | An Asset or Design Reference supplied as input to generate an Asset. | Workflow input |
| **External Reference** | A Reference to another Asset's Approved Reference; it creates an execution prerequisite when that Asset still needs generation. | Workflow input |
| **Design Reference** | A Reference owned by the current Asset Document; it does not create a cross-Asset execution prerequisite. | External reference |
| **Materialized Reference** | A Design Reference created as a provenance-preserving snapshot of an external Approved Reference. | Copied path |
| **Execution Dependency** | A prerequisite between generation tasks derived from an External Reference, used by Circle DAG batching. | Document workflow relation |
| **Workflow Prerequisite** | A Profile-level rule describing what context an Agent needs to author a document; it does not participate in the Circle DAG. | Reference, execution dependency |
| **Materialization** | A Pack workflow operation that derives or reconciles Production Asset Documents from a Workflow Document's machine-readable plan. | Circle creation |
| **Circle** | An immutable, user-scoped execution plan that schedules selected Production Asset Documents into tasks and preserves their Artifact history. | Workflow plan, document plan |
| **Profile** | A category-scoped operation profile that is either workflow guidance or a fixed production recipe. | Model choice, preset |

## Video Planning

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Shotlist** | The planning document that specifies the intended Shots and their narrative order. | Shot, clip list |
| **Clip** | A continuous planned video segment whose Profile may produce frame references, video, or both. | Beat |
| **Shot** | One AI video generation node whose Profile produces video and may consume Clips or other permitted references. | Generic task, clip (when it contains multiple Clips) |
| **Shotsdeck** | A Production Asset Document that orders Shots, uses lightweight first/last-frame information for continuity, and may generate a composite or continuity Artifact. | Shotlist, storyboard |
| **Frame Reference** | A first or last frame extracted or approved for continuity between Clips or Shots. | Design Reference |
| **Frame Directive** | The `@FRAME:` shorthand used only by a Shotsdeck continuity Profile to feed a previous output frame into a continuous i2v workflow. | General reference syntax |

## Workflow and Configuration

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Pack** | A versioned, composable definition of categories, profiles, type-level rules, and Skills for a production domain. | Project, plugin bundle |
| **Pack Stack** | The ordered set of Packs explicitly activated by a project. | Implicit merge |
| **Category** | The Asset type and Pack schema selector recorded in every Asset Document. | Asset type (use `category` in data and commands) |
| **Work Packet** | A short-lived, CLI-derived instruction for an Agent describing one allowed next action, its Profile prerequisites, and Circle execution state. | Task document |
| **Action Policy** | The Pack default, optionally tightened by the project, that decides whether an Agent may draft, compile, execute, approve, or sync. | Skill advice |

## Relationships

- An **Asset Document** represents exactly one **Asset**.
- A **Production Asset Document** has an executable **Profile**; a **Workflow Document** does not.
- A normal approved Task moves its Asset from drafting to approved; an approved **Revision** moves it to **Syncing**.
- A **Syncing** Asset must complete **Synchronization** before it is reproduced or consumed through an External Reference; unrelated production may continue.
- An **Asset Document** can compile to many **Production Tasks**; each task can produce many **Artifacts**.
- An **Asset Document** can publish one or more **Approved References**.
- An **Approval** supplies a non-empty, unique **Variant**; an output filename is provenance, not a Variant name.
- A **Supersession** retains the older **Approved Reference** while recording which new Variant replaces it.
- When an Asset Document has two or more **Approved References**, every downstream external reference must select a **Variant**.
- A **Reference** is supplied to generation and is recorded in `refs`.
- An **External Reference** derives an **Execution Dependency** when its target Asset must be generated before the consumer task can run.
- A **Design Reference** and a **Materialized Reference** are local and do not derive an **Execution Dependency**.
- An External Reference requires its source Asset Document to exist; a retained Artifact without its source document can only be attached as a local Design Reference.
- A **Workflow Prerequisite** is declared by a **Profile** and describes what an Agent needs to create or advance an Asset Document; it is separate from `refs` and does not participate in the Circle DAG.
- A **Shotlist** plan drives **Materialization** of Clip and Shot documents; it does not select or create a **Circle**.
- A **Circle** is created from an explicit document or directory scope and owns task scheduling and Artifact history, not document-generation workflow.
- A **Shotlist** plans one or more **Shots**; a **Shot** may consume one or more **Clips**, and one **Clip** may be one **Shot**.
- A **Clip** may consume character, scene, prop, storyboard, or other Pack-permitted references; no reference category is universally required.
- A **Shot** preferentially consumes Clips, but may consume storyboard, character, scene, or other Pack-permitted references directly.
- A **Shotsdeck** orders **Shots**, exposes **Frame References** for continuity, and may produce an Artifact.
- A **Frame Directive** is a Profile-scoped convenience for Shotsdeck continuity; ordinary cross-Asset references use `@asset:variant`.

## Example Dialogue

> **Dev:** "This Shot needs the character's casual outfit, but I do not want its generation blocked by later character changes."
>
> **Domain expert:** "Materialize the `casual` Approved Reference as a Design Reference in the Shot's Asset Document. It keeps provenance, makes the reference local, and removes the Circle execution prerequisite."
>
> **Dev:** "The Shotlist has a three-part movement. Should I create one Clip or three?"
>
> **Domain expert:** "Create Clips for the continuous segments you need to reason about or establish frame continuity for. The final Shot may compose all three Clips, or a single Clip can be its own Shot."
>
> **Dev:** "The character Asset has several Approved References. Can the Shot use `@luran`?"
>
> **Domain expert:** "No. It must use an explicit Variant such as `@luran:casual`."
>
> **Dev:** "I approved a new casual outfit. Can I overwrite `casual`?"
>
> **Domain expert:** "No. Approve it as a new Variant and record a Supersession of `casual`; the old Artifact stays traceable."

## Flagged Ambiguities

- **Frame Directive resolution:** `@FRAME:` is retained for the Shotsdeck continuity workflow; its durable provenance and resolution contract need to be specified separately from ordinary `refs`.
- **Workflow-prerequisite declaration:** the exact Profile syntax for describing document-creation context is not yet decided; it must remain separate from `refs` and Circle execution dependencies.
- **Beat:** historical Packs used Beat near the current meaning of Clip. Use **Clip** for the video-production concept; retain Beat only if a future Pack needs a distinct narrative-unit concept.
