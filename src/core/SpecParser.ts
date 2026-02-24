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
            visual_style: z.string().optional(),
            genre: z.string().optional(),
            palette: z.string().optional(),
            aspect_ratio: z.string().default("16:9"),
            resolution: z.string().default("2K")
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
            console.warn(`[SpecParser] project.md not found at ${projectPath}. Using default configuration.`);
            return ProjectSchema.parse({
                name: "Untitled Project",
                context: {
                    narrative: "Undefined narrative context.",
                    style: {
                        aspect_ratio: "16:9",
                        resolution: "2K"
                    }
                }
            });
        }

        const content = fs.readFileSync(projectPath, 'utf-8');

        // We can use unified pipeline to parse AST, but for this "Spec" format 
        // which relies heavily on H1/H2 headers, a manual section parser might be more robust
        // combined with YAML frontmatter if present.

        const config = this.extractSections(content);
        console.log("DEBUG: SpecParser Config:", JSON.stringify(config, null, 2));
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
            const logMatch = line.match(/(?:\*\*\s*)?Logline(?:\s*\*\*)?:\s*(.*)/i) || line.match(/-\s*Logline:\s*(.*)/i);
            if (logMatch && !config.context.narrative) config.context.narrative = logMatch[1].trim();

            const vsMatch = line.match(/(?:\*\*\s*)?(?:Visual Style|Style)(?:\s*\*\*)?:\s*(.*)/i) || line.match(/-\s*Visual Style:\s*(.*)/i);
            if (vsMatch && !config.context.style.visual_style) config.context.style.visual_style = vsMatch[1].trim();

            const arMatch = line.match(/(?:\*\*\s*)?Aspect Ratio(?:\s*\*\*)?:\s*(.*)/i) || line.match(/-\s*Aspect Ratio:\s*(.*)/i);
            if (arMatch && !config.context.style.aspect_ratio) config.context.style.aspect_ratio = arMatch[1].trim();

            const resMatch = line.match(/(?:\*\*\s*)?Resolution(?:\s*\*\*)?:\s*(.*)/i) || line.match(/-\s*Resolution:\s*(.*)/i);
            if (resMatch && !config.context.style.resolution) config.context.style.resolution = resMatch[1].trim();
        }

        // Fallback defaults if not found
        if (!config.context.narrative) config.context.narrative = "Detected from project.md";

        return config;
    }
}
