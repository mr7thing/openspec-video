// ============================================================================
// Shared validation kernel (A6) — core/Validator.ts
// Locks the frozen issue-code set, schema/refs/category/dead-ref semantics,
// and the disk ↔ inline parity contract (both paths call the same function).
// ============================================================================

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  DOCUMENT_ISSUE_CODES,
  VALIDATOR_CONTRACT_VERSION,
  DocumentValidationContext,
  hashProposedContent,
  validateDocumentContent,
} from '../Validator';
import { InputTypesLoader } from '../../utils/inputTypesLoader';

const VALID_DOC = [
  '---',
  'category: shot',
  'status: drafting',
  'prompt: A hero standing in the rain',
  'brief: hero shot',
  '---',
  '',
  'Body text',
  '',
].join('\n');

const DOC_WITH_REFS = [
  '---',
  'category: shot',
  'status: drafting',
  'prompt: Uses @hero and @ghost here',
  'brief: refs doc',
  'refs:',
  '  image:',
  '    "@hero": ["videospec/elements/hero.png"]',
  '    "@ghost": ["videospec/elements/ghost.png"]',
  '    "@:local": ["./local.png"]',
  '---',
  '',
  'Body',
  '',
].join('\n');

describe('core/Validator — shared validation kernel (A6)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-validator-'));
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  function loadInputTypes(): InputTypesLoader {
    fs.mkdirSync(path.join(tmpDir, '.opsv'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.opsv', 'input_types.yaml'),
      'input_types:\n  image:\n    description: test images\n',
    );
    const loader = new InputTypesLoader();
    loader.load(tmpDir, { silent: true });
    return loader;
  }

  it('freezes the validator contract version and issue code set (hook contract)', () => {
    expect(VALIDATOR_CONTRACT_VERSION).toBe(1);
    expect([...DOCUMENT_ISSUE_CODES]).toEqual([
      'VALIDATION_FRONTMATTER_MISSING',
      'VALIDATION_FRONTMATTER_MALFORMED',
      'VALIDATION_YAML_PARSE_FAILED',
      'VALIDATION_SCHEMA_MISMATCH',
      'VALIDATION_UNKNOWN',
      'REF_INPUT_TYPE_UNKNOWN',
      'REF_STRUCTURE_INVALID',
      'REF_PATHS_EMPTY',
      'REF_KEY_INVALID',
      'REF_MISSING',
      'CATEGORY_RULE',
    ]);
  });

  it('valid proposed content yields no issues and schemaValid=true', () => {
    const result = validateDocumentContent(VALID_DOC, { knownAssetIds: new Set() });
    expect(result.schemaValid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('missing frontmatter short-circuits with VALIDATION_FRONTMATTER_MISSING', () => {
    const result = validateDocumentContent('no frontmatter here\n', { knownAssetIds: new Set() });
    expect(result.schemaValid).toBe(false);
    expect(result.frontmatter).toBeUndefined();
    expect(result.issues.map((i) => i.code)).toEqual(['VALIDATION_FRONTMATTER_MISSING']);
    expect(result.issues[0].severity).toBe('error');
  });

  it('schema mismatch emits VALIDATION_SCHEMA_MISMATCH and still runs the dead-ref pass', () => {
    // status missing → schema failure; dead-ref pass mirrors the disk path and still runs.
    const content = DOC_WITH_REFS.replace('status: drafting\n', '');
    const result = validateDocumentContent(content, { knownAssetIds: new Set(['hero']) });
    expect(result.schemaValid).toBe(false);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('VALIDATION_SCHEMA_MISMATCH');
    expect(codes).toContain('REF_MISSING');
    // refs-structure / category checks are skipped on schema failure (disk parity)
    expect(codes).not.toContain('CATEGORY_RULE');
  });

  it('emits REF_MISSING for unknown external refs only, with the bare ref id', () => {
    const result = validateDocumentContent(DOC_WITH_REFS, { knownAssetIds: new Set(['hero']) });
    const refIssues = result.issues.filter((i) => i.code === 'REF_MISSING');
    expect(refIssues).toHaveLength(1);
    expect(refIssues[0]).toMatchObject({ severity: 'error', source: 'ref-target', ref: 'ghost' });
    // doc-kind "@:local" refs are not in the asset index and must be skipped
    expect(result.issues.some((i) => i.ref === 'local')).toBe(false);
  });

  it('skips the dead-ref pass when knownAssetIds is omitted (standalone)', () => {
    const result = validateDocumentContent(DOC_WITH_REFS, {});
    expect(result.issues.filter((i) => i.code === 'REF_MISSING')).toEqual([]);
  });

  it('emits REF_KEY_INVALID for malformed refs keys (single RefBinder implementation)', () => {
    const content = VALID_DOC.replace(
      'brief: hero shot',
      'brief: hero shot\nrefs:\n  image:\n    "hero-no-at": ["x.png"]',
    );
    const result = validateDocumentContent(content, { knownAssetIds: new Set() });
    expect(result.issues.some((i) => i.code === 'REF_KEY_INVALID' && i.source === 'refs')).toBe(true);
  });

  it('emits REF_INPUT_TYPE_UNKNOWN for unregistered input types', () => {
    const content = VALID_DOC.replace(
      'brief: hero shot',
      'brief: hero shot\nrefs:\n  bogus-never-registered:\n    "@hero": ["x.png"]',
    );
    const result = validateDocumentContent(content, {
      knownAssetIds: new Set(['hero']),
      inputTypes: loadInputTypes(),
    });
    expect(result.issues.some((i) => i.code === 'REF_INPUT_TYPE_UNKNOWN')).toBe(true);
  });

  it('applies category rules as CATEGORY_RULE issues with severity carried through', () => {
    const ctx: DocumentValidationContext = {
      knownAssetIds: new Set(),
      getCategoryRule: (cat) => (cat === 'shot' ? { required_fields: ['title'] } : undefined),
    };
    const result = validateDocumentContent(VALID_DOC, ctx);
    const ruleIssue = result.issues.find((i) => i.code === 'CATEGORY_RULE');
    expect(ruleIssue).toMatchObject({ severity: 'error', field: 'title', category: 'shot', source: 'category' });
  });

  it('default brief recommendation surfaces as a warning, not an error', () => {
    const noBrief = VALID_DOC.replace('brief: hero shot\n', '');
    const result = validateDocumentContent(noBrief, { knownAssetIds: new Set() });
    const warnings = result.issues.filter((i) => i.severity === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: 'CATEGORY_RULE', field: 'brief' });
  });

  it('skipCategoryRules suppresses CATEGORY_RULE issues only', () => {
    const result = validateDocumentContent(DOC_WITH_REFS, {
      knownAssetIds: new Set(),
      skipCategoryRules: true,
    });
    expect(result.issues.some((i) => i.code === 'CATEGORY_RULE')).toBe(false);
    expect(result.issues.some((i) => i.code === 'REF_MISSING')).toBe(true);
  });

  it('disk content and inline string produce identical issue codes (shared implementation)', () => {
    // The disk path reads the file; --inline receives the same string. Both
    // call validateDocumentContent — assert end-to-end identical results.
    const filePath = path.join(tmpDir, 'proposed.md');
    fs.writeFileSync(filePath, DOC_WITH_REFS);
    const ctx: DocumentValidationContext = { knownAssetIds: new Set(['hero']) };
    const fromDisk = validateDocumentContent(fs.readFileSync(filePath, 'utf-8'), ctx);
    const inline = validateDocumentContent(DOC_WITH_REFS, ctx);
    expect(inline.issues).toEqual(fromDisk.issues);
    expect(inline.issues.map((i) => i.code)).toEqual(['REF_MISSING']);
  });

  it('hashProposedContent is a deterministic sha256 (hook cache key ingredient)', () => {
    const expected = crypto.createHash('sha256').update(DOC_WITH_REFS, 'utf8').digest('hex');
    expect(hashProposedContent(DOC_WITH_REFS)).toBe(expected);
    expect(hashProposedContent(DOC_WITH_REFS)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashProposedContent(DOC_WITH_REFS + ' ')).not.toBe(expected);
  });
});
