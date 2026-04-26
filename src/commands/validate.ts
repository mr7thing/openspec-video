import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import {
    AssetTypeEnum,
    StatusEnum,
    BaseFrontmatterSchema,
    ProjectFrontmatterSchema,
    ShotDesignFrontmatterSchema,
    ShotProductionFrontmatterSchema,
} from '../types/FrontmatterSchema';
import { logger } from '../utils/logger';

// ============================================================================
// opsv validate — Markdown 文档 frontmatter 验证
// 验证 videospec/ 目录下所有 .md 文件的 YAML frontmatter
// ============================================================================

interface ValidationIssue {
    file: string;
    line?: number;
    field: string;
    message: string;
    suggestion?: string;
}

export function registerValidateCommand(program: Command, VERSION: string) {
    program
        .command('validate')
        .description('验证 videospec/ 目录下 Markdown 文档的 YAML frontmatter')
        .option('-d, --dir <path>', '指定目录（默认: videospec/）', 'videospec')
        .option('--fix', '自动修复可修复的问题', false)
        .action(async (options) => {
            const projectRoot = process.cwd();
            const targetDir = path.resolve(projectRoot, options.dir);

            logger.info(`\n🔍 OpsV Validate v${VERSION}`);
            logger.info(`   目录: ${targetDir}`);

            const dirExists = await fs.access(targetDir).then(() => true).catch(() => false);
            if (!dirExists) {
                logger.error(`❌ 目录不存在: ${targetDir}`);
                process.exit(1);
            }

            const issues: ValidationIssue[] = [];
            const files = await findMarkdownFiles(targetDir);

            if (files.length === 0) {
                logger.info('ℹ️ 未找到 .md 文件');
                return;
            }

            logger.info(`   文件: ${files.length} 个\n`);

            for (const file of files) {
                const fileIssues = await validateFile(file);
                issues.push(...fileIssues);
            }

            // 输出报告
            if (issues.length === 0) {
                logger.info('✅ 所有文档验证通过');
                logger.info('💡 建议执行 opsv circle status 查看 Circle 状态');
            } else {
                logger.error(`❌ 发现 ${issues.length} 个问题:\n`);
                for (const issue of issues) {
                    const location = issue.line ? `:${issue.line}` : '';
                    logger.error(`  📄 ${issue.file}${location}`);
                    logger.error(`     字段: ${issue.field}`);
                    logger.error(`     问题: ${issue.message}`);
                    if (issue.suggestion) {
                        logger.error(`     建议: ${issue.suggestion}`);
                    }
                    logger.error('');
                }
                process.exit(1);
            }
        });
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    const dirExists = await fs.access(dir).then(() => true).catch(() => false);
    if (!dirExists) return files;

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await findMarkdownFiles(fullPath));
        } else if (entry.name.endsWith('.md')) {
            files.push(fullPath);
        }
    }

    return files;
}

async function validateFile(filePath: string): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(process.cwd(), filePath);

    // 提取 YAML frontmatter
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);

    if (!frontmatterMatch) {
        issues.push({
            file: relativePath,
            field: 'frontmatter',
            message: '未找到 YAML frontmatter（需要 --- 包裹）',
            suggestion: '在文档开头添加 --- ... --- 包裹的 YAML frontmatter'
        });
        return issues;
    }

    let frontmatter: any;
    try {
        frontmatter = yaml.load(frontmatterMatch[1]);
        if (typeof frontmatter !== 'object' || frontmatter === null) {
            throw new Error('frontmatter 必须是对象');
        }
    } catch (e) {
        issues.push({
            file: relativePath,
            field: 'frontmatter',
            message: `YAML 解析失败: ${(e as Error).message}`,
            suggestion: '检查 YAML 语法（缩进、引号、特殊字符）'
        });
        return issues;
    }

    // 根据 type 选择 schema
    const docType = frontmatter.type;
    let schema;

    switch (docType) {
        case 'project':
            schema = ProjectFrontmatterSchema;
            break;
        case 'shot-design':
            schema = ShotDesignFrontmatterSchema;
            break;
        case 'shot-production':
            schema = ShotProductionFrontmatterSchema;
            break;
        case 'character':
        case 'prop':
        case 'costume':
        case 'scene':
            schema = BaseFrontmatterSchema;
            break;
        default:
            issues.push({
                file: relativePath,
                field: 'type',
                message: `未知的 type: "${docType}"`,
                suggestion: `可选值: ${AssetTypeEnum.options.join(', ')}`
            });
            return issues; // 无法继续验证
    }

    // Shot 文件 id ↔ filename 一致性校验
    if (docType === 'shot-production') {
        const idFromFrontmatter = frontmatter.id;
        if (idFromFrontmatter) {
            // 从文件名前缀提取 id（如 shot_01.md → shot_01）
            const fileName = path.basename(filePath, '.md');
            if (idFromFrontmatter !== fileName) {
                issues.push({
                    file: relativePath,
                    field: 'id',
                    message: `frontmatter 中 id "${idFromFrontmatter}" 与文件名 "${fileName}" 不一致`,
                    suggestion: 'shot 文件的 id 应由文件名推导，frontmatter 中无需声明 id'
                });
            }
        }
    }

    // Zod 验证
    const result = schema.safeParse(frontmatter);

    if (!result.success) {
        for (const error of result.error.errors) {
            const field = error.path.join('.');
            issues.push({
                file: relativePath,
                field,
                message: error.message,
            });
        }
    }

    // Approved References 与 status 一致性检查
    const docStatus = frontmatter.status;
    const hasApprovedSection = content.includes('## Approved References');
    
    // 解析 Approved References 区域中的图片引用数量
    let approvedImageCount = 0;
    if (hasApprovedSection) {
        const sectionMatch = content.match(/##\s*Approved\s+References\s*\n([\s\S]*?)(?=\n##\s|$)/i);
        if (sectionMatch) {
            const imgMatches = sectionMatch[1].match(/!\[[^\]]*\]\([^)]+\)/g);
            approvedImageCount = imgMatches ? imgMatches.length : 0;
        }
    }

    // 规则1: status 为 approved 的非 project 文档必须有 Approved References
    if (docStatus === 'approved' && docType !== 'project') {
        if (!hasApprovedSection || approvedImageCount === 0) {
            issues.push({
                file: relativePath,
                field: 'status + ## Approved References',
                message: `status 为 "approved" 但文档缺少有效的 Approved References（应有至少一张 approved 参考图）`,
                suggestion: '通过 opsv review 审批至少一张图片，或将 status 改为 drafting/draft'
            });
        }
    }

    // 规则2: 有 Approved References 的文档，status 应为 approved 或 pending_sync
    if (approvedImageCount > 0 && docStatus !== 'approved' && docStatus !== 'pending_sync') {
        issues.push({
            file: relativePath,
            field: 'status + ## Approved References',
            message: `文档包含 ${approvedImageCount} 张 Approved References 但 status 为 "${docStatus}"`,
            suggestion: '将 status 改为 approved 或 pending_sync，或移除 Approved References 区域中的图片引用'
        });
    }

    // 规则3: pending_sync 提醒 — 需 Agent 根据 prompt_en 完成 visual_detailed/visual_brief/refs 对齐
    if (docStatus === 'pending_sync') {
        const warnings: string[] = [];
        if (!frontmatter.visual_detailed) warnings.push('visual_detailed 缺失');
        if (!frontmatter.visual_brief) warnings.push('visual_brief 缺失');
        if (!frontmatter.refs || frontmatter.refs.length === 0) {
            if (content.includes('## Design References')) {
                warnings.push('refs 为空但存在 ## Design References（需同步）');
            }
        }
        if (warnings.length > 0) {
            issues.push({
                file: relativePath,
                field: 'pending_sync',
                message: `status 为 "pending_sync"，以下字段需根据 prompt_en 对齐: ${warnings.join(', ')}`,
                suggestion: '根据 prompt_en 翻译更新 visual_detailed，简化为 visual_brief，对齐 refs 与 ## Design References，完成后将 status 改为 approved'
            });
        } else {
            issues.push({
                file: relativePath,
                field: 'pending_sync',
                message: 'status 为 "pending_sync"，所有字段已填充，确认对齐后可将 status 改为 approved',
                suggestion: '检查 visual_detailed/visual_brief/refs 是否与 prompt_en 一致，确认后改为 approved'
            });
        }
    }

    // 规则4: prompt_en 与 visual_detailed 一致性检查（approved 状态才报 error，pending_sync 已由规则3覆盖）
    if (docStatus === 'approved' && frontmatter.prompt_en && frontmatter.visual_detailed) {
        const promptEn = frontmatter.prompt_en as string;
        const detailed = frontmatter.visual_detailed as string;
        if (!detailed.includes(promptEn.substring(0, 50)) && detailed.length < promptEn.length * 0.3) {
            issues.push({
                file: relativePath,
                field: 'prompt_en + visual_detailed',
                message: 'prompt_en 与 visual_detailed 可能不一致（visual_detailed 过短或未反映 prompt_en 内容）',
                suggestion: '根据 prompt_en 更新 visual_detailed（翻译+补充生成参数）'
            });
        }
    }

    return issues;
}
