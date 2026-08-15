// ============================================================================
// OpsV Review Read Projection
// Composes canonical document reads, legacy outputs, and preview descriptors.
// ============================================================================

import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { ReviewStrategy } from '../core/ReviewStrategy';
import { DocumentInfo, DocumentOutput } from '../types/ManifestSchema';
import { parseAssetDocument } from '../canonical/parser/CanonicalNormalizer';
import { CanonicalAsset } from '../canonical/schema';
import { inferMediaType } from '../canonical/artifacts/mediaProbe';
import { ArtifactPreviewAdapter, PreviewDescriptor } from './ArtifactPreviewAdapter';

export interface ReviewAssetSummary {
  assetId: string;
  circle: string;
  category: string;
  lifecycleState: string;
  previewKinds: string[];
  hasArtifacts: boolean;
  hasCanonicalTimeline: boolean;
  segmentCount: number;
}

export interface ReviewGraphNode {
  id: string;
  kind: 'asset';
  label: string;
}

export interface ReviewGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: 'depends-on';
  relation: 'references';
}

export interface ReviewWorkspaceProjection {
  projectionRevision: string;
  assets: ReviewAssetSummary[];
  graph: {
    nodes: ReviewGraphNode[];
    edges: ReviewGraphEdge[];
  };
  capabilities: {
    timeline: boolean;
    canvas: boolean;
    localArtifactPlayback: boolean;
  };
}

export interface ReviewArtifactProjection {
  artifactId: string;
  revisionId: string;
  type: string;
  uriKind: 'local';
  preview: PreviewDescriptor;
}

export interface ReviewFocusProjection {
  projectionRevision: string;
  asset: {
    assetId: string;
    circle: string;
    category: string;
    lifecycleState: string;
  };
  timeline?: {
    segments: Array<{
      id: string;
      start: number;
      end: number;
      prompt?: string;
    }>;
  };
  artifacts: ReviewArtifactProjection[];
  references: Array<{
    id: string;
    namespace: string;
    variant?: string;
    state?: string;
    relation: 'production-dependency' | 'context';
    found: boolean;
  }>;
  graphNeighborhood: {
    nodes: ReviewGraphNode[];
    edges: ReviewGraphEdge[];
  };
}

interface ParsedDocument {
  doc: DocumentInfo;
  canonical?: CanonicalAsset;
}

export class ReviewReadProjectionService {
  constructor(
    private readonly strategy: ReviewStrategy,
    private readonly previewAdapter: ArtifactPreviewAdapter,
    private readonly projectRoot: string,
    private readonly queueRoot: string,
  ) {}

  getWorkspace(): ReviewWorkspaceProjection {
    const parsed = this.listParsedDocuments();
    const nodes = parsed.map(({ doc }) => ({
      id: doc.docId,
      kind: 'asset' as const,
      label: doc.docId,
    }));
    const knownIds = new Set(nodes.map(node => node.id));
    const edges = parsed.flatMap(({ doc, canonical }) => canonical ? this.referenceEdges(doc, canonical, knownIds) : []);
    const assets = parsed.map(({ doc, canonical }) => this.toSummary(doc, canonical));
    const revision = digest({ assets, nodes, edges });

    return {
      projectionRevision: revision,
      assets,
      graph: { nodes, edges },
      capabilities: {
        timeline: true,
        canvas: true,
        localArtifactPlayback: true,
      },
    };
  }

  async getFocus(assetId: string, options: { probe?: boolean } = {}): Promise<ReviewFocusProjection | null> {
    const doc = this.strategy.findDocumentById(assetId);
    if (!doc) return null;

    const parsed = this.parseDocument(doc);
    const canonical = parsed.canonical;
    const artifacts = await Promise.all(doc.outputs.map(output => this.toArtifact(output, options)));
    const knownIds = new Set(this.strategy.listDocuments().map(item => item.docId));
    const edges = canonical ? this.referenceEdges(doc, canonical, knownIds) : [];
    const neighborhoodNodes = new Map<string, ReviewGraphNode>();
    neighborhoodNodes.set(doc.docId, { id: doc.docId, kind: 'asset', label: doc.docId });
    for (const edge of edges) {
      neighborhoodNodes.set(edge.target, { id: edge.target, kind: 'asset', label: edge.target });
    }

    const references = [
      ...(canonical?.refs.external ?? []).map(ref => ({ ...ref, relation: 'production-dependency' as const })),
      ...(canonical?.refs.design ?? []).map(ref => ({ ...ref, relation: 'context' as const })),
    ].map(ref => ({
      id: ref.id,
      namespace: ref.namespace,
      variant: ref.variant,
      state: ref.state,
      relation: ref.relation,
      found: knownIds.has(ref.id),
    }));

    const payload = {
      assetId: doc.docId,
      lifecycleState: doc.status,
      timeline: canonical?.timeline,
      artifacts: artifacts.map(artifact => ({
        artifactId: artifact.artifactId,
        revisionId: artifact.revisionId,
        type: artifact.type,
        availability: artifact.preview.availability,
      })),
      references,
      edges,
    };

    return {
      projectionRevision: digest(payload),
      asset: {
        assetId: doc.docId,
        circle: doc.circle,
        category: doc.category,
        lifecycleState: doc.status,
      },
      timeline: canonical?.timeline
        ? { segments: canonical.timeline.segments.map(segment => ({
          id: segment.id,
          start: segment.start,
          end: segment.end,
          prompt: segment.prompt,
        })) }
        : undefined,
      artifacts,
      references,
      graphNeighborhood: {
        nodes: Array.from(neighborhoodNodes.values()),
        edges,
      },
    };
  }

  private listParsedDocuments(): ParsedDocument[] {
    return this.strategy.listDocuments().map(summary => {
      const doc = summary.content ? summary : (this.strategy.findDocumentById(summary.docId) ?? summary);
      return this.parseDocument(doc);
    });
  }

  private parseDocument(doc: DocumentInfo): ParsedDocument {
    if (!doc.content) return { doc };
    try {
      const canonical = parseAssetDocument(doc.content, {
        docPath: path.relative(this.projectRoot, doc.docPath).replace(/\\/g, '/'),
      });
      return { doc, canonical };
    } catch {
      return { doc };
    }
  }

  private toSummary(doc: DocumentInfo, canonical: CanonicalAsset | undefined): ReviewAssetSummary {
    const previewKinds = Array.from(new Set(doc.outputs.map(output => inferMediaType(output.path))));
    return {
      assetId: doc.docId,
      circle: doc.circle,
      category: doc.category,
      lifecycleState: doc.status,
      previewKinds,
      hasArtifacts: doc.outputs.length > 0,
      hasCanonicalTimeline: Boolean(canonical?.timeline?.segments.length),
      segmentCount: canonical?.timeline?.segments.length ?? 0,
    };
  }

  private referenceEdges(
    doc: DocumentInfo,
    canonical: CanonicalAsset,
    knownIds: Set<string>,
  ): ReviewGraphEdge[] {
    return canonical.refs.external
      .filter(ref => knownIds.has(ref.id))
      .map(ref => ({
        id: `${doc.docId}->${ref.id}:depends-on`,
        source: doc.docId,
        target: ref.id,
        kind: 'depends-on' as const,
        relation: 'references' as const,
      }));
  }

  private async toArtifact(output: DocumentOutput, options: { probe?: boolean }): Promise<ReviewArtifactProjection> {
    const artifactId = legacyArtifactId(output.path, output.circle);
    const revisionId = legacyRevisionId(output.path, this.queueRoot, output.circle);
    const type = inferMediaType(output.path);
    const preview = await this.previewAdapter.describe({
      id: artifactId,
      revisionId,
      uri: output.path,
      type,
    }, options);
    return {
      artifactId,
      revisionId,
      type,
      uriKind: 'local',
      preview,
    };
  }
}

function legacyArtifactId(relativePath: string, circle: string): string {
  return `legacy-artifact:${digest({ circle, relativePath }).slice(0, 24)}`;
}

function legacyRevisionId(relativePath: string, queueRoot: string, circle: string): string {
  const candidate = path.join(queueRoot, relativePath);
  try {
    const stat = fs.statSync(candidate);
    return `legacy:${digest({ circle, relativePath, size: stat.size, modifiedAtMs: stat.mtimeMs }).slice(0, 24)}`;
  } catch {
    return `legacy:${digest({ circle, relativePath }).slice(0, 24)}`;
  }
}

function digest(value: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}
