#!/usr/bin/env npx ts-node
/**
 * 镜头数量计算脚本
 * 供 opsv-script-designer agent 调用
 *
 * 用法: npx ts-node scripts/calculate-shots.ts --duration 240 --max-per-shot 5
 * 输出: total_shots: 48, avg_duration: 5.0s
 */

const args = process.argv.slice(2);
const parsed: Record<string, string> = {};

for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const val = args[i + 1];
    if (key && val) parsed[key] = val;
}

const totalDuration = parseInt(parsed.duration || '0', 10);
const maxPerShot = parseInt(parsed['max-per-shot'] || '5', 10);

if (!totalDuration || totalDuration <= 0) {
    console.error('用法: npx ts-node scripts/calculate-shots.ts --duration <秒> --max-per-shot <秒>');
    console.error('示例: npx ts-node scripts/calculate-shots.ts --duration 240 --max-per-shot 5');
    process.exit(1);
}

const totalShots = Math.ceil(totalDuration / maxPerShot);
const avgDuration = (totalDuration / totalShots).toFixed(1);

console.log(`total_shots: ${totalShots}, avg_duration: ${avgDuration}s`);
console.log(`\n建议:`)
console.log(`  总片长: ${totalDuration}s (${(totalDuration / 60).toFixed(1)} 分钟)`);
console.log(`  单镜最长: ${maxPerShot}s`);
console.log(`  所需分镜: ${totalShots} 个`);
console.log(`  平均时长: ${avgDuration}s/镜`);
