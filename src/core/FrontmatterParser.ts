// ============================================================================
// OpsV v0.8 Frontmatter Parser
// ============================================================================

import yaml from 'js-yaml';
import { z } from 'zod';
import { BaseFrontmatterSchema } from '../types/FrontmatterSchema';

export class FrontmatterParser {
  static parse<T extends z.ZodType>(
    content: string,
    schema?: T
  ): { frontmatter: z.infer<T>; body: string } {
    const { rawYaml, body } = FrontmatterParser.split(content);

    let parsed: any;
    try {
      parsed = yaml.load(rawYaml);
    } catch (e) {
      throw new Error(`YAML parse failed: ${(e as Error).message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Frontmatter is empty or malformed');
    }

    const targetSchema = schema || BaseFrontmatterSchema;
    const result = targetSchema.safeParse(parsed);
    if (!result.success) {
      const errors = result.error.errors
        .map((e) => `  ${e.path.join('.')}: ${e.message}`)
        .join('\n');
      throw new Error(`Frontmatter validation failed:\n${errors}`);
    }

    return { frontmatter: result.data, body };
  }

  static parseRaw(content: string): { frontmatter: Record<string, any>; body: string } {
    const { rawYaml, body } = FrontmatterParser.split(content);
    const parsed = yaml.load(rawYaml) as Record<string, any>;
    return { frontmatter: parsed || {}, body };
  }

  static extractBody(content: string): string {
    return FrontmatterParser.split(content).body;
  }

  static updateField(content: string, field: string, value: any): string {
    const { rawYaml, body } = FrontmatterParser.split(content);
    const parsed = yaml.load(rawYaml) as Record<string, any>;
    parsed[field] = value;
    const newYaml = yaml.dump(parsed, { lineWidth: -1, noRefs: true }).trim();
    return `---\n${newYaml}\n---\n${body}`;
  }

  static appendReview(content: string, reviewEntry: string): string {
    const { rawYaml, body } = FrontmatterParser.split(content);
    const parsed = yaml.load(rawYaml) as Record<string, any>;
    if (!parsed.reviews) parsed.reviews = [];
    parsed.reviews.push(reviewEntry);
    const newYaml = yaml.dump(parsed, { lineWidth: -1, noRefs: true }).trim();
    return `---\n${newYaml}\n---\n${body}`;
  }

  static extractFirstParagraph(body: string): string {
    const lines = body.split('\n');
    const paragraphLines: string[] = [];
    let foundContent = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!foundContent && !trimmed) continue;
      if (trimmed.startsWith('#')) {
        if (foundContent) break;
        continue;
      }
      if (trimmed.startsWith('![')) continue;
      if (trimmed.startsWith('<!--')) continue;
      if (trimmed.match(/^[-=]{3,}$/)) continue;

      if (trimmed) {
        foundContent = true;
        paragraphLines.push(trimmed);
      } else if (foundContent) {
        break;
      }
    }

    return paragraphLines.join(' ').trim() || '(no description)';
  }

  private static split(content: string): { rawYaml: string; body: string } {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
      throw new Error('Document missing YAML frontmatter (--- delimiter required)');
    }
    return { rawYaml: match[1], body: match[2] };
  }
}
