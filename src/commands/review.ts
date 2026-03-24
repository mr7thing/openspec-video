import { Command } from 'commander';
import { Reviewer } from '../automation/Reviewer';

export function registerReviewCommand(program: Command, VERSION: string) {
    program
        .command('review [path]')
        .description('Automatically append generated drafts into target markdown documents as reference links')
        .option('--all', 'Include all historical drafts instead of just the latest one')
        .action(async (reviewPath: string | undefined, options: any) => {
            try {
                const projectRoot = process.cwd();
                const reviewer = new Reviewer(projectRoot);

                if (options.all) {
                    console.log(`Running global review across all historical drafts...`);
                    await reviewer.reviewAll({ allDrafts: true });
                } else if (reviewPath) {
                    console.log(`Running review for specified path: ${reviewPath}`);
                    await reviewer.reviewTarget(reviewPath);
                } else {
                    console.log(`Running review for the latest draft batch...`);
                    await reviewer.reviewAll({ allDrafts: false });
                }
            } catch (err) {
                console.error('Review failed:', err);
            }
        });
}
