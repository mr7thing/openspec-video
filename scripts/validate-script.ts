#!/usr/bin/env npx ts-node
/**
 * Script.md 格式校验脚本
 * 检查 ## Shot NN 数量是否与 frontmatter total_shots 一致
 *
 * 用法: npx ts-node scripts/validate-script.ts [project-root]
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const projectRoot = process.argv[2] || process.cwd();
const scriptPath = path.join(projectRoot, 'videospec', 'shots', 'Script.md');

if (!fs.existsSync(scriptPath)) {
    console.error(`❌ 未找到 Script.md: ${scriptPath}`);
    process.exit(1);
}

const content = fs.readFileSync(scriptPath, 'utf-8');

// 解析 frontmatter
const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!fmMatch) {
    console.error('❌ Script.md 缺少 YAML frontmatter');
    process.exit(1);
}

const frontmatter = yaml.load(fmMatch[1]) as any;

// 统计正文中 ## Shot NN 的数量
const shotHeaders = content.match(/^##\s+Shot\s+\d+/gm) || [];
const actualCount = shotHeaders.length;
const declared = frontmatter.total_shots;

console.log(`📋 Script.md 格式校验`);
console.log(`   声明分镜数: ${declared || '(未声明)'}`);
console.log(`   实际分镜数: ${actualCount}`);

// 检查 type 字段
if (frontmatter.type !== 'shot-design') {
    console.warn(`⚠️  type 应为 'shot-design'，当前: '${frontmatter.type}'`);
}

// 检查 status 字段
if (!frontmatter.status) {
    console.warn(`⚠️  缺少 status 字段`);
}

// 检查数量一致性
if (declared && declared !== actualCount) {
    console.error(`❌ 分镜数不一致！声明 ${declared}，实际 ${actualCount}`);
    process.exit(1);
}

// 检查 refs 是否覆盖了所有 @ 引用
const atRefs = content.match(/@([a-zA-Z0-9_]+)/g) || [];
const uniqueAtRefs = [...new Set(atRefs.map(r => r.slice(1)))].filter(r => r !== 'FRAME');
const declaredRefs = frontmatter.refs || [];

const missingRefs = uniqueAtRefs.filter(r => !declaredRefs.includes(r));
if (missingRefs.length > 0) {
    console.warn(`⚠️  以下 @ 引用未在 frontmatter.refs 中声明: ${missingRefs.join(', ')}`);
}

console.log(`\n✅ 格式校验通过`);
