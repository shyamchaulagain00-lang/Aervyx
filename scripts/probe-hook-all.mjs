// Runs each hook experiment in its own process with a hard timeout. A runaway
// Lua loop blocks the child's event loop, so an in-process timeout cannot fire --
// the timeout has to come from out here, and the child has to be killed.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const probe = path.join(here, 'probe-hook.mjs');
const experiments = ['constants', 'fires', 'abort', 'chunkname', 'traceback', 'nonstring-error'];
const TIMEOUT_MS = 6000;

for (const name of experiments) {
  console.log(`\n=================== ${name} ===================`);
  try {
    const stdout = execFileSync(process.execPath, [probe, name], {
      timeout: TIMEOUT_MS,
      encoding: 'utf8',
      killSignal: 'SIGKILL',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    process.stdout.write(stdout);
  } catch (error) {
    if (error.killed || error.signal === 'SIGKILL' || error.code === 'ETIMEDOUT') {
      console.log(`RESULT: HUNG past ${TIMEOUT_MS}ms -> mechanism is NOT usable for a budget.`);
      if (error.stdout) process.stdout.write(String(error.stdout));
    } else {
      console.log(`RESULT: process failed (code=${error.status})`);
      if (error.stdout) process.stdout.write(String(error.stdout));
      if (error.stderr) console.log(`stderr:\n${error.stderr}`);
    }
  }
}

console.log('\n=================== done ===================');
