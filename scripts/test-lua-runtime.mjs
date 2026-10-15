// Exercises the real runtime and diagnostics modules, not a copy of their logic.
// Run with:  node scripts/test-lua-runtime.mjs
//
// Each case corresponds to a defect measured on the previous harness, or to a
// behaviour the diagnostics engine is expected to recognise, so these facts stay
// true as the code changes.
import { runLua, describeRuntime, EXECUTION_CAN_BE_INTERRUPTED } from '../src/lua/runtime.ts';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    const extra = detail === undefined ? '' : `\n        ${String(detail).replace(/\n/g, '\n        ')}`;
    console.log(`  FAIL  ${name}${extra}`);
  }
}

const outputs = (outcome) => outcome.logs.filter((l) => l.kind === 'output').map((l) => l.text);
const lastOutput = (outcome) => {
  const rows = outputs(outcome);
  return rows.length ? rows[rows.length - 1] : '';
};

console.log('runtime:', JSON.stringify(describeRuntime()));
console.log('EXECUTION_CAN_BE_INTERRUPTED (measured):', EXECUTION_CAN_BE_INTERRUPTED);

// --- 1. print must not throw on non-string values -------------------------
console.log('\n[1] print with tables, nil, booleans');
{
  const r = runLua({
    source: 'local t = {1, 2, key = "v"}\nprint("a", 1, nil, true, t, 2.5)\nprint("after")',
    chunkName: 'Script 1',
  });
  check('run succeeds', r.ok, r.diagnostic?.detail);
  check('table did not abort the script', lastOutput(r) === 'after', lastOutput(r));
  const first = outputs(r)[0] ?? '';
  check('nil rendered', first.includes('nil'), first);
  check('boolean rendered', first.includes('true'), first);
  check('table rendered as table: ...', /table:/.test(first), first);
}

// --- 2. __tostring must be honoured ---------------------------------------
console.log('\n[2] __tostring metamethod');
{
  const r = runLua({
    source: 'local t = setmetatable({}, {__tostring = function() return "custom!" end})\nprint(t)',
    chunkName: 'Script 1',
  });
  check('run succeeds', r.ok, r.diagnostic?.detail);
  check('__tostring honoured', lastOutput(r) === 'custom!', lastOutput(r));
}

// --- 3. a non-string error object must not corrupt the message ------------
console.log('\n[3] error({code = 42})');
{
  const r = runLua({ source: 'error({ code = 42 })', chunkName: 'Script 1' });
  check('run fails as expected', !r.ok);
  const detail = r.diagnostic?.detail ?? '';
  check('no leaking JS TypeError', !detail.includes('to_jsstring'), detail);
  check('error object summarised', detail.includes('table:'), detail);
}

// --- 4. Luau compound assignment is diagnosed by line ---------------------
console.log('\n[4] compound assignment syntax error');
{
  const r = runLua({ source: 'local x = 1\nx += 2\nreturn x', chunkName: 'Script 7' });
  check('run fails', !r.ok);
  check('phase is syntax', r.diagnostic?.phase === 'syntax', r.diagnostic?.phase);
  check('line reported as 2', r.diagnostic?.line === 2, r.diagnostic?.line);
  check('excerpt captured', r.diagnostic?.excerpt === 'x += 2', r.diagnostic?.excerpt);
  check('named as Luau-only', /Compound assignment/.test(r.diagnostic?.title ?? ''), r.diagnostic?.title);
}

// --- 5. `continue` (parser points at the wrong token, so source is used) ---
console.log('\n[5] Luau `continue`');
{
  const r = runLua({ source: 'for i = 1, 3 do\n  continue\nend', chunkName: 'Script 1' });
  check('run fails', !r.ok);
  check('phase is syntax', r.diagnostic?.phase === 'syntax', r.diagnostic?.phase);
  check('named as `continue`', /continue/.test(r.diagnostic?.title ?? ''), r.diagnostic?.title);
}

// --- 6/7. missing names are recognised with the right advice --------------
console.log('\n[6] Roblox global `game`');
{
  const r = runLua({ source: 'print(game:GetService("Players"))', chunkName: 'Script 1' });
  check('run fails', !r.ok);
  check('phase is runtime', r.diagnostic?.phase === 'runtime', r.diagnostic?.phase);
  check('title clearly names unavailable standalone API', /Roblox API unavailable in Aervyx standalone runtime: game/.test(r.diagnostic?.title ?? ''), r.diagnostic?.title);
  check('hint explains no Roblox attachment', /does not attach to Roblox/.test(r.diagnostic?.hint ?? ''), r.diagnostic?.hint);
}

console.log('\n[7] loadstring compatibility');
{
  const r = runLua({ source: 'local f, err = loadstring("return 40 + 2")\nassert(f, err)\nprint(f())', chunkName: 'Script 1' });
  check('loadstring compiles and executes source', r.ok && lastOutput(r) === '42', r.diagnostic?.detail ?? lastOutput(r));
  const example = runLua({ source: `local fn = loadstring("print('loaded')")\nassert(fn)\nfn()`, chunkName: 'loadstring example' });
  check('loadstring returns a callable function that executes print in the active console', example.ok && lastOutput(example) === 'loaded', example.diagnostic?.detail ?? lastOutput(example));
  const arithmetic = runLua({ source: 'loadstring("local x = 10; print(x * 2)")()', chunkName: 'loadstring arithmetic' });
  check('loadstring executes the supplied local-variable chunk', arithmetic.ok && lastOutput(arithmetic) === '20', arithmetic.diagnostic?.detail ?? lastOutput(arithmetic));
  const nested = runLua({ source: 'loadstring("loadstring(\\"print(\\\\\\"nested\\\\\\")\\")()")()', chunkName: 'nested loadstring' });
  check('nested loadstring compiles and executes recursively', nested.ok && lastOutput(nested) === 'nested', nested.diagnostic?.detail ?? lastOutput(nested));
  const invalid = runLua({ source: 'local fn, err = loadstring("local =")\nassert(fn == nil and type(err) == "string")\nprint(err)', chunkName: 'loadstring syntax error' });
  check('loadstring returns Fengari compilation errors', invalid.ok && /expected near/.test(lastOutput(invalid)), invalid.diagnostic?.detail ?? lastOutput(invalid));
}

console.log('\n[7a] normal Lua language features');
{
  const r = runLua({ source: 'local total = 0\nlocal values = {1, 2, 3}\nlocal function add(x) return x + 1 end\nfor i = 1, #values do if values[i] > 1 then total = total + add(values[i]) end end\nprint(total)', chunkName: 'Features' });
  check('variables, functions, tables, loops, and conditionals', r.ok && lastOutput(r) === '7', r.diagnostic?.detail ?? lastOutput(r));
  const next = runLua({ source: 'print(previousRunValue)', chunkName: 'Fresh state' });
  check('each execution starts with clean globals', next.ok && lastOutput(next) === 'nil', next.diagnostic?.detail ?? lastOutput(next));
}

console.log('\n[7c] opt-in local mock fixtures');
{
  const absent = runLua({ source: 'print(game)', chunkName: 'No mock' });
  check('mock disabled by default', absent.ok && lastOutput(absent) === 'nil', absent.diagnostic?.detail ?? lastOutput(absent));
  const mock = runLua({ source: 'local p = game:GetService("Players").LocalPlayer\nprint(game.Name, p.Name, workspace.TestPart.ClassName)', chunkName: 'Mock', mockRoblox: true });
  check('deterministic mock objects available when explicitly opted in', mock.ok && lastOutput(mock) === 'AervyxMockGame\tLocalTestPlayer\tPart', mock.diagnostic?.detail ?? lastOutput(mock));
  const unsupported = runLua({ source: 'game:GetService("RunService")', chunkName: 'Mock unsupported', mockRoblox: true });
  check('unsupported mock service is explicit', !unsupported.ok && /Roblox API unavailable in Aervyx standalone runtime/.test(unsupported.diagnostic?.detail ?? ''), unsupported.diagnostic?.detail);
}

console.log('\n[7b] `math.pow` (removed in 5.3)');
{
  const r = runLua({ source: 'return math.pow(2, 3)', chunkName: 'Script 1' });
  check('run fails', !r.ok);
  check('title names math.pow', /math\.pow` is not available/.test(r.diagnostic?.title ?? ''), r.diagnostic?.title);
}

// --- 8. traceback is attached for nested runtime errors -------------------
console.log('\n[8] nested runtime error yields a traceback');
{
  const r = runLua({
    source: 'local function inner() error("boom") end\nlocal function outer() inner() end\nouter()',
    chunkName: 'Script 1',
  });
  check('run fails', !r.ok);
  const tb = r.diagnostic?.traceback ?? [];
  check('traceback present', tb.length > 0, JSON.stringify(tb));
  check('traceback names the chunk', tb.some((row) => row.includes('Script 1')), JSON.stringify(tb));
  check('traceback shows main chunk', tb.some((row) => row.includes('main chunk')), JSON.stringify(tb));
}

// --- 9. sandbox policy ----------------------------------------------------
console.log('\n[9] sandbox policy');
{
  const strict = runLua({ source: 'print(debug, os.exit, os.time ~= nil, io, require)', chunkName: 'S' });
  check('strict run succeeds', strict.ok, strict.diagnostic?.detail);
  const a = lastOutput(strict).split('\t');
  check('debug removed in strict', a[0] === 'nil', a.join(' | '));
  check('os.exit removed in strict', a[1] === 'nil', a.join(' | '));
  check('os.time kept in strict', a[2] === 'true', a.join(' | '));
  check('io removed in strict', a[3] === 'nil', a.join(' | '));

  const full = runLua({ source: 'print(debug ~= nil, os.exit, os.time ~= nil, io, require)', chunkName: 'S', sandbox: 'full' });
  check('full run succeeds', full.ok, full.diagnostic?.detail);
  const b = lastOutput(full).split('\t');
  check('debug present in full', b[0] === 'true', b.join(' | '));
  check('os.exit still removed in full', b[1] === 'nil', b.join(' | '));
  check('full mode still blocks host I/O and require', b[3] === 'nil' && b[4] === 'nil', b.join(' | '));
}

// --- 10. non-ASCII source must not be truncated (byte length, not code units)
console.log('\n[10] non-ASCII source integrity');
{
  const text = 'héllo wörld — ünïcode';
  const r = runLua({ source: `local s = "${text}"\nprint(#s)`, chunkName: 'S' });
  check('run succeeds', r.ok, r.diagnostic?.detail);
  const expected = Buffer.byteLength(text, 'utf8');
  check('byte length matches UTF-8', Number(lastOutput(r)) === expected, `${lastOutput(r)} vs ${expected}`);
}

// --- 11. successful run, output shape -------------------------------------
console.log('\n[11] clean run');
{
  const r = runLua({
    source: 'print("x", "y")\nlocal s = 0\nfor i = 1, 10 do s = s + i end\nprint(s)\nreturn 1, 2',
    chunkName: 'S',
  });
  check('ok is true', r.ok, r.diagnostic?.detail);
  check('no diagnostic', r.diagnostic === undefined);
  check('tabular output', outputs(r)[0] === 'x\ty', JSON.stringify(outputs(r)[0]));
  check('sum correct', Number(lastOutput(r)) === 55, lastOutput(r));
}

// --- 12. known limitation still stands (informational) --------------------
console.log('\n[12] integer width (informational)');
{
  const r = runLua({ source: 'local s = 0 for i = 1, 200000 do s = s + i end print(s)', chunkName: 'S' });
  console.log(`  INFO  1..200000 summed to ${lastOutput(r)} (exact answer 20000100000)`);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log('failed cases:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
