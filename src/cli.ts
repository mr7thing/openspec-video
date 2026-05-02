#!/usr/bin/env node
// ============================================================================
// OpsV v0.8 CLI Entry Point
// ============================================================================

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { registerInitCommand } from './commands/init';
import { registerValidateCommand } from './commands/validate';
import { registerCircleCommands } from './commands/circle';
import { registerImagenCommand } from './commands/imagen';
import { registerAnimateCommand } from './commands/animate';
import { registerComfyCommand } from './commands/comfy';
import { registerAudioCommand } from './commands/audio';
import { registerWebappCommand } from './commands/webapp';
import { registerRunCommand } from './commands/run';
import { registerReviewCommand } from './commands/review';
import { registerScriptCommand } from './commands/script';
import { registerIterateCommand } from './commands/iterate';

// Load .env before anything else
const projectRoot = process.cwd();
const rootEnvPath = path.join(projectRoot, '.env');
const opsvEnvPath = path.join(projectRoot, '.opsv', '.env');

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else if (fs.existsSync(opsvEnvPath)) {
  dotenv.config({ path: opsvEnvPath });
} else {
  dotenv.config();
}

// Read version from package.json
const pkgPath = path.join(__dirname, '../package.json');
const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : { version: '0.8.1' };
const VERSION = pkg.version;

const program = new Command();
program
  .name('opsv')
  .version(VERSION)
  .description(`OpenSpec-Video v${VERSION} — Cinematic AI Automation CLI`);

// Register all 11 commands
registerInitCommand(program, VERSION);
registerValidateCommand(program, VERSION);
registerCircleCommands(program);
registerImagenCommand(program);
registerAnimateCommand(program);
registerComfyCommand(program);
registerAudioCommand(program);
registerWebappCommand(program);
registerRunCommand(program);
registerReviewCommand(program);
registerScriptCommand(program);
registerIterateCommand(program);

program.parse(process.argv);
