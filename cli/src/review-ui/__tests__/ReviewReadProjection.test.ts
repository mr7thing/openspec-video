import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReviewStrategy } from '../../core/ReviewStrategy';
import { DocumentInfo } from '../../types/ManifestSchema';
import { ArtifactPreviewAdapter } from '../ArtifactPreviewAdapter';
import { ReviewReadProjectionService } from '../ReviewReadProjection';

function makeDoc(docId: string, content: string, outputs: DocumentInfo['outputs'] = []): DocumentInfo {
  return {
    docId,
    docPath: `/project/videospec/${docId}.md`,
    circle: 'circle',
    category: docId === 'hero' ? 'shot' : 'reference',
    status: 'review',
    content,
    outputs,
  };
}

describe('ReviewReadProjectionService', () => {
  let projectRoot: string;
  let queueRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-review-project-'));
    queueRoot = path.join(projectRoot, 'opsv-queue');
    fs.mkdirSync(path.join(queueRoot, 'circle', 'provider'), { recursive: true });
    fs.writeFileSync(path.join(queueRoot, 'circle', 'provider', 'hero.mp4'), 'video');
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('shares asset summaries and explicit production dependency edges', async () => {
    const hero = makeDoc('hero', `---\nid: hero\ncategory: shot\nstatus: drafting\nrefs:\n  image:\n    '@ref': [reference/ref.png]\n---\n\n### Shot 1\n0-4s\n\nA hero enters.`, [{
      circle: 'circle', provider: 'provider', filename: 'hero.mp4', path: 'circle/provider/hero.mp4',
    }]);
    const ref = makeDoc('ref', `---\nid: ref\ncategory: reference\nstatus: approved\n---\n\nReference image.`);
    const docs = [hero, ref];
    const strategy = {
      listDocuments: jest.fn(() => docs),
      findDocumentById: jest.fn((id: string) => docs.find(doc => doc.docId === id) || null),
    } as unknown as ReviewStrategy;
    const service = new ReviewReadProjectionService(strategy, new ArtifactPreviewAdapter(queueRoot, 'test-secret'), projectRoot, queueRoot);

    const workspace = service.getWorkspace();
    expect(workspace.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: 'hero', hasArtifacts: true, hasCanonicalTimeline: true, segmentCount: 1 }),
    ]));
    expect(workspace.graph.edges).toEqual([
      expect.objectContaining({ source: 'hero', target: 'ref', kind: 'depends-on', relation: 'references' }),
    ]);

    const focus = await service.getFocus('hero');
    expect(focus?.timeline?.segments[0]).toEqual(expect.objectContaining({ start: 0, end: 4 }));
    expect(focus?.artifacts[0].preview.previewUrl).toMatch(/^\/api\/review\/preview\//);
    expect(focus?.references[0]).toEqual(expect.objectContaining({ id: 'ref', relation: 'production-dependency', found: true }));
  });

  it('does not promote design references into dependency edges', () => {
    const hero = makeDoc('hero', `---\nid: hero\ncategory: shot\nstatus: review\nrefs:\n  design:\n    - '@ref'\n---\n\nDesign context.`);
    const ref = makeDoc('ref', `---\nid: ref\ncategory: reference\nstatus: approved\n---\n\nReference image.`);
    const docs = [hero, ref];
    const strategy = {
      listDocuments: jest.fn(() => docs),
      findDocumentById: jest.fn((id: string) => docs.find(doc => doc.docId === id) || null),
    } as unknown as ReviewStrategy;
    const service = new ReviewReadProjectionService(strategy, new ArtifactPreviewAdapter(queueRoot, 'test-secret'), projectRoot, queueRoot);

    expect(service.getWorkspace().graph.edges).toEqual([]);
  });
});
