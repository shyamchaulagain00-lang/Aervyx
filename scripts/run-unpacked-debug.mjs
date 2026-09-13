#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as nodeSetTimeout } from 'node:timers';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const exe = join(root, 'release', 'win-unpacked', 'Aervyx.exe');

if (process.platform !== 'win32') {
  console.error('This helper is intended for Windows packaging verification.');
  process.exit(1);
}

if (!existsSync(exe)) {
  console.error('EXE_MISSING:', exe);
  process.exit(1);
}

const logDir = join(tmpdir(), 'aervyx-debug-run');
mkdirSync(logDir, { recursive: true });

const batPath = join(logDir, 'launch.bat');
const bat = [
  '@echo off',
  'set AERVYX_DEBUG_RENDERER=1',
  'set ELECTRON_ENABLE_LOGGING=1',
  'start /b /wait "' + exe.replace(/"/g, '""') + '"',
  'rem give renderer time to load/fail',
].join('\r\n') + '\r\n';
writeFileSync(batPath, bat, 'utf8');

const start = process.hrtime.bigint();
const timeoutMs = 22000;

const child = spawn('cmd', ['/c', batPath], {
  cwd: root,
  env: {
    ...process.env,
    AERVYX_DEBUG_RENDERER: '1',
    ELECTRON_ENABLE_LOGGING: '1',
    TEMP: tmpdir(),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsVerbatimArguments: true,
});

let killed = false;
const timer = nodeSetTimeout(() => {
  if (!killed) {
    killed = true;
    child.kill();
  }
}, timeoutMs);

let exitDone = false;
child.on('exit', (code) => {
  if (exitDone) return;
  exitDone = true;
  clearTimeout(timer);
  console.log('EXIT_CODE', code);
});

child.on('error', (err) => {
  console.error('SPAWN_ERROR', err?.message);
  process.exit(1);
});

const outLines = [];
const errLines = [];
child.stdout.on('data', (d) => outLines.push(d.toString()));
child.stderr.on('data', (d) => errLines.push(d.toString()));

await new Promise((resolve) => {
  const check = () => {
    if (child.exitCode !== undefined || killed) {
      resolve();
    } else {
      nodeSetTimeout(check, 250);
    }
  };
  check();
});

console.log('STDOUT', outLines.join('\n'));
console.error('STDERR', errLines.join('\n'));

const latestLog = findLatestRendererLog();
console.log('RENDERER_LOG_PATH', latestLog);
if (latestLog && existsSync(latestLog)) {
  const content = readFileSync(latestLog, 'utf8');
  console.log('RENDERER_LOG_BYTES', Buffer.byteLength(content, 'utf8'));
  console.log('RENDERER_LOG_START', content.slice(0, 4000));
} else {
  console.log('RENDERER_LOG_NOT_FOUND');
}

function findLatestRendererLog() {
  const prefix = 'aervyx-renderer-debug.log';
  const temp = tmpdir();
  try {
    const items = readdirSync(temp);
    const matches = items
      .filter((name) => name.startsWith(prefix))
      .map((name) => join(temp, name));
    if (!matches.length) return null;
    matches.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    return matches[0];
  } catch {
    return null;
  }
}
