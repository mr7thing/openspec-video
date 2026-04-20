import fs from 'fs/promises';
import path from 'path';

export function getProjectRoot(): string {
    return process.cwd();
}

export function getEnvPaths(projectRoot: string) {
    const envSubDir = path.join(projectRoot, '.env');
    return {
        secretsEnvPath: path.join(envSubDir, 'secrets.env'),
        rootEnvPath: path.join(projectRoot, '.env')
    };
}

export async function showEnvCheck(projectRoot: string) {
    const { secretsEnvPath, rootEnvPath } = getEnvPaths(projectRoot);
    const secretsExists = await fs.access(secretsEnvPath).then(() => true).catch(() => false);
    let envPath = secretsExists ? secretsEnvPath : 'default';
    if (!secretsExists) {
        const rootExists = await fs.access(rootEnvPath).then(() => true).catch(() => false);
        if (rootExists) {
            const stat = await fs.stat(rootEnvPath);
            if (!stat.isDirectory()) envPath = rootEnvPath;
        }
    }
        
    const volceKey = process.env.VOLCENGINE_API_KEY;
    const seaKey = process.env.SEADREAM_API_KEY;

    console.log(`\n🔍 Environment Check:`);
    console.log(`   - Config Source: ${envPath}`);
    console.log(`   - VOLCENGINE_API_KEY: ${volceKey ? 'Present (****' + volceKey.slice(-4) + ')' : 'Missing'}`);
    console.log(`   - SEADREAM_API_KEY: ${seaKey ? 'Present (****' + seaKey.slice(-4) + ')' : 'Missing'}\n`);
}
