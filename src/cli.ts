#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import { JobGenerator } from './automation/JobGenerator';

const program = new Command();
const TEMPLATE_DIR = path.join(__dirname, '../templates');
const PROPOSAL_TEMPLATE = path.join(__dirname, '../templates/proposal.md');
const PID_FILE = path.join(process.cwd(), '.opsv', 'daemon.pid');
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


program
    .name('opsv')
    .description('OpenSpec-Video Automation CLI')
    .version('0.1.1');

program
    .command('serve')
    .description('Start the OpsV background server')
    .action(() => {
        startDaemon();
    });

program
    .command('start')
    .description('Alias for serve')
    .action(() => {
        startDaemon();
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
            console.log(`   Listening on: ws://localhost:3000`);
        } else {
            console.log('🔴 OpsV Server is STOPPED');
        }
    });

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

        console.log(`Initializing project in ${targetDir}...`);

        if (!fs.existsSync(TEMPLATE_DIR)) {
            console.error(`CRITICAL ERROR: Template directory not found at ${TEMPLATE_DIR}`);
            console.error('Please check your installation or package structure.');
            return;
        }

        try {
            await fs.ensureDir(targetDir);

            // 1. Copy .agent (Skills) and .antigravity (Rules, Workflows)
            await fs.copy(path.join(TEMPLATE_DIR, '.agent'), path.join(targetDir, '.agent'));
            await fs.copy(path.join(TEMPLATE_DIR, '.antigravity'), path.join(targetDir, '.antigravity'));

            // 2. Create videospec structure
            const specDir = path.join(targetDir, 'videospec');
            await fs.ensureDir(specDir);

            // Project Config
            await fs.copy(path.join(TEMPLATE_DIR, 'project/project.md'), path.join(specDir, 'project.md'));

            // Assets
            await fs.ensureDir(path.join(specDir, 'assets/characters'));
            await fs.copy(path.join(TEMPLATE_DIR, 'assets/character.md'), path.join(specDir, 'assets/characters/example.md'));

            await fs.ensureDir(path.join(specDir, 'assets/scenes'));
            await fs.copy(path.join(TEMPLATE_DIR, 'assets/scene.md'), path.join(specDir, 'assets/scenes/example.md'));

            // Stories
            await fs.ensureDir(path.join(specDir, 'stories'));
            await fs.copy(path.join(TEMPLATE_DIR, 'stories/Script.md'), path.join(specDir, 'stories/Script.md'));

            // Changes
            await fs.ensureDir(path.join(specDir, 'changes'));

            console.log('Project structure created.');
            console.log('Run `opsv generate` to start.');
        } catch (err) {
            console.error('Failed to initialize project:', err);
        }
    });

program
    .command('proposal <title>')
    .description('Create a new change proposal')
    .action(async (title) => {
        let changesDir = path.join(process.cwd(), 'videospec', 'changes');
        if (!fs.existsSync(changesDir)) {
            // Fallback for system dev repo
            changesDir = path.join(process.cwd(), 'openspec', 'changes');
            if (!fs.existsSync(changesDir)) {
                console.error('Error: Not in a valid OpenSpec project (videospec/changes or openspec/changes not found).');
                return;
            }
        }

        const safeTitle = title.toLowerCase().replace(/ /g, '-');
        const filename = `${new Date().toISOString().split('T')[0]}-${safeTitle}.md`;
        const targetPath = path.join(changesDir, filename);

        try {
            let content = fs.existsSync(PROPOSAL_TEMPLATE)
                ? fs.readFileSync(PROPOSAL_TEMPLATE, 'utf-8')
                : '# Proposal: ' + title + '\n\nAdd content here.';

            content = content.replace('[Title]', title).replace('[Date]', new Date().toISOString().split('T')[0]);

            fs.writeFileSync(targetPath, content);
            console.log(`Created proposal: ${targetPath}`);
        } catch (err) {
            console.error('Failed to create proposal:', err);
        }
    });

program
    .command('generate')
    .description('Generate jobs from videospec/stories')
    .action(async () => {
        try {
            const projectRoot = process.cwd();
            console.log(`Generating jobs for project at ${projectRoot}...`);

            const generator = new JobGenerator(projectRoot);
            const jobs = await generator.generateJobs();

            console.log(`Successfully generated ${jobs.length} jobs in queue/jobs.json`);

            // Auto-start server if needed
            if (!isDaemonRunning()) {
                console.log('Auto-starting OpsV Server for processing...');
                startDaemon();
            } else {
                console.log('OpsV Server is already running. Ready for browser extension.');
            }
        } catch (err) {
            console.error('Generation failed:', err);
        }
    });

program.parse(process.argv);
