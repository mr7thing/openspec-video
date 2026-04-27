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
import { registerAppCommand } from './commands/app';
import { registerRunCommand } from './commands/run';
import { registerReviewCommand } from './commands/review';
import { registerScriptCommand } from './commands/script';

// Load .env before anything else
const projectRoot = process.cwd();
const opsvEnvPath = path.join(projectRoot, '.opsv', '.env');
const rootEnvPath = path.join(projectRoot, '.env');

if (fs.existsSync(opsvEnvPath)) {
  dotenv.config({ path: opsvEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
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
  .description('OpenSpec-Video v0.8 — Cinematic AI Automation CLI');

// Register all 11 commands
registerInitCommand(program, VERSION);
registerValidateCommand(program, VERSION);
registerCircleCommands(program);
registerImagenCommand(program);
registerAnimateCommand(program);
registerComfyCommand(program);
registerAudioCommand(program);
registerAppCommand(program);
registerRunCommand(program);
registerReviewCommand(program);
registerScriptCommand(program);

program.parse(process.argv);
