import { Command } from 'commander';
import fs from 'fs-extra';
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

            if (!fs.existsSync(targetDir)) {
                logger.error(`❌ 目录不存在: ${targetDir}`);
                process.exit(1);
            }

            const issues: ValidationIssue[] = [];
            const files = findMarkdownFiles(targetDir);

            if (files.length === 0) {
                logger.info('ℹ️ 未找到 .md 文件');
                return;
            }

            logger.info(`   文件: ${files.length} 个\n`);

            for (const file of files) {
                const fileIssues = validateFile(file);
                issues.push(...fileIssues);
            }

            // 输出报告
            if (issues.length === 0) {
                logger.info('✅ 所有文档验证通过');
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

function findMarkdownFiles(dir: string): string[] {
    const files: string[] = [];

    if (!fs.existsSync(dir)) return files;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...findMarkdownFiles(fullPath));
        } else if (entry.name.endsWith('.md')) {
            files.push(fullPath);
        }
    }

    return files;
}

function validateFile(filePath: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const content = fs.readFileSync(filePath, 'utf-8');
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

    // Zod 验证
    const result = schema.safeParse(frontmatter);

    if (!result.success) {
        for (const error of result.error.errors) {
            const field = error.path.join('.');
            let suggestion: string | undefined;

            // 常见错误的建议
            if (field === 'status' && typeof frontmatter.status === 'string') {
                if (frontmatter.status === 'draft') {
                    suggestion = '应为 drafting（不是 draft）';
                }
            }

            issues.push({
                file: relativePath,
                field,
                message: error.message,
                suggestion
            });
        }
    }

    return issues;
}
