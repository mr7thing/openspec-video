import fs from 'fs';
import path from 'path';
import { FrontmatterParser } from './FrontmatterParser';
import { ResolvedDocumentContract } from './PackContracts';

interface PlanEntry {
  shot: string;
  clips?: string[];
}

export interface MaterializeResult {
  created: string[];
  existing: string[];
}

function readPlan(frontmatter: Record<string, unknown>): PlanEntry[] {
  if (!Array.isArray(frontmatter.plan)) throw new Error('Workflow document requires a plan array');
  const ids = new Set<string>();
  const clips = new Set<string>();
  return frontmatter.plan.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || typeof (raw as any).shot !== 'string') {
      throw new Error(`plan[${index}] requires a shot id`);
    }
    const entry = raw as PlanEntry;
    if (ids.has(entry.shot)) throw new Error(`plan contains duplicate shot id: ${entry.shot}`);
    ids.add(entry.shot);
    if (entry.clips && !Array.isArray(entry.clips)) throw new Error(`plan[${index}].clips must be an array`);
    for (const clip of entry.clips || []) {
      if (typeof clip !== 'string') throw new Error(`plan[${index}].clips must contain ids`);
      if (clips.has(clip)) throw new Error(`plan contains duplicate clip id: ${clip}`);
      clips.add(clip);
    }
    return entry;
  });
}

function scaffold(id: string, category: string, source: string): string {
  return `---\nid: ${id}\ncategory: ${category}\nstatus: drafting\nmaterialized_from: ${source}\nrefs: {}\n---\n\n# ${id}\n`;
}

export function materializeWorkflowDocument(
  projectRoot: string,
  workflowPath: string,
  contract: ResolvedDocumentContract,
  dryRun = false,
): MaterializeResult {
  if (contract.profile.kind !== 'workflow') throw new Error('materialize requires a workflow profile');
  if (!contract.profile.materialize) throw new Error(`Profile "${contract.profileName}" does not declare materialize rules`);
  const { frontmatter } = FrontmatterParser.parseRaw(fs.readFileSync(workflowPath, 'utf8'));
  const plan = readPlan(frontmatter);
  const source = path.basename(workflowPath, '.md').replace(/^@/, '');
  const result: MaterializeResult = { created: [], existing: [] };

  const create = (id: string, target: { directory: string; category: string } | undefined) => {
    if (!target) return;
    const filePath = path.resolve(projectRoot, target.directory, `${id}.md`);
    if (fs.existsSync(filePath)) {
      result.existing.push(filePath);
      return;
    }
    result.created.push(filePath);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, scaffold(id, target.category, source), 'utf8');
    }
  };

  for (const entry of plan) {
    create(entry.shot, contract.profile.materialize.shots);
    for (const clip of entry.clips || []) create(clip, contract.profile.materialize.clips);
  }
  return result;
}
