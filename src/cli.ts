#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { registerDaemonCommands } from './commands/daemon';
import { registerInitCommand } from './commands/init';
import { registerImagenCommand } from './commands/imagen';
import { registerReviewCommand } from './commands/review';
import { registerAnimateCommand } from './commands/animate';
import { registerDepsCommand } from './commands/deps';
import { registerAddonsCommands } from './commands/addons';
import { registerQueueCommands } from './commands/queue';
import { registerValidateCommand } from './commands/validate';

const projectRoot = process.cwd();
const envSubDir = path.join(projectRoot, '.env');
const secretsEnvPath = path.join(envSubDir, 'secrets.env');
const rootEnvPath = path.join(projectRoot, '.env');

// --- 核心：必须先加载环境变量 ---
if (fs.existsSync(secretsEnvPath)) {
    dotenv.config({ path: secretsEnvPath });
} else if (fs.existsSync(rootEnvPath) && !fs.lstatSync(rootEnvPath).isDirectory()) {
    dotenv.config({ path: rootEnvPath });
} else {
    dotenv.config();
}

// 获取版本号（从 package.json 动态读取）
const pkgPath = path.join(__dirname, '../package.json');
const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : { version: '0.5.14' };
const VERSION = pkg.version;

const program = new Command();
program
    .name('opsv')
    .version(VERSION)
    .description('OpenSpec-Video Automation CLI (v0.6.2)');

// 注册所有拆分的子命令
registerDaemonCommands(program, VERSION);
registerInitCommand(program, VERSION);
registerImagenCommand(program, VERSION);
registerReviewCommand(program);
registerAnimateCommand(program, VERSION);
registerDepsCommand(program);
registerAddonsCommands(program);
registerQueueCommands(program);
registerValidateCommand(program, VERSION);

program.parse(process.argv);

