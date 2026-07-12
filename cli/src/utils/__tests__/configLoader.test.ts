import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConfigLoader } from '../configLoader';
import { ErrorFactory } from '../../errors/OpsVError';

describe('ConfigLoader', () => {
  let tmpDir: string;
  let loader: ConfigLoader;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-cfg-'));
    loader = new ConfigLoader();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(content: string) {
    const opsvDir = path.join(tmpDir, '.opsv');
    fs.mkdirSync(opsvDir, { recursive: true });
    fs.writeFileSync(path.join(opsvDir, 'api_config.yaml'), content);
  }

  it('loads built-in config when file missing', () => {
    const cfg = loader.loadConfig(tmpDir);
    // When no project config exists, built-in defaults are loaded
    expect(Object.keys(cfg.models).length).toBeGreaterThan(0);
    // Built-in models include volc.seadream5, siliconflow.want2v, etc.
    expect(cfg.models['volc.seadream5']).toBeDefined();
  });

  it('loads valid YAML config', () => {
    writeConfig(`
models:
  volc.seadream5:
    provider: volcengine
    type: imagen
    api_url: http://api
`);
    const cfg = loader.loadConfig(tmpDir);
    expect(cfg.models['volc.seadream5'].provider).toBe('volcengine');
    expect(cfg.models['volc.seadream5'].type).toBe('imagen');
  });

  it('returns model config', () => {
    writeConfig(`
models:
  test.model:
    provider: test
`);
    loader.loadConfig(tmpDir);
    expect(loader.getModelConfig('test.model')?.provider).toBe('test');
    expect(loader.getModelConfig('missing')).toBeUndefined();
  });

  it('returns settings', () => {
    writeConfig(`
models: {}
settings:
  dirs:
    videospec: custom-spec
`);
    loader.loadConfig(tmpDir);
    expect(loader.getSettings()?.dirs?.videospec).toBe('custom-spec');
  });

  it('resolves required env var', () => {
    process.env.TEST_API_KEY = 'secret123';
    writeConfig(`
models:
  test.model:
    provider: test
    required_env:
      - TEST_API_KEY
`);
    loader.loadConfig(tmpDir);
    expect(loader.getResolvedApiKey('test.model')).toBe('secret123');
    delete process.env.TEST_API_KEY;
  });

  it('resolves fallback env var', () => {
    process.env.FALLBACK_KEY = 'fallback456';
    writeConfig(`
models:
  test.model:
    provider: test
    required_env: []
    fallback_env:
      - FALLBACK_KEY
`);
    loader.loadConfig(tmpDir);
    expect(loader.getResolvedApiKey('test.model')).toBe('fallback456');
    delete process.env.FALLBACK_KEY;
  });

  it('returns empty string when no key required', () => {
    writeConfig(`
models:
  local.model:
    provider: comfylocal
`);
    loader.loadConfig(tmpDir);
    expect(loader.getResolvedApiKey('local.model')).toBe('');
  });

  it('throws when model config missing', () => {
    writeConfig(`models: {}`);
    loader.loadConfig(tmpDir);
    expect(() => loader.getResolvedApiKey('missing')).toThrow();
  });

  it('throws when API key missing', () => {
    delete process.env.MISSING_KEY;
    writeConfig(`
models:
  test.model:
    provider: test
    required_env:
      - MISSING_KEY
`);
    loader.loadConfig(tmpDir);
    expect(() => loader.getResolvedApiKey('test.model')).toThrow('Missing API Key');
  });
});
