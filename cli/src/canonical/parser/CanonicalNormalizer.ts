// ============================================================================
// Canonical Normalizer — Markdown document → CanonicalAsset
//
// Composes the frontmatter conversion (P1) and the body grammar parse (P2)
// into one entry point. Segment drafts that carry a timeline range become
// CanonicalSegments; everything else stays in `bodyRaw` (lossless).
// ============================================================================

import { FrontmatterParser } from '../../core/FrontmatterParser';
import { CanonicalAsset, CanonicalAssetSchema, CanonicalDocument, CanonicalSegment } from '../schema';
import { fromFrontmatter } from '../schema/convert';
import { parseBody, SegmentDraft } from './BodyGrammarParser';

export interface ParseAssetOptions {
  /** Document path relative to the project root, when known. */
  docPath?: string;
}

/**
 * Parse a Markdown Asset Document into a CanonicalAsset.
 *
 * The document frontmatter is converted via `fromFrontmatter` (raw fidelity
 * preserved), the body is parsed for semantic sections and segment drafts,
 * and complete segments are projected into `asset.timeline`.
 */
export function parseAssetDocument(content: string, opts: ParseAssetOptions = {}): CanonicalAsset {
  const { frontmatter, body } = FrontmatterParser.parseRaw(content);
  const doc = fromFrontmatter(frontmatter, body);
  const parsed = parseBody(body);

  const document: CanonicalDocument = {
    ...doc,
    semanticSections: parsed.semanticSections,
    approvedRefSection: parsed.approvedRefSection,
    designRefSection: parsed.designRefSection,
  };

  const segments = resolveSegments(parsed.segmentDrafts);

  const asset: CanonicalAsset = {
    id: document.id ?? inferAssetId(document, opts.docPath),
    category: document.category,
    docPath: opts.docPath ?? '',
    document,
    timeline: segments.length > 0 ? { segments } : undefined,
    refs: document.refs,
    approvedRefs: [],
    status: document.status,
    artifacts: [],
    reviews: [],
  };

  return CanonicalAssetSchema.parse(asset);
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function resolveSegments(drafts: SegmentDraft[]): CanonicalSegment[] {
  const segments: CanonicalSegment[] = [];
  for (const draft of drafts) {
    if (draft.start === undefined || draft.end === undefined) continue;
    segments.push({
      id: draft.id ?? `segment_${segments.length + 1}`,
      start: draft.start,
      end: draft.end,
      subjects: [],
      prompt: draft.rawBody || undefined,
    });
  }
  return segments;
}

function inferAssetId(document: CanonicalDocument, docPath?: string): string {
  if (docPath) {
    const base = docPath.split('/').pop() ?? docPath;
    return base.replace(/\.md$/i, '');
  }
  return 'asset';
}
