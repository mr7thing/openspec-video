#!/usr/bin/env node
// ============================================================================
// OpsV CLI Entry Point
// ============================================================================

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { Container } from './container/Container';
import { OpsVContext } from './container/OpsVContext';
import { registerInitCommand } from './commands/init';
import { registerValidateCommand } from './commands/validate';
import { registerCircleCommands } from './commands/circle';
import { registerImagenCommand } from './commands/imagen';
import { registerAnimateCommand } from './commands/animate';
import { registerComfyCommand } from './commands/comfy';
import { registerComfyNodeMappingCommand } from './commands/comfyNodeMapping';
import { registerAudioCommand } from './commands/audio';
import { registerWebappCommand } from './commands/webapp';
import { registerRunCommand } from './commands/run';
import { registerReviewCommand } from './commands/review';
import { registerIterateCommand } from './commands/iterate';
import { resolveProjectRoot } from './utils/projectResolver';

// Load .env from the resolved project root (not just cwd)
const projectRoot = resolveProjectRoot(process.cwd());
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
let VERSION = '0.9.0';
try {
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    VERSION = pkg.version || VERSION;
  }
} catch {
  // fallback to default version
}

// Bootstrap Context and Container
export const ctx = OpsVContext.create(process.cwd());
export const container = new Container();

// Register executor providers
import { VolcengineProvider } from './executor/providers/VolcengineProvider';
import { SiliconFlowProvider } from './executor/providers/SiliconFlowProvider';
import { MinimaxProvider } from './executor/providers/MinimaxProvider';
import { RunningHubProvider } from './executor/providers/RunningHubProvider';
import { ComfyLocalProvider } from './executor/providers/ComfyLocalProvider';
import { WebappProvider } from './executor/providers/WebappProvider';

container.registerExecutor('volcengine', VolcengineProvider);
container.registerExecutor('siliconflow', SiliconFlowProvider);
container.registerExecutor('minimax', MinimaxProvider);
container.registerExecutor('runninghub', RunningHubProvider);
container.registerExecutor('comfylocal', ComfyLocalProvider);
container.registerExecutor('webapp', WebappProvider);

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
registerComfyNodeMappingCommand(program);
registerAudioCommand(program);
registerWebappCommand(program);
registerRunCommand(program);
registerReviewCommand(program);
registerIterateCommand(program);

program.parse(process.argv);
