import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import { z } from 'zod';

// Define the schema for Project Configuration
// This matches the structure expected in project.md frontmatter or inferred sections
const ProjectSchema = z.object({
    name: z.string().optional(),
    version: z.string().optional(),
    context: z.object({
        narrative: z.string(),
        style: z.object({
            genre: z.string().optional(),
            palette: z.string().optional(),
            aspect_ratio: z.string().default("16:9"),
            resolution: z.string().default("4K")
        }),
        constraints: z.record(z.string(), z.any()).optional()
    })
});

export type ProjectConfig = z.infer<typeof ProjectSchema>;

export class SpecParser {
    private projectRoot: string;
    private videospecRoot: string;

    constructor(projectRoot: string) {
        this.projectRoot = path.resolve(projectRoot);
        this.videospecRoot = path.join(this.projectRoot, 'videospec');
    }

    /**
     * Parses the project.md file.
     * Currently supports parsing simple Key-Value pairs from Markdown sections
     * as a fallback if frontmatter captures partial data.
     */
    async parseProjectConfig(): Promise<ProjectConfig> {
        const projectPath = path.join(this.videospecRoot, 'project.md');

        if (!fs.existsSync(projectPath)) {
            throw new Error(`Project configuration file not found at: ${projectPath}`);
        }

        const content = fs.readFileSync(projectPath, 'utf-8');

        // We can use unified pipeline to parse AST, but for this "Spec" format 
        // which relies heavily on H1/H2 headers, a manual section parser might be more robust
        // combined with YAML frontmatter if present.

        const config = this.extractSections(content);
        return ProjectSchema.parse(config);
    }

    /**
     * Simple heuristic parser to convert Markdown headers into a structured object.
     * Maps:
     * ## 1. Core Narrative -> context.narrative
     * ## 2. Visual Style -> context.style
     */
    private extractSections(markdown: string): any {
        const lines = markdown.split('\n');
        const config: any = { context: { style: {} } };

        let currentSection = '';

        for (const line of lines) {
            if (line.startsWith('## 1. Core Narrative')) {
                currentSection = 'narrative';
                continue;
            } else if (line.startsWith('## 2. Visual Style')) {
                currentSection = 'style';
                continue;
            } else if (line.startsWith('## 3. Technical Constraints')) {
                currentSection = 'constraints';
                continue;
            }

            if (currentSection === 'narrative') {
                if (line.trim().startsWith('**Logline**:')) config.context.narrative = line.split('**Logline**:')[1].trim();
            }

            if (currentSection === 'style') {
                if (line.includes('**Aspect Ratio**:')) config.context.style.aspect_ratio = line.split('**Aspect Ratio**:')[1].trim();
                if (line.includes('**Resolution**:')) config.context.style.resolution = line.split('**Resolution**:')[1].trim();
            }
        }

        // Fallback defaults if not found
        if (!config.context.narrative) config.context.narrative = "Detected from project.md";

        return config;
    }
}
