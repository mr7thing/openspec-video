#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { registerDaemonCommands } from './commands/daemon';
import { registerInitCommand } from './commands/init';
import { registerGenerateCommand } from './commands/generate';
import { registerReviewCommand } from './commands/review';
import { registerAnimateCommand } from './commands/animate';
import { registerGenImageCommand } from './commands/genImage';
import { registerGenVideoCommand } from './commands/genVideo';

const projectRoot = process.cwd();
const envSubDir = path.join(projectRoot, '.env');
const secretsEnvPath = path.join(envSubDir, 'secrets.env');
const rootEnvPath = path.join(projectRoot, '.env');

//--- 鏍稿績锛氬繀椤诲厛鍔犺浇鐜鍙橀噺 ---
if (fs.existsSync(secretsEnvPath)) {
    dotenv.config({ path: secretsEnvPath });
} else if (fs.existsSync(rootEnvPath) && !fs.lstatSync(rootEnvPath).isDirectory()) {
    dotenv.config({ path: rootEnvPath });
} else {
    dotenv.config();
}

// 鑾峰彇鐗堟湰鍙?(浠?package.json 鍔ㄦ€佽鍙?
const pkgPath = path.join(__dirname, '../package.json');
const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : { version: '0.4.3' };
const VERSION = pkg.version;

const program = new Command();
program
    .name('opsv')
    .version(VERSION)
    .description('OpenSpec-Video Automation CLI');

// 娉ㄥ唽鎵€鏈夋媶鍒嗙殑瀛愬懡浠?
registerDaemonCommands(program, VERSION);
registerInitCommand(program, VERSION);
registerGenerateCommand(program, VERSION);
registerReviewCommand(program, VERSION);
registerAnimateCommand(program, VERSION);
registerGenImageCommand(program, VERSION);
registerGenVideoCommand(program, VERSION);

program.parse(process.argv);

