import { execSync } from 'child_process';
import * as path from 'path';

console.log('[Final Check] Simulating OpsV compiler payload assertion...');

try {
    // Run `opsv generate --dry-run` to ensure JobValidator and DepGraph do not crash
    // We assume the binary opsv is linked or we can call the local run_cli
    execSync('npx ts-node src/cli.ts generate --dry-run', { cwd: path.resolve(__dirname, '../../../../../') });
    
    console.log('[✅ PASS] Final Check: Dry-run payload compilation successful.');
    process.exit(0);
} catch (e) {
    console.error('[❌ FAIL] Final Check Failed: System failed to compile dependency graph.');
    process.exit(1);
}
