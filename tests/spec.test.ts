import path from 'path';
import { SpecParser } from '../src/core/SpecParser';

describe('SpecParser', () => {
    const projectDemoPath = path.resolve(__dirname, '../project-demo');

    it('should correctly parse project.md', async () => {
        const parser = new SpecParser(projectDemoPath);
        const config = await parser.parseProjectConfig();

        expect(config).toBeDefined();
        expect(config.context.narrative).toContain('cybernetic detective');
        expect(config.context.style.aspect_ratio).toContain('2:39:1');
        expect(config.context.style.resolution).toBe('4K UHD.');
    });

    it('should throw error if project.md does not exist', async () => {
        const invalidPath = path.resolve(__dirname, '../invalid-project');
        const parser = new SpecParser(invalidPath);

        await expect(parser.parseProjectConfig()).rejects.toThrow();
    });
});

import { JobGenerator } from '../src/automation/JobGenerator';

describe('JobGenerator', () => {
    const projectDemoPath = path.resolve(__dirname, '../project-demo');

    it('should generate jobs from Script.md', async () => {
        const generator = new JobGenerator(projectDemoPath);
        const jobs = await generator.generateJobs();

        expect(jobs.length).toBeGreaterThan(0);
        expect(jobs[0].type).toBe('image_generation');
        expect(jobs[0].payload.subject.description).toContain('Detective K');
        expect(jobs[0].assets.length).toBeGreaterThan(0);
    });
});
