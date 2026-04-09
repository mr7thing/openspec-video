import { Command } from 'commander';
import { DependencyGraph } from '../core/DependencyGraph';
import { ApprovedRefReader } from '../core/ApprovedRefReader';
import path from 'path';

// ============================================================================
// opsv deps — 依赖图分析命令
// ============================================================================

export function registerDepsCommand(program: Command) {
    program
        .command('deps')
        .description('分析资产依赖关系，显示推荐生成顺序')
        .action(async () => {
            const projectRoot = process.cwd();
            const graph = DependencyGraph.buildFromProject(projectRoot);
            const approvedRefReader = new ApprovedRefReader(projectRoot);

            console.log(graph.prettyPrint(approvedRefReader));
            console.log(`\n已保存: .opsv/dependency-graph.json`);
        });
}
