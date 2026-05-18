import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  logPath,
  appendLog,
  readLastLogEntry,
  getResumeTaskId,
  isTaskCompleted,
  getPollIntervalMs,
  getElapsedMs,
  sleep,
  cleanupLog,
} from '../polling';

describe('polling', () => {
  let tmpDir: string;
  let taskPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-test-'));
    taskPath = path.join(tmpDir, 'task.json');
    fs.writeFileSync(taskPath, '{}');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('computes logPath', () => {
    expect(logPath(taskPath)).toBe(path.join(tmpDir, 'task.log'));
  });

  it('appends and reads log entries', () => {
    appendLog(taskPath, { event: 'submitted', task_id: 'abc' });
    appendLog(taskPath, { event: 'polling', status: 'running' });

    const last = readLastLogEntry(taskPath);
    expect(last?.event).toBe('polling');
    expect(last?.status).toBe('running');
    expect(last?.ts).toBeDefined();
  });

  it('returns null for nonexistent log', () => {
    expect(readLastLogEntry(path.join(tmpDir, 'nonexistent.json'))).toBeNull();
  });

  it('getResumeTaskId returns task_id from pending log', () => {
    appendLog(taskPath, { event: 'submitted', task_id: 'xyz' });
    expect(getResumeTaskId(taskPath)).toBe('xyz');
  });

  it('getResumeTaskId returns null for completed log', () => {
    appendLog(taskPath, { event: 'submitted', task_id: 'xyz' });
    appendLog(taskPath, { event: 'succeeded' });
    expect(getResumeTaskId(taskPath)).toBeNull();
  });

  it('isTaskCompleted detects succeeded', () => {
    appendLog(taskPath, { event: 'succeeded' });
    expect(isTaskCompleted(taskPath)).toBe(true);
  });

  it('isTaskCompleted detects failed', () => {
    appendLog(taskPath, { event: 'failed' });
    expect(isTaskCompleted(taskPath)).toBe(true);
  });

  it('isTaskCompleted returns false for pending', () => {
    appendLog(taskPath, { event: 'submitted' });
    expect(isTaskCompleted(taskPath)).toBe(false);
  });

  it('computes default poll intervals', () => {
    expect(getPollIntervalMs(0)).toBe(10_000);
    expect(getPollIntervalMs(4 * 60 * 1000)).toBe(10_000);
    expect(getPollIntervalMs(6 * 60 * 1000)).toBe(30_000);
    expect(getPollIntervalMs(11 * 60 * 1000)).toBe(60_000);
    expect(getPollIntervalMs(31 * 60 * 1000)).toBe(300_000);
  });

  it('computes custom poll intervals', () => {
    const intervals = [
      { thresholdMinutes: 1, intervalSeconds: 5 },
      { thresholdMinutes: 5, intervalSeconds: 15 },
    ];
    expect(getPollIntervalMs(0, intervals)).toBe(5_000);
    expect(getPollIntervalMs(2 * 60 * 1000, intervals)).toBe(15_000);
    expect(getPollIntervalMs(10 * 60 * 1000, intervals)).toBe(15_000);
  });

  it('computes elapsed time from log', () => {
    appendLog(taskPath, { event: 'submitted', task_id: 't1' });
    const elapsed = getElapsedMs(taskPath);
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(1000);
  });

  it('returns 0 elapsed for missing log', () => {
    expect(getElapsedMs(path.join(tmpDir, 'no.json'))).toBe(0);
  });

  it('sleeps for specified duration', async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });

  it('cleanupLog removes log file', () => {
    appendLog(taskPath, { event: 'submitted' });
    cleanupLog(taskPath);
    expect(fs.existsSync(logPath(taskPath))).toBe(false);
  });
});
