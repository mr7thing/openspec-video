#!/usr/bin/env node
// ============================================================================
// OpsV CLI Entry Point
// ============================================================================

import { Command } from 'commander';
import fs from 'fs-extra';
import os from 'os';
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
import { registerWebappExecCommand } from './commands/webappExec';
import { registerRunCommand } from './commands/run';
import { registerReviewCommand } from './commands/review';
import { registerApprovedCommand } from './commands/approved';
import { registerLoginCommand } from './commands/login';
import { registerIterateCommand } from './commands/iterate';
import { registerRefsCommand } from './commands/refs';
import { registerImageStitchCommand } from './commands/imageStitch';
import { registerApiSetupCommand } from './commands/apiSetup';
import { registerEnvCommands } from './commands/env';
import { resolveProjectRoot } from './utils/projectResolver';
import { decryptEnvFile, hasMasterKey } from './utils/envCipher';

// Three-tier .env loading: user → project root → project .opsv
// Supports both plaintext and encrypted (AES-256-GCM) .env files.
// When master.key exists, files are transparently decrypted via decryptEnvFile().
// dotenv.config() is used for plaintext; for encrypted files we parse and set manually.
const projectRoot = resolveProjectRoot(process.cwd());

function loadEnvFile(envPath: string): void {
  if (!fs.existsSync(envPath)) return;

  if (hasMasterKey()) {
    // Encrypted path: decrypt → parse → set process.env
    const decrypted = decryptEnvFile(envPath);
    if (decrypted) {
      const parsed = dotenv.parse(decrypted);
      for (const [key, value] of Object.entries(parsed)) {
        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
    }
  } else {
    // Plaintext path: let dotenv handle it
    dotenv.config({ path: envPath });
  }
}

const userEnvPath = path.join(os.homedir(), '.opsv', '.env');
const rootEnvPath = path.join(projectRoot, '.env');
const opsvEnvPath = path.join(projectRoot, '.opsv', '.env');

loadEnvFile(userEnvPath);
loadEnvFile(rootEnvPath);
loadEnvFile(opsvEnvPath);

// Read version from package.json
const pkgPath = path.join(__dirname, '../package.json');
let VERSION = '0.12.0';
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
import { RHapiProvider } from './executor/providers/RHapiProvider';

container.registerExecutor('volcengine', VolcengineProvider);
container.registerExecutor('siliconflow', SiliconFlowProvider);
container.registerExecutor('minimax', MinimaxProvider);
container.registerExecutor('runninghub', RunningHubProvider);
container.registerExecutor('comfylocal', ComfyLocalProvider);
container.registerExecutor('webapp', WebappProvider);
container.registerExecutor('rhapi', RHapiProvider);

const program = new Command();
program
  .name('opsv')
  .version(VERSION)
  .description(`OpenSpec-Video v${VERSION} — Cinematic AI Automation CLI`);

// Register all commands
registerInitCommand(program, VERSION);
registerValidateCommand(program, VERSION);
registerCircleCommands(program);
registerImagenCommand(program);
registerAnimateCommand(program);
registerComfyCommand(program);
registerComfyNodeMappingCommand(program);
registerAudioCommand(program);
registerWebappCommand(program);
registerWebappExecCommand(program);
registerRunCommand(program);
registerReviewCommand(program);
registerLoginCommand(program);
registerIterateCommand(program);
registerApprovedCommand(program);
registerRefsCommand(program);
registerImageStitchCommand(program);
registerApiSetupCommand(program);
registerEnvCommands(program);

program.parse(process.argv);
