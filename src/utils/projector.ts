import fs from 'fs-extra';
import path from 'path';

/**
 * OpsV Projector Engine (v0.5)
 * 将 .agent 母本基因投影映射到不同编辑器环境
 */
export async function projectAgentTemplates(targetDir: string, tools: string[], templateBase: string) {
    const agentSource = path.join(templateBase, '.agent');
    
    // 1. 强制复制 .agent 核心
    if (fs.existsSync(agentSource)) {
        await fs.copy(agentSource, path.join(targetDir, '.agent'));
    }

    // 2. Claude Code 投影
    if (tools.includes('claude')) {
        await projectToClaude(targetDir, agentSource);
    }

    // 3. Codex / Cursor 投影
    if (tools.includes('codex') || tools.includes('cursor')) {
        await projectToCursor(targetDir, agentSource);
    }

    // 4. Trae 投影
    if (tools.includes('trae')) {
        await projectToTrae(targetDir, agentSource);
    }
}

async function projectToClaude(targetDir: string, agentSource: string) {
    // 汇总 AGENTS.md 和关键指令到 CLAUDE_INSTRUCTIONS.md
    const agentsMd = path.join(path.dirname(agentSource), 'AGENTS.md');
    let content = '# Claude Code Instructions for OpsV\n\n';
    if (fs.existsSync(agentsMd)) {
        content += await fs.readFile(agentsMd, 'utf-8');
    }
    await fs.writeFile(path.join(targetDir, 'CLAUDE_INSTRUCTIONS.md'), content);
}

async function projectToCursor(targetDir: string, agentSource: string) {
    // 汇总 Guardian 和 Creative 指令到 .cursorrules
    const guardian = path.join(agentSource, 'Guardian-Agent.md');
    const creative = path.join(agentSource, 'Creative-Agent.md');
    let rules = '';
    if (fs.existsSync(guardian)) rules += await fs.readFile(guardian, 'utf-8');
    if (fs.existsSync(creative)) rules += '\n\n' + await fs.readFile(creative, 'utf-8');
    
    await fs.writeFile(path.join(targetDir, '.cursorrules'), rules);
}

async function projectToTrae(targetDir: string, agentSource: string) {
    const traeRulesDir = path.join(targetDir, '.trae/rules');
    await fs.ensureDir(traeRulesDir);
    // 物理复用 Guardian 逻辑作为 Trae 的核心 Rule
    const guardian = path.join(agentSource, 'Guardian-Agent.md');
    if (fs.existsSync(guardian)) {
        await fs.copy(guardian, path.join(traeRulesDir, 'opsv_guardian.md'));
    }
}
