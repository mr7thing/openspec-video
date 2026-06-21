import { extractRefsFromBody, extractImageRefsFromBody } from '../validate';
import path from 'path';

describe('validate helpers', () => {
  describe('extractRefsFromBody', () => {
    it('extracts @ref from body content', () => {
      const content = `Hello world\n\nSee [@shot-01](@shot-01)\n\nAnd [@project:ref](@project:ref)`;
      const refs = extractRefsFromBody(content);
      expect(refs).toContain('shot-01');
      expect(refs).toContain('project:ref');
    });

    it('returns empty array when no refs', () => {
      const content = 'Just plain text with no refs';
      const refs = extractRefsFromBody(content);
      expect(refs).toEqual([]);
    });
  });

  describe('extractImageRefsFromBody', () => {
    it('extracts markdown image refs with local paths', () => {
      const content = `Some text\n\n![alt text](./images/shot-01.png)\n\nAnother ![preview](assets/preview.jpg)`;
      const refs = extractImageRefsFromBody(content);
      expect(refs).toContain('./images/shot-01.png');
      expect(refs).toContain('assets/preview.jpg');
    });

    it('extracts image refs with absolute paths', () => {
      const content = '![screenshot](/absolute/path/to/image.png)';
      const refs = extractImageRefsFromBody(content);
      expect(refs).toContain('/absolute/path/to/image.png');
    });

    it('returns empty array when no image refs', () => {
      const content = 'No images here, just text and [@ref](@ref)';
      const refs = extractImageRefsFromBody(content);
      expect(refs).toEqual([]);
    });

    it('handles image refs with spaces in alt text', () => {
      const content = '![a very long description with spaces](./path/to/image.png)';
      const refs = extractImageRefsFromBody(content);
      expect(refs).toEqual(['./path/to/image.png']);
    });

    it('does not extract plain URLs as image refs', () => {
      const content = 'Check out https://example.com/image.png for more';
      const refs = extractImageRefsFromBody(content);
      expect(refs).toEqual([]);
    });
  });
});

describe('validate image ref existence', () => {
  const fs = require('fs');
  const os = require('os');
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-validate-test-'));
  });

  afterEach(() => {
    // Clean up
    function rimraf(dir: string) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir)) {
        const p = path.join(dir, entry);
        fs.statSync(p).isDirectory() ? rimraf(p) : fs.unlinkSync(p);
      }
      fs.rmdirSync(dir);
    }
    rimraf(tmpDir);
  });

  function writeFile(relativePath: string, content: string) {
    const fullPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return fullPath;
  }

  it('reports missing image file referenced in body', () => {
    // doc.md references ./images/shot-01.png which does not exist
    writeFile('doc.md', '---\ncategory: shot-design\nasset_id: doc\n---\n\n![preview](./images/shot-01.png)');
    writeFile('videospec/doc.md', '---\ncategory: shot-design\nasset_id: doc\n---\n\n![preview](./images/shot-01.png)');

    const { findMissingImageRefs } = require('../validate');
    const missing = findMissingImageRefs(tmpDir);
    expect(missing).toContainEqual(
      expect.objectContaining({
        file: expect.stringContaining('doc.md'),
        ref: './images/shot-01.png',
      })
    );
  });

  it('passes when image file exists', () => {
    writeFile('images/shot-01.png', 'fake png');
    writeFile('doc.md', '---\ncategory: shot-design\nasset_id: doc\n---\n\n![preview](./images/shot-01.png)');

    const { findMissingImageRefs } = require('../validate');
    const missing = findMissingImageRefs(tmpDir);
    expect(missing).not.toContainEqual(
      expect.objectContaining({
        ref: './images/shot-01.png',
      })
    );
  });

  it('resolves relative paths from document location', () => {
    // doc in subdir references image in parent
    writeFile('shots/doc.md', '---\ncategory: shot-design\nasset_id: doc\n---\n\n![preview](../assets/preview.png)');
    // asset does NOT exist
    const { findMissingImageRefs } = require('../validate');
    const missing = findMissingImageRefs(path.join(tmpDir, 'shots'));
    expect(missing).toContainEqual(
      expect.objectContaining({
        ref: '../assets/preview.png',
      })
    );
  });
});
