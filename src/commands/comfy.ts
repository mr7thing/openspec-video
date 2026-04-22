import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { ComfyUITaskCompiler } from '../core/compiler/ComfyUITaskCompiler';
import { logger } from '../utils/logger';

// ============================================================================
// opsv comfy — ComfyUI 工作流编译入口
// 支持本地 ComfyUI 和 RunningHub 远程执行
// ============================================================================

export function registerComfyCommand(program: Command, VERSION: string) {
    const comfyCmd = program
        .command('comfy')
        .description('编译 ComfyUI 工作流并进入队列');

    comfyCmd
        .command('compile <workflowJson>')
        .description('将 ComfyUI 工作流 JSON 编译为队列任务')
        .option('--provider <name>', '目标 Provider (comfyui_local | runninghub)', 'comfyui_local')
        .option('--shot-id <id>', '关联的 Shot/任务 ID', 'comfy_task')
        .option('--cycle <name>', '目标 Circle', 'zerocircle_1')
        .option('--param <kv>', '注入工作流参数 (格式: key=value)', collectParams, {})
        .action(async (workflowJson: string, options) => {
            const projectRoot = process.cwd();
            const absWorkflowPath = path.resolve(projectRoot, workflowJson);
            
            // 验证工作流文件存在
            const exists = await fs.access(absWorkflowPath).then(() => true).catch(() => false);
            if (!exists) {
                logger.error(`❌ 工作流文件不存在: ${absWorkflowPath}`);
                process.exit(1);
            }
            
            const templateDir = path.dirname(absWorkflowPath);
            const templateName = path.basename(absWorkflowPath);
            const provider = options.provider.toLowerCase();
            
            if (provider !== 'comfyui_local' && provider !== 'runninghub') {
                logger.error(`❌ 不支持的 Provider: ${provider}。仅支持 comfyui_local 或 runninghub`);
                process.exit(1);
            }
            
            logger.info(`\n🎨 OpsV Comfy v${VERSION}`);
            logger.info(`   工作流: ${workflowJson}`);
            logger.info(`   Provider: ${provider}`);
            logger.info(`   Shot ID: ${options.shotId}`);
            if (Object.keys(options.param).length > 0) {
                logger.info(`   参数:`);
                for (const [k, v] of Object.entries(options.param)) {
                    logger.info(`     ${k} = ${v}`);
                }
            }
            
            try {
                const queueDir = path.join(projectRoot, 'opsv-queue');
                const compiler = new ComfyUITaskCompiler(queueDir, templateDir);
                
                const taskId = await compiler.compileAndEnqueue({
                    shotId: options.shotId,
                    templateName: templateName,
                    provider: provider,
                    parameters: options.param
                }, options.cycle);
                
                logger.info(`\n✅ ComfyUI 任务已入队: ${taskId}`);
                logger.info(`   目录: opsv-queue/${options.cycle}/${provider}/`);
            } catch (err) {
                logger.error(`编译失败: ${(err as Error).message}`);
                process.exit(1);
            }
        });
}

function collectParams(value: string, previous: Record<string, string | number>): Record<string, string | number> {
    const sepIdx = value.indexOf('=');
    if (sepIdx === -1) {
        logger.warn(`⚠️ 忽略无效参数格式: ${value} (应为 key=value)`);
        return previous;
    }
    const key = value.slice(0, sepIdx);
    let val: string | number = value.slice(sepIdx + 1);
    // 尝试解析为数字
    if (/^\d+$/.test(val)) {
        val = parseInt(val, 10);
    } else if (/^\d+\.\d+$/.test(val)) {
        val = parseFloat(val);
    }
    previous[key] = val;
    return previous;
}
