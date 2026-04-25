import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { logger } from '../utils/logger';

// ============================================================================
// opsv script — 聚合 shot_*.md 生成 Script.md
// v0.7: Shot 文件系统新命令
// ============================================================================

interface ShotSection {
    id: string;
    file: string;
    title: string;
    sectionTitle: string;
    body: string;
}

export function registerScriptCommand(program: Command, VERSION: string) {
    program
        .command('script')
        .description('聚合 videospec/shots/ 目录下的 shot_*.md 文件生成 Script.md')
        .option('-d, --dir <path>', '指定 shots 目录（默认: videospec/shots/）', 'videospec/shots')
        .option('-o, --output <path>', '指定输出文件（默认: {dir}/Script.md）')
        .option('--dry-run', '预览模式，不写入文件', false)
        .action(async (options) => {
            const projectRoot = process.cwd();
            const shotsDir = path.resolve(projectRoot, options.dir);
            const outputPath = options.output
                ? path.resolve(projectRoot, options.output)
                : path.join(shotsDir, 'Script.md');

            logger.info(`\n📜 OpsV Script v${VERSION}`);

            // 检查 shots 目录
            const dirExists = await fs.access(shotsDir).then(() => true).catch(() => false);
            if (!dirExists) {
                logger.error(`❌ 目录不存在: ${shotsDir}`);
                logger.error('   请确认 videospec/shots/ 目录存在');
                process.exit(1);
            }

            // 查找所有 shot_*.md 文件（排除 Script.md 和 Shotlist.md）
            const files = await fs.readdir(shotsDir);
            const shotFiles = files
                .filter(f => /^shot_\d+\.md$/i.test(f))
                .sort((a, b) => {
                    // 按数字排序: shot_01.md, shot_02.md, ...
                    const numA = parseInt(a.match(/shot_(\d+)/i)?.[1] || '0');
                    const numB = parseInt(b.match(/shot_(\d+)/i)?.[1] || '0');
                    return numA - numB;
                });

            if (shotFiles.length === 0) {
                logger.error(`❌ 未找到 shot_*.md 文件: ${shotsDir}`);
                process.exit(1);
            }

            logger.info(`   来源目录: ${shotsDir}`);
            logger.info(`   分镜数量: ${shotFiles.length}`);
            logger.info(`   输出文件: ${outputPath}`);
            if (options.dryRun) logger.info('   �Dry-run 模式，不写入文件');

            // 聚合内容
            const sections: ShotSection[] = [];
            for (const file of shotFiles) {
                const filePath = path.join(shotsDir, file);
                const content = await fs.readFile(filePath, 'utf-8');

                // 提取 YAML frontmatter 和正文
                const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

                if (!frontmatterMatch) {
                    logger.warn(`⚠️  跳过无 frontmatter 文件: ${file}`);
                    continue;
                }

                const [, yamlStr, body] = frontmatterMatch;
                const id = file.replace('.md', ''); // e.g., "shot_01"

                // 提取 title（优先用 frontmatter.title）
                let title = '';
                try {
                    const parsed = yaml.load(yamlStr) as any;
                    title = parsed.title || '';
                } catch (e) {
                    // ignore parse errors
                }

                // 构建 section
                const sectionTitle = title ? `${id} - ${title}` : id;
                sections.push({
                    id,
                    file,
                    title,
                    sectionTitle,
                    body: body.trim()
                });
            }

            if (sections.length === 0) {
                logger.error('❌ 没有有效的 shot 文件可聚合');
                process.exit(1);
            }

            // 生成 Script.md 内容
            const totalShots = sections.length;
            const frontmatter = [
                '---',
                `type: shot-design`,
                `status: drafting`,
                `total_shots: ${totalShots}`,
                `title: Script`,
                '---',
                ''
            ].join('\n');

            const body = sections.map(s => {
                return [
                    `## ${s.sectionTitle}`,
                    `> 来源：${s.file}`,
                    '',
                    s.body,
                    ''
                ].join('\n');
            }).join('\n');

            const scriptContent = frontmatter + body;

            if (options.dryRun) {
                logger.info('\n--- Script.md 预览 ---');
                console.log(scriptContent);
                logger.info('--- 预览结束 ---');
            } else {
                await fs.outputFile(outputPath, scriptContent, 'utf-8');
                logger.info('\n✅ Script.md 已生成');
                logger.info(`   文件: ${outputPath}`);
                logger.info(`   分镜: ${totalShots} 个`);
            }
        });
}
