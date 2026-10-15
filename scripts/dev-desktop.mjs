import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const electronEntry = path.join(root, 'node_modules', 'electron', 'cli.js');
const url = 'http://127.0.0.1:5173';
const vite = spawn(process.execPath, [viteEntry, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { cwd: root, stdio: 'inherit' });
let electron;
let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  if (electron && !electron.killed) electron.kill();
  if (!vite.killed) vite.kill();
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
vite.once('exit', (code) => { if (!stopping) { console.error(`Vite exited before Aervyx closed (code ${code}).`); stop(); process.exitCode = code || 1; } });

try {
  let ready = false;
  const deadline = Date.now() + 30_000;
  while (!ready && Date.now() < deadline && !stopping) {
    try { ready = (await fetch(url)).ok; } catch { await delay(300); }
  }
  if (!ready) throw new Error('Vite did not become ready at 127.0.0.1:5173.');
  electron = spawn(process.execPath, [electronEntry, '.'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
  });
  const exitCode = await new Promise((resolve) => electron.once('exit', resolve));
  if (exitCode !== 0) process.exitCode = exitCode ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  stop();
}
