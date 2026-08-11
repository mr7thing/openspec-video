import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  LocalRhRunner,
  RhCliError,
  buildRunArgs,
  parseRhJson,
  partitionModelPayload,
  resolveRhBinary,
} from '../index';

const FAKE_RH = path.join(__dirname, 'fixtures', 'fake-rh.js');

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rh-runner-test-'));
}

describe('resolveRhBinary', () => {
  const ORIG = process.env.RH_CLI_BINARY;
  afterEach(() => {
    if (ORIG === undefined) delete process.env.RH_CLI_BINARY;
    else process.env.RH_CLI_BINARY = ORIG;
  });

  it('prefers explicit config, then RH_CLI_BINARY env, then PATH default', () => {
    delete process.env.RH_CLI_BINARY;
    expect(resolveRhBinary('/opt/rh')).toBe('/opt/rh');
    process.env.RH_CLI_BINARY = '/env/rh';
    expect(resolveRhBinary(undefined)).toBe('/env/rh');
    expect(resolveRhBinary('/opt/rh')).toBe('/opt/rh');
    delete process.env.RH_CLI_BINARY;
    expect(resolveRhBinary(undefined)).toBe('rh');
  });
});

describe('buildRunArgs', () => {
  it('builds model-mode argv with prompt, media flags, params and -o', () => {
    const args = buildRunArgs({
      mode: 'model',
      endpointId: 'ns/endpoint',
      prompt: 'a cat',
      images: ['/tmp/a.png', '/tmp/b.png'],
      video: '/tmp/c.mp4',
      audio: '/tmp/d.mp3',
      params: { resolution: '720p', duration: 8, nested: { a: 1 } },
      outputDir: '/out',
    });
    expect(args).toEqual([
      '--json', 'model', 'run', '-e', 'ns/endpoint',
      '-p', 'a cat',
      '-i', '/tmp/a.png', '-i', '/tmp/b.png',
      '--video', '/tmp/c.mp4',
      '--audio', '/tmp/d.mp3',
      '--param', 'resolution=720p',
      '--param', 'duration=8',
      '--param', 'nested={"a":1}',
      '-o', '/out',
    ]);
  });

  it('builds app-mode argv with nodes/files/instance-type', () => {
    const args = buildRunArgs({
      mode: 'app',
      appId: '12345',
      nodes: ['52:prompt=a cat', '116:seed=42'],
      files: ['39:image=/tmp/photo.jpg'],
      instanceType: 'plus',
      outputDir: '/out',
    });
    expect(args).toEqual([
      '--json', 'app', 'run', '12345',
      '--node', '52:prompt=a cat',
      '--node', '116:seed=42',
      '--file', '39:image=/tmp/photo.jpg',
      '--instance-type', 'plus',
      '-o', '/out',
    ]);
  });

  it('rejects model mode without endpointId and app mode without appId', () => {
    expect(() => buildRunArgs({ mode: 'model', outputDir: '/o' })).toThrow(RhCliError);
    expect(() => buildRunArgs({ mode: 'app', outputDir: '/o' })).toThrow(RhCliError);
  });
});

describe('parseRhJson', () => {
  it('parses clean JSON', () => {
    expect(parseRhJson('{"files":["a.png"],"texts":[]}')).toEqual({ files: ['a.png'], texts: [] });
  });

  it('tolerates log lines before the JSON document', () => {
    const stdout = 'Downloading...\nsome progress\n{\n  "files": ["a.png"]\n}\n';
    expect(parseRhJson(stdout)).toEqual({ files: ['a.png'] });
  });

  it('returns null for non-JSON output', () => {
    expect(parseRhJson('total garbage')).toBeNull();
    expect(parseRhJson('')).toBeNull();
  });
});

describe('partitionModelPayload', () => {
  it('routes local media files to flags and keeps scalars/URLs as params', () => {
    const dir = tmpDir();
    const img = path.join(dir, 'frame.png');
    const vid = path.join(dir, 'ref.mp4');
    const aud = path.join(dir, 'voice.mp3');
    fs.writeFileSync(img, 'x');
    fs.writeFileSync(vid, 'x');
    fs.writeFileSync(aud, 'x');

    const parts = partitionModelPayload({
      prompt: 'hello',
      resolution: '720p',
      imageUrls: [img],
      videoUrl: vid,
      audio: aud,
      remote: 'https://cdn.example.com/x.png',
      remoteList: ['https://a.com/1.png', 'https://a.com/2.png'],
    });

    expect(parts.images).toEqual([img]);
    expect(parts.video).toBe(vid);
    expect(parts.audio).toBe(aud);
    expect(parts.params).toEqual({
      prompt: 'hello',
      resolution: '720p',
      remote: 'https://cdn.example.com/x.png',
      remoteList: ['https://a.com/1.png', 'https://a.com/2.png'],
    });
    expect(parts.overflow).toEqual([]);
  });

  it('overflows a second local video into params with a warning entry', () => {
    const dir = tmpDir();
    const v1 = path.join(dir, 'a.mp4');
    const v2 = path.join(dir, 'b.mp4');
    fs.writeFileSync(v1, 'x');
    fs.writeFileSync(v2, 'x');

    const parts = partitionModelPayload({ videoUrl: v1, extraVideo: v2 });
    expect(parts.video).toBe(v1);
    expect(parts.overflow).toEqual([v2]);
    expect(parts.params.extraVideo).toBe(v2);
  });

  it('does not treat non-existent paths or data URIs as local files', () => {
    const parts = partitionModelPayload({
      missing: '/no/such/file.png',
      dataUri: 'data:image/png;base64,AAAA',
    });
    expect(parts.images).toEqual([]);
    expect(parts.params.missing).toBe('/no/such/file.png');
    expect(parts.params.dataUri).toBe('data:image/png;base64,AAAA');
  });
});

describe('LocalRhRunner (via fake-rh fixture)', () => {
  let dir: string;
  let runner: LocalRhRunner;
  const ORIG_FAIL = process.env.FAKE_RH_FAIL;

  beforeEach(() => {
    dir = tmpDir();
    runner = new LocalRhRunner();
    delete process.env.FAKE_RH_FAIL;
  });

  afterEach(() => {
    if (ORIG_FAIL === undefined) delete process.env.FAKE_RH_FAIL;
    else process.env.FAKE_RH_FAIL = ORIG_FAIL;
  });

  it('check succeeds against fake binary', async () => {
    await expect(runner.check({ binary: FAKE_RH, apiKey: 'k' })).resolves.toMatchObject({
      status: 'ready',
      capabilities: expect.arrayContaining(['json-check', 'model-run', 'app-run']),
      resumability: 'task-id-after-completion',
    });
  });

  it('runs model mode: downloads land in -o dir and JSON is parsed', async () => {
    const res = await runner.run({
      mode: 'model',
      endpointId: 'ns/t2i',
      prompt: 'a cat',
      params: { resolution: '2k' },
      outputDir: dir,
      binary: FAKE_RH,
      apiKey: 'k',
    });
    expect(res.cost).toBe('0.50');
    expect(res.duration).toBe(42);
    expect(res.files).toHaveLength(1);
    expect(fs.existsSync(res.files[0])).toBe(true);
    expect(res.files[0].endsWith('.png')).toBe(true);
  });

  it('classifies INSUFFICIENT_BALANCE', async () => {
    process.env.FAKE_RH_FAIL = 'balance';
    await expect(runner.run({ mode: 'model', endpointId: 'x', outputDir: dir, binary: FAKE_RH }))
      .rejects.toMatchObject({ kind: 'balance' });
  });

  it('classifies AUTH_FAILED', async () => {
    process.env.FAKE_RH_FAIL = 'auth';
    await expect(runner.run({ mode: 'model', endpointId: 'x', outputDir: dir, binary: FAKE_RH }))
      .rejects.toMatchObject({ kind: 'auth' });
  });

  it('classifies queue/rate limit from stderr', async () => {
    process.env.FAKE_RH_FAIL = 'queue';
    await expect(runner.run({ mode: 'model', endpointId: 'x', outputDir: dir, binary: FAKE_RH }))
      .rejects.toMatchObject({ kind: 'queue-limit' });
  });

  it('classifies exit 0 with garbage stdout as output-missing', async () => {
    process.env.FAKE_RH_FAIL = 'garbage-json';
    await expect(runner.run({ mode: 'model', endpointId: 'x', outputDir: dir, binary: FAKE_RH }))
      .rejects.toMatchObject({ kind: 'output-missing' });
  });

  it('classifies unknown non-zero exit as cli-error', async () => {
    process.env.FAKE_RH_FAIL = 'exit3';
    await expect(runner.run({ mode: 'model', endpointId: 'x', outputDir: dir, binary: FAKE_RH }))
      .rejects.toMatchObject({ kind: 'cli-error', exitCode: 3 });
  });

  it('kills the subprocess on timeout and classifies as timeout', async () => {
    process.env.FAKE_RH_FAIL = 'sleep';
    process.env.FAKE_RH_SLEEP_MS = '5000';
    await expect(runner.run({
      mode: 'model', endpointId: 'x', outputDir: dir, binary: FAKE_RH, timeoutMs: 300,
    })).rejects.toMatchObject({ kind: 'timeout' });
    delete process.env.FAKE_RH_SLEEP_MS;
  }, 15000);

  it('reports binary-missing for a nonexistent binary', async () => {
    await expect(runner.run({
      mode: 'model', endpointId: 'x', outputDir: dir, binary: '/no/such/rh-binary',
    })).rejects.toMatchObject({ kind: 'binary-missing' });
  });

  it('injects the API key as RUNNINGHUB_API_KEY (not visible in argv)', async () => {
    const dump = path.join(dir, 'argv.json');
    process.env.FAKE_RH_ARGV_DUMP = dump;
    await runner.run({
      mode: 'model', endpointId: 'ns/x', prompt: 'p', outputDir: dir,
      binary: FAKE_RH, apiKey: 'super-secret-key',
    });
    const argv: string[] = JSON.parse(fs.readFileSync(dump, 'utf-8'));
    expect(argv.join(' ')).not.toContain('super-secret-key');
    delete process.env.FAKE_RH_ARGV_DUMP;
  });
});
