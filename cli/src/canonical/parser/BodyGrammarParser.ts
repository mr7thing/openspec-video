// ============================================================================
// Body Grammar Parser — gives the Markdown body formal semantics
//
// Recognizes a small, stable set of conventions without inventing a new DSL:
//   - `## Approved References` / `## Design References` sections
//     (H3 subsections like `### image` belong to their parent H2)
//   - semantic blocks: `## Subject` / `## Scene` / `## Action` / `## Camera` /
//     `### Timeline`
//   - timeline ranges: `0-4s`, `00:32 - 00:36`, `0s - 4s`
//   - shot/segment boundaries: `### Shot 023`, `## 镜头 NN-1｜标题 时长 Ns`
//
// Everything unrecognized stays in `bodyRaw` — the parser is lossless, not
// lossy. Segment/timeline fields the parser is not confident about are left
// to downstream consumers or later refinements.
// ============================================================================

export interface SegmentDraft {
  id?: string;
  title?: string;
  start?: number;
  end?: number;
  /** The raw heading line, e.g. `### Shot 023`. */
  rawHeading: string;
  /** The raw section content (everything after the heading). */
  rawBody: string;
}

export interface ParsedBody {
  /** Recognized semantic blocks, keyed lower-case: subject/scene/action/camera/timeline. */
  semanticSections: Record<string, string>;
  /** Recognized shot/segment boundaries with optional timeline ranges. */
  segmentDrafts: SegmentDraft[];
  approvedRefSection?: string;
  designRefSection?: string;
  /** The full original body — lossless fidelity. */
  bodyRaw: string;
}

interface Section {
  heading: string;
  rawHeading: string;
  content: string;
  level: number;
  /** H3 subsections nested under this H2. */
  subsections: Section[];
}

const SEMANTIC_HEADINGS = new Set(['subject', 'scene', 'action', 'camera', 'timeline']);
const SHOT_HEADING_RE = /^#{2,3}\s+(?:Shot|镜头|segment)\s+([\w\-]+)/iu;
const INLINE_RANGE_RE = /(\d+(?:\.\d+)?)\s*(?:s|sec)?\s*-\s*(\d+(?:\.\d+)?)\s*(?:s|sec)?/u;
const CLOCK_RANGE_RE = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/u;

/**
 * Parse a document body into recognized semantic structure.
 * `bodyRaw` always equals the input — no information is lost.
 */
export function parseBody(body: string): ParsedBody {
  const sections = splitSections(body);
  const semanticSections: Record<string, string> = {};
  const segmentDrafts: SegmentDraft[] = [];
  let approvedRefSection: string | undefined;
  let designRefSection: string | undefined;

  for (const sec of sections) {
    if (/^##\s*Approved\s+References\b/i.test(sec.rawHeading)) {
      approvedRefSection = fullSectionContent(sec);
      continue;
    }
    if (/^##\s*Design\s+References\b/i.test(sec.rawHeading)) {
      designRefSection = fullSectionContent(sec);
      continue;
    }

    collectSemantic(sec, semanticSections);

    const shot = parseShotSection(sec);
    if (shot) segmentDrafts.push(shot);
    for (const sub of sec.subsections) {
      const subShot = parseShotSection(sub);
      if (subShot) segmentDrafts.push(subShot);
    }
  }

  return {
    semanticSections,
    segmentDrafts,
    approvedRefSection,
    designRefSection,
    bodyRaw: body,
  };
}

/** Extract a timeline range from text: `0-4s`, `00:32 - 00:36`, `0s - 4s`. */
export function parseTimelineRange(text: string): { start: number; end: number } | null {
  const clock = text.match(CLOCK_RANGE_RE);
  if (clock) {
    const start = Number(clock[1]) * 60 + Number(clock[2]);
    const end = Number(clock[3]) * 60 + Number(clock[4]);
    return { start, end };
  }
  const inline = text.match(INLINE_RANGE_RE);
  if (inline) {
    const start = Number(inline[1]);
    const end = Number(inline[2]);
    if (end > start) return { start, end };
  }
  return null;
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function splitSections(body: string): Section[] {
  const sections: Section[] = [];
  const lines = body.split('\n');
  let currentH2: Section | null = null;
  let currentH3: Section | null = null;

  for (const line of lines) {
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const sec: Section = {
        heading: h[2].trim(),
        rawHeading: line.trim(),
        content: '',
        level,
        subsections: [],
      };
      if (level === 2) {
        sections.push(sec);
        currentH2 = sec;
        currentH3 = null;
      } else if (level === 3) {
        if (currentH2) {
          currentH2.subsections.push(sec);
          currentH3 = sec;
        } else {
          // Orphan H3 (no H2 parent) — top-level section; its body attaches here.
          sections.push(sec);
          currentH3 = sec;
        }
      } else {
        // H1 — treat as a top-level separator, not a semantic block.
        sections.push(sec);
        currentH2 = null;
        currentH3 = null;
      }
    } else {
      const target = currentH3 ?? currentH2;
      if (target) {
        target.content += target.content ? `\n${line}` : line;
      }
    }
  }
  return sections;
}

/** H2 content plus its H3 subsections, reconstructed with their headings. */
function fullSectionContent(sec: Section): string {
  let out = sec.content;
  for (const sub of sec.subsections) {
    out += out ? '\n' : '';
    out += `${sub.rawHeading}\n${sub.content}`;
  }
  return out;
}

function collectSemantic(sec: Section, into: Record<string, string>): void {
  const sem = sec.rawHeading.match(/^#{2,3}\s*([A-Za-z]+)\s*$/);
  if (sem && SEMANTIC_HEADINGS.has(sem[1].toLowerCase())) {
    into[sem[1].toLowerCase()] = sec.content;
  }
  for (const sub of sec.subsections) {
    const subSem = sub.rawHeading.match(/^#{2,3}\s*([A-Za-z]+)\s*$/);
    if (subSem && SEMANTIC_HEADINGS.has(subSem[1].toLowerCase())) {
      into[subSem[1].toLowerCase()] = sub.content;
    }
  }
}

function parseShotSection(sec: Section): SegmentDraft | null {
  const shot = sec.rawHeading.match(SHOT_HEADING_RE);
  if (!shot) return null;

  const draft: SegmentDraft = {
    id: shot[1],
    title: sec.heading,
    rawHeading: sec.rawHeading,
    rawBody: sec.content,
  };

  const range = parseTimelineRange(sec.content) ?? parseTimelineRange(sec.rawHeading);
  if (range) {
    draft.start = range.start;
    draft.end = range.end;
  }
  return draft;
}
