#!/usr/bin/env node
// ============================================================================
// fake-rh — test fixture mimicking RH_CLI's CLI surface + JSON contract.
// No network. Behavior controlled by env:
//   FAKE_RH_FAIL=auth|balance|queue|garbage-json|exit3|nofiles|sleep
//   FAKE_RH_ARGV_DUMP=/path   → write process.argv (JSON) for assertion
//   FAKE_RH_SLEEP_MS=5000     → delay before responding (timeout tests)
//   FAKE_RH_TEXTS=1           → return texts instead of files
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const fail = process.env.FAKE_RH_FAIL || '';

if (process.env.FAKE_RH_ARGV_DUMP) {
  fs.writeFileSync(process.env.FAKE_RH_ARGV_DUMP, JSON.stringify(argv));
}

function out(obj, code = 0) {
  process.stdout.write(JSON.stringify(obj) + '\n');
  process.exit(code);
}

function argValue(flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function finish() {
  if (fail === 'auth') out({ error: 'AUTH_FAILED', message: 'API key 验证失败：invalid' }, 1);
  else if (fail === 'balance') out({ error: 'INSUFFICIENT_BALANCE', message: '账户余额不足' }, 1);
  else if (fail === 'queue') { process.stderr.write('HTTP 429 queue limit exceeded\n'); process.exit(1); }
  else if (fail === 'garbage-json') { process.stdout.write('this is not json at all\n'); process.exit(0); }
  else if (fail === 'exit3') { process.stderr.write('boom\n'); process.exit(3); }
  else if (fail === 'nofiles') out({ files: [], texts: [], cost: '0.00', duration: 1, task_id: 'fake-none' });

  if (argv.includes('check')) {
    out({ status: 'ready', version: 'test-1.0.0', capabilities: ['json-check', 'model-run', 'app-run'], resumability: 'task-id-after-completion', balance: '10.00' });
  }

  // model run / app run: locate -o <output>
  const output = argValue('-o') || argValue('--output') || '.';
  fs.mkdirSync(output, { recursive: true });

  if (process.env.FAKE_RH_TEXTS === '1') {
    out({ files: [], texts: ['[Verse 1] fake lyrics'], cost: '0.05', duration: 3, task_id: 'fake-txt' });
  }

  const isVideo = argv.some(a => /video/i.test(a));
  const name = isVideo ? 'result.mp4' : 'result.png';
  const file = path.join(output, name);
  fs.writeFileSync(file, Buffer.from(isVideo ? 'fake-mp4-bytes' : 'fake-png-bytes'));
  out({ files: [file], texts: [], cost: '0.50', duration: 42, task_id: 'fake-123' });
}

const sleepMs = fail === 'sleep' ? parseInt(process.env.FAKE_RH_SLEEP_MS || '5000', 10) : 0;
if (sleepMs > 0) setTimeout(finish, sleepMs);
else finish();
