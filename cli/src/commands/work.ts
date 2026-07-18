import fs from 'fs';
import { Command } from 'commander';
import { buildAssetDocIndex } from '../core/AssetDocIndex';
import { buildWorkPacket, WorkPacket } from '../core/WorkPacket';
import { getProjectDir } from '../utils/configLoader';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { loadProjectConfig } from '../core/ProjectConfig';
import { resolveDocumentContract } from '../core/PackContracts';
import { materializeWorkflowDocument } from '../core/Materializer';
import path from 'path';

function output(packet: WorkPacket, json?: boolean): void {
  if (json) { console.log(JSON.stringify(packet, null, 2)); return; }
  console.log(`${packet.asset}: ${packet.issues.length ? 'blocked' : 'ready'}`);
  if (packet.primarySkill) console.log(`  Skill: ${packet.primarySkill.name}`);
  for (const issue of packet.issues) console.log(`  ${issue.code}: ${issue.message}`);
  if (packet.command) console.log(`  Next: ${packet.command}`);
}

export function registerWorkCommands(program: Command): void {
  const work = program.command('work').description('Agent-facing Work Packets');
  work.command('check <asset>').option('--json').action((asset, opts) => { try { const packet = buildWorkPacket(process.cwd(), asset); output(packet, opts.json); if (packet.issues.length) process.exitCode = 1; } catch (e: any) { console.error(e.message); process.exitCode = 1; } });
  work.command('next').option('--json').action((opts) => { try { const root = process.cwd(); const docs = buildAssetDocIndex(getProjectDir(root, 'videospec')).entries; const packets = [...docs.keys()].map((id) => buildWorkPacket(root, id)); const groups = { blocked: packets.filter(p => p.issues.length), production: packets.filter(p => !p.issues.length && p.profile?.kind === 'production'), workflow: packets.filter(p => !p.issues.length && p.profile?.kind === 'workflow') }; if (opts.json) console.log(JSON.stringify(groups, null, 2)); else Object.entries(groups).forEach(([name, values]) => { console.log(`${name}:`); values.forEach(p => console.log(`  ${p.asset} -> ${p.command || p.action}`)); }); } catch (e: any) { console.error(e.message); process.exitCode = 1; } });
  work.command('plan').option('--json').action((opts) => { try { const root = process.cwd(); const packets = [...buildAssetDocIndex(getProjectDir(root, 'videospec')).entries.keys()].map(id => buildWorkPacket(root, id)); if (opts.json) console.log(JSON.stringify(packets, null, 2)); else packets.forEach(p => console.log(`${p.asset}: ${p.action || 'blocked'}${p.command ? ` (${p.command})` : ''}`)); } catch (e: any) { console.error(e.message); process.exitCode = 1; } });

  program.command('materialize <workflow-doc>')
    .description('Create missing production document scaffolds from a workflow document plan')
    .option('--dry-run', 'Report changes without writing files')
    .action((workflowDoc: string, options: { dryRun?: boolean }) => {
      try {
        const root = process.cwd();
        const direct = path.resolve(root, workflowDoc);
        const workflowPath = fs.existsSync(direct) ? direct : buildAssetDocIndex(getProjectDir(root, 'videospec')).entries.get(workflowDoc)?.filePath;
        if (!workflowPath) throw new Error(`Workflow document not found: ${workflowDoc}`);
        const { frontmatter } = FrontmatterParser.parseRaw(fs.readFileSync(workflowPath, 'utf8'));
        if (!frontmatter.category) throw new Error('Workflow document has no category');
        const contract = resolveDocumentContract(root, frontmatter.category, frontmatter.profile, loadProjectConfig(root));
        const result = materializeWorkflowDocument(root, workflowPath, contract, !!options.dryRun);
        for (const file of result.created) console.log(`${options.dryRun ? 'Would create' : 'Created'}: ${file}`);
        for (const file of result.existing) console.log(`Existing: ${file}`);
      } catch (e: any) { console.error(e.message); process.exitCode = 1; }
    });
}
