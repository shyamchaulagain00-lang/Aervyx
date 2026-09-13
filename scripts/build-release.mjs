import childProcess from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = process.cwd();
const releaseDir = path.resolve(root, 'release');

function rimrafSync(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) rimrafSync(p);
    else fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

console.log('CLEAN_RELEASE');
rimrafSync(releaseDir);

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = [
  npx,
  'electron-builder',
  '--win',
  'nsis',
  '--config',
  'package.json',
];

const cmd = args.map(arg => {
  if (/[" \\$\\,\\(\)\\\n]/.test(arg)) return `"${arg.replace(/"/g, '""')}"`;
  return arg;
}).join(' ');

console.log('RUN', cmd);

childProcess.execSync(cmd, {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'production' },
});

console.log('BUILD_OK');
