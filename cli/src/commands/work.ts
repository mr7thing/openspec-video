import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { loadProjectConfig } from '../core/ProjectConfig';
import { resolveDocumentContract } from '../core/PackContracts';
import { AssetManager } from '../core/AssetManager';
import { getProjectDir } from '../utils/configLoader';
import { materializeWorkflowDocument } from '../core/Materializer';

interface WorkCheckResult {
  asset: string;
  category?: string;
  status?: string;
  profile?: { name: string; kind: string; capability?: string; model?: string; skill?: string };
  issues: Array<{ code: string; message: string }>;
  nextAction?: string;
}

function resolveAssetPath(projectRoot: string, selector: string): string | null {
  const direct = path.resolve(projectRoot, selector);
  if (fs.existsSync(direct)) return direct;
  return AssetManager.findAssetFilePathUnder(getProjectDir(projectRoot, 'videospec'), selector) || null;
}

export function registerWorkCommands(program: Command): void {
  const work = program.command('work').description('Agent-facing workflow checks and work packets');
  work.command('check <asset>').option('--json', 'Emit structured output').action((asset: string, options: { json?: boolean }) => {
    const projectRoot = process.cwd();
    const result: WorkCheckResult = { asset, issues: [] };
    try {
      const filePath = resolveAssetPath(projectRoot, asset);
      if (!filePath) throw new Error(`Asset document not found: ${asset}`);
      const { frontmatter } = FrontmatterParser.parseRaw(fs.readFileSync(filePath, 'utf8'));
      result.asset = path.basename(filePath, '.md').replace(/^@/, '');
      result.category = frontmatter.category;
      result.status = frontmatter.status || 'drafting';
      if (!result.category) result.issues.push({ code: 'CATEGORY_MISSING', message: 'Asset document has no category' });
      if (result.status === 'syncing') {
        result.issues.push({ code: 'SYNC_REQUIRED', message: 'Approved revision must be synchronized before this asset is consumed or reproduced' });
        result.nextAction = `opsv sync ${result.asset}`;
      }
      if (result.category) {
        const config = loadProjectConfig(projectRoot);
        const contract = resolveDocumentContract(projectRoot, result.category, frontmatter.profile, config);
        result.profile = {
          name: contract.profileName,
          kind: contract.profile.kind,
          capability: contract.profile.capability,
          model: contract.boundModel,
          skill: contract.profile.skill,
        };
        if (!result.nextAction) {
          result.nextAction = contract.profile.kind === 'workflow'
            ? `Use skill ${contract.profile.skill || contract.profileName}`
            : `opsv circle create --dir ${path.dirname(path.relative(projectRoot, filePath))}`;
        }
      }
    } catch (error: any) {
      result.issues.push({ code: 'WORK_CHECK_FAILED', message: error.message });
    }
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`${result.asset}: ${result.issues.length === 0 ? 'ready' : 'blocked'}`);
      for (const issue of result.issues) console.log(`  ${issue.code}: ${issue.message}`);
      if (result.nextAction) console.log(`  Next: ${result.nextAction}`);
    }
    if (result.issues.length > 0) process.exitCode = 1;
  });

  program.command('materialize <workflow-doc>')
    .description('Create missing production document scaffolds from a workflow document plan')
    .option('--dry-run', 'Report changes without writing files')
    .action((workflowDoc: string, options: { dryRun?: boolean }) => {
      try {
        const projectRoot = process.cwd();
        const workflowPath = resolveAssetPath(projectRoot, workflowDoc);
        if (!workflowPath) throw new Error(`Workflow document not found: ${workflowDoc}`);
        const { frontmatter } = FrontmatterParser.parseRaw(fs.readFileSync(workflowPath, 'utf8'));
        if (!frontmatter.category) throw new Error('Workflow document has no category');
        const contract = resolveDocumentContract(projectRoot, frontmatter.category, frontmatter.profile, loadProjectConfig(projectRoot));
        const result = materializeWorkflowDocument(projectRoot, workflowPath, contract, !!options.dryRun);
        for (const file of result.created) console.log(`${options.dryRun ? 'Would create' : 'Created'}: ${file}`);
        for (const file of result.existing) console.log(`Existing: ${file}`);
      } catch (error: any) {
        console.error(error.message);
        process.exitCode = 1;
      }
    });
}
