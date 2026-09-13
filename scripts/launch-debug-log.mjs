const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = process.cwd();
const exe = process.argv[2] ?? path.resolve(root, 'release', 'win-unpacked', 'Aervyx.exe');
const tmp = process.env.TEMP || '.';
const logPath = path.join(tmp, 'aervyx-renderer-debug.log');
const outPath = path.join(tmp, 'aervyx-launch-events.txt');

if (!fs.existsSync(exe)) {
  fs.writeFileSync(outPath, `EXE_NOT_FOUND\n${exe}\n`);
  console.error('EXE_NOT_FOUND', exe);
  process.exit(2);
}

// Reset log so we can tell whether this launch wrote anything.
try { fs.rmSync(logPath, { force: true }); } catch {}

const env = {
  ...process.env,
  AERVYX_DEBUG_RENDERER: '1',
  ELECTRON_ENABLE_LOGGING: '1',
  ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
};

const child = spawn(exe, [], { env, windowsHide: false, detached: false });

const events = [];
let closed = false;
const record = (msg) => {
  events.push(msg);
  console.log(msg);
};

record('EXE=' + exe);
record('LOG=' + logPath);
record('SPAWNED');

child.on('error', (err) => {
  record('SPAWN_ERROR=' + String(err));
  finish();
});

child.on('close', (code) => {
  record('CHILD_CLOSED=' + String(code));
  finish();
});

function finish() {
  if (closed) return;
  closed = true;
  try { child.kill('SIGKILL'); } catch {}
  writeResults();
}

function writeResults() {
  const exists = fs.existsSync(logPath);
  record('LOG_EXISTS=' + String(exists));
  let text = '';
  if (exists) {
    text = fs.readFileSync(logPath, 'utf8');
    record('LOG_BYTES=' + Buffer.byteLength(text, 'utf8'));
    record('LOG_CONTENT_START');
    record(text);
    record('LOG_CONTENT_END');
  }
  fs.writeFileSync(outPath, events.join('\n') + '\n');
}

// Timeout safety net.
setTimeout(finish, 25000);

// Give the renderer some time to start and potentially fail before quitting.
setTimeout(finish, 5000);
