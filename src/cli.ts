import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { JobGenerator } from './automation/JobGenerator';

const program = new Command();
const TEMPLATE_DIR = path.join(__dirname, '../project-demo');
const PROPOSAL_TEMPLATE = path.join(__dirname, '../templates/proposal.md');

program
    .name('opsv')
    .description('OpenSpec-Video Automation CLI')
    .version('0.1.0');

program
    .command('init <projectName>')
    .description('Initialize a new OpenSpec-Video project')
    .action(async (projectName) => {
        const targetDir = path.resolve(process.cwd(), projectName);
        if (fs.existsSync(targetDir)) {
            console.error(`Error: Directory ${projectName} already exists.`);
            return;
        }

        console.log(`Initializing project in ${targetDir}...`);
        try {
            // Copy project-demo as template
            // Exclude artifacts and queue to start fresh
            await fs.copy(TEMPLATE_DIR, targetDir, {
                filter: (src) => !src.includes('artifacts') && !src.includes('queue') && !src.includes('openspec')
            });
            console.log('Project structure created.');
            console.log('Run `cd ' + projectName + ' && opsv generate` to start.');
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
        } catch (err) {
            console.error('Generation failed:', err);
        }
    });

program.parse(process.argv);
