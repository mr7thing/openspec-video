#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';
import { spawn } from 'child_process';
import { JobGenerator } from './automation/JobGenerator';
import { Reviewer } from './automation/Reviewer';
import { AnimateGenerator } from './automation/AnimateGenerator';

const program = new Command();
const TEMPLATE_DIR = path.join(__dirname, '../templates');
const PROPOSAL_TEMPLATE = path.join(__dirname, '../templates/proposal.md');
const PID_FILE = path.join(os.homedir(), '.opsv', 'daemon.pid');
const DAEMON_SCRIPT = path.join(__dirname, 'server', 'daemon.js');

function isDaemonRunning(): boolean {
    if (!fs.existsSync(PID_FILE)) return false;
    try {
        const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'));
        process.kill(pid, 0); // Check if process exists
        return true;
    } catch (e) {
        return false;
    }
}

function startDaemon() {
    if (isDaemonRunning()) {
        console.log('Server is already running.');
        return;
    }

    console.log('Starting OpsV Server...');
    const subprocess = spawn('node', [DAEMON_SCRIPT], {
        detached: true,
        stdio: 'ignore', // 'ignore' for true background, or open file for logs
        cwd: process.cwd(),
        env: process.env
    });

    subprocess.unref();
    console.log(`Server started. (PID: ${subprocess.pid})`);
    // Note: The daemon itself writes the PID file, but we can't wait for it easily in detached mode.
    // We trust it starts.
}

function stopDaemon() {
    if (!fs.existsSync(PID_FILE)) {
        console.log('Server is not running.');
        return;
    }

    try {
        const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'));
        process.kill(pid);
        fs.unlinkSync(PID_FILE);
        console.log(`Server stopped (PID: ${pid}).`);
    } catch (e) {
        console.error('Failed to stop server:', e);
    }
}

function registerProject(projectRoot: string) {
    const ws = new WebSocket('ws://127.0.0.1:3061');
    ws.on('open', () => {
        const payload = JSON.stringify({
            type: 'REGISTER_PROJECT',
            payload: {
                name: path.basename(projectRoot),
                root: projectRoot,
                jobsPath: path.join(projectRoot, 'queue', 'jobs.json')
            }
        });
        ws.send(payload, (err) => {
            if (err) console.error('Failed to register project:', err);
            else console.log(`Project '${path.basename(projectRoot)}' registered with Global Daemon.`);

            // Give Node time to flush the TCP buffer before killing the socket
            setTimeout(() => ws.close(), 100);
        });
    });
    ws.on('error', (err) => {
        console.warn(`Failed to connect to Global Daemon at 3061: ${err.message}. Ensure it is running to use the extension.`);
    });
}


program
    .name('opsv')
    .description('OpenSpec-Video Automation CLI')
    .version('0.2.28');

program
    .command('serve')
    .description('Start the OpsV background server')
    .action(async () => {
        if (!isDaemonRunning()) {
            startDaemon();
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            console.log('Server is already running.');
        }
        registerProject(process.cwd());
    });

program
    .command('start')
    .description('Alias for serve')
    .action(async () => {
        if (!isDaemonRunning()) {
            startDaemon();
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            console.log('Server is already running.');
        }
        registerProject(process.cwd());
    });

program
    .command('stop')
    .description('Stop the OpsV background server')
    .action(() => {
        stopDaemon();
    });

program
    .command('status')
    .description('Check OpsV Server status')
    .action(() => {
        if (isDaemonRunning()) {
            const pid = fs.readFileSync(PID_FILE, 'utf-8');
            console.log(`✅ OpsV Server is RUNNING (PID: ${pid})`);
            console.log(`   Listening on: ws://127.0.0.1:3061`);
        } else {
            console.log('🔴 OpsV Server is STOPPED');
        }
    });

import inquirer from 'inquirer';

// ... (existing imports and constants)

program
    .command('init [projectName]')
    .description('Initialize a new OpenSpec-Video project')
    .action(async (projectName) => {
        let targetDir = process.cwd();
        if (projectName && projectName !== '.') {
            targetDir = path.resolve(process.cwd(), projectName);
        }

        if (projectName && projectName !== '.' && fs.existsSync(targetDir)) {
            console.error(`Error: Directory ${projectName} already exists.`);
            return;
        }

        if (!fs.existsSync(TEMPLATE_DIR)) {
            console.error(`CRITICAL ERROR: Template directory not found at ${TEMPLATE_DIR}`);
            return;
        }

        const { tools } = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'tools',
                message: 'Select the AI assistants you want to support:',
                choices: [
                    { name: 'Gemini (Legacy - GEMINI.md)', value: 'gemini', checked: true },
                    { name: 'OpenCode (AGENTS.md + .opencode)', value: 'opencode' },
                    { name: 'Trae (AGENTS.md + .trae)', value: 'trae' }
                ]
            }
        ]);

        console.log(`Initializing project in ${targetDir}...`);

        try {
            await fs.ensureDir(targetDir);

            // 1. Copy mandatory base templates (.agent skills and .antigravity workflows)
            await fs.copy(path.join(TEMPLATE_DIR, '.agent'), path.join(targetDir, '.agent'));
            await fs.copy(path.join(TEMPLATE_DIR, '.antigravity'), path.join(targetDir, '.antigravity'));

            // 2. Selective copy based on tools
            if (tools.includes('gemini')) {
                if (fs.existsSync(path.join(TEMPLATE_DIR, 'GEMINI.md'))) {
                    await fs.copy(path.join(TEMPLATE_DIR, 'GEMINI.md'), path.join(targetDir, 'GEMINI.md'));
                }
            }

            if (tools.includes('opencode') || tools.includes('trae')) {
                // Both use AGENTS.md as the primary instruction file
                if (fs.existsSync(path.join(TEMPLATE_DIR, 'AGENTS.md'))) {
                    await fs.copy(path.join(TEMPLATE_DIR, 'AGENTS.md'), path.join(targetDir, 'AGENTS.md'));
                }
            }

            if (tools.includes('opencode')) {
                const opencodeDir = path.join(TEMPLATE_DIR, '.opencode');
                if (fs.existsSync(opencodeDir)) {
                    await fs.copy(opencodeDir, path.join(targetDir, '.opencode'));
                } else {
                    await fs.ensureDir(path.join(targetDir, '.opencode'));
                }
            }

            if (tools.includes('trae')) {
                const traeDir = path.join(TEMPLATE_DIR, '.trae');
                if (fs.existsSync(traeDir)) {
                    await fs.copy(traeDir, path.join(targetDir, '.trae'));
                } else {
                    await fs.ensureDir(path.join(targetDir, '.trae'));
                }
            }

            // 3. Create normative videospec structure
            const specDir = path.join(targetDir, 'videospec');
            await fs.ensureDir(specDir);
            await fs.ensureDir(path.join(specDir, 'stories'));
            await fs.ensureDir(path.join(specDir, 'elements'));
            await fs.ensureDir(path.join(specDir, 'scenes'));
            await fs.ensureDir(path.join(specDir, 'shots'));

            // 4. Create operational directories
            await fs.ensureDir(path.join(targetDir, 'artifacts'));
            await fs.ensureDir(path.join(targetDir, 'queue'));

            console.log('Project structure created successfully.');
            console.log(`Tools configured: ${tools.join(', ')}`);
        } catch (err) {
            console.error('Failed to initialize project:', err);
        }
    });


program
    .command('generate [targets...]')
    .description('Generate jobs from specific files, directories, or all normative folders by default')
    .option('-p, --preview', 'Generate preview only (key shots / single char sheet)', false)
    .option('--shots <list>', 'Comma-separated list of shot IDs (e.g. 1,5,12)', (val) => val.split(','))
    .action(async (targets, options) => {
        try {
            const projectRoot = process.cwd();

            console.log(`Generating jobs for targets: ${targets && targets.length > 0 ? targets.join(', ') : 'All normative folders'}...`);
            if (options.preview) console.log('👀 Preview Mode Active');
            if (options.shots) console.log(`🎯 Generating specific shots: ${options.shots.join(', ')}`);

            const generator = new JobGenerator(projectRoot);

            // Pass targets and options (preview, shots) to generator
            const jobs = await generator.generateJobs(targets, {
                preview: options.preview,
                shots: options.shots
            });

            console.log(`Successfully generated ${jobs.length} jobs in queue/jobs.json`);

            // Auto-start server if needed
            if (!isDaemonRunning()) {
                console.log('Auto-starting OpsV Global Server for processing...');
                startDaemon();
                // Wait briefly for daemon to start
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                console.log('OpsV Global Server is already running. Ready for browser extension.');
            }

            // Register Project with Global Daemon
            registerProject(projectRoot);

        } catch (err) {
            console.error('Generation failed:', err);
        }
    });

program
    .command('review [target]')
    .description('Automatically append generated drafts into target markdown documents as reference links')
    .option('--alldrafts', 'Include all historical drafts instead of just the latest one')
    .action(async (target, options) => {
        try {
            const projectRoot = process.cwd();
            const reviewer = new Reviewer(projectRoot);

            if (target) {
                console.log(`Running review for target: ${target}`);
                await reviewer.reviewTarget(target, { allDrafts: options.alldrafts });
            } else {
                console.log(`Running global review across all elements, scenes, and shots...`);
                await reviewer.reviewAll({ allDrafts: options.alldrafts });
            }
        } catch (err) {
            console.error('Review failed:', err);
        }
    });

program
    .command('animate')
    .description('Generate video animation jobs from Shotlist.md')
    .action(async () => {
        try {
            const projectRoot = process.cwd();
            const generator = new AnimateGenerator(projectRoot);

            console.log('Compiling video jobs from Shotlist.md...');
            const jobs = await generator.generateAnimationJobs();

            if (jobs.length > 0) {
                if (!isDaemonRunning()) {
                    console.log('Auto-starting OpsV Global Server for video processing...');
                    startDaemon();
                } else {
                    console.log('OpsV Global Server is already running. Ready for browser extension.');
                }
                registerProject(projectRoot);
            }
        } catch (err) {
            console.error('Animation job generation failed:', err);
        }
    });

program.parse(process.argv);
