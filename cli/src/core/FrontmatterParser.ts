// ============================================================================
// OpsV Frontmatter Parser
// ============================================================================

import yaml from 'js-yaml';
import { z } from 'zod';
import { BaseFrontmatterSchema } from '../types/FrontmatterSchema';
import { ReviewEntry } from '../types/ManifestSchema';
import { formatReviewEntry } from '../utils/reviewEntry';

import { ValidationError, CompilationError, InfrastructureError, OpsVErrorCode } from '../errors/OpsVError';

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
      throw new ValidationError(OpsVErrorCode.VALIDATION_YAML_PARSE_FAILED, `YAML parse failed: ${(e as Error).message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new ValidationError(OpsVErrorCode.VALIDATION_FRONTMATTER_MALFORMED, 'Frontmatter is empty or malformed');
    }

    const targetSchema = schema || BaseFrontmatterSchema;
    const result = targetSchema.safeParse(parsed);
    if (!result.success) {
      const errors = result.error.errors
        .map((e) => `  ${e.path.join('.')}: ${e.message}`)
        .join('\n');
      throw new ValidationError(OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH, `Frontmatter validation failed:\n${errors}`);
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

  /**
   * Replace (or append) a top-level YAML field using text-level surgery.
   *
   * Only the targeted field's block is re-serialized; all other fields,
   * comments, and formatting in the YAML frontmatter are preserved exactly
   * as-is. This avoids the data-loss problems of full-parse + full-dump.
   */
  static updateField(content: string, field: string, value: any): string {
    const { rawYaml, body } = FrontmatterParser.split(content);
    const serialized = yaml
      .dump({ [field]: value }, { indent: 2, lineWidth: -1, noRefs: true })
      .trim();

    // Match the field block from its start-of-line key to the next top-level
    // key (line starting with non-whitespace that is not a comment), or end
    // of the YAML string.  The "$" anchor is end-of-string (no /m flag).
    const pattern = new RegExp(
      `(?:^|\\n)${field}:([\\s\\S]*?)(?=\\n(?!\\s|#|\\$)|\\n?\\$)`,
    );
    const match = rawYaml.match(pattern);

    if (match) {
      const keepNewline = match[0].startsWith('\n') ? '\n' : '';
      const replaced = keepNewline + serialized;
      return `---\n${rawYaml.replace(pattern, replaced)}\n---\n${body}`;
    }

    // Field not found in YAML — append before the closing `---`
    return `---\n${rawYaml}\n${serialized}\n---\n${body}`;
  }

  static appendReview(content: string, reviewEntry: string | ReviewEntry): string {
    const { rawYaml, body } = FrontmatterParser.split(content);
    const parsed = yaml.load(rawYaml) as Record<string, any>;
    if (!parsed.reviews) parsed.reviews = [];
    const entry = typeof reviewEntry === 'string' ? reviewEntry : formatReviewEntry(reviewEntry);
    parsed.reviews.push(entry);
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
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/m);
    if (!match) {
      throw new ValidationError(OpsVErrorCode.VALIDATION_FRONTMATTER_MISSING, 'Document missing YAML frontmatter (--- delimiter required)');
    }
    return { rawYaml: match[1], body: match[2] };
  }
}
