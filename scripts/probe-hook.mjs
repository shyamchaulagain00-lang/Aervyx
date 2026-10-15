// Hook capability probe. One experiment per process, chosen by argv[2], so that
// an experiment which hangs the VM cannot hide the results of the others. The
// driver (probe-hook-all.mjs) applies a hard timeout and kills a hung child.
import { lua, lauxlib, lualib, to_luastring, to_jsstring } from 'fengari';

const which = process.argv[2];
const lines = [];
const say = (s) => { lines.push(s); process.stdout.write(`${s}\n`); };

if (which === 'constants') {
  say('--- hook constants as Fengari actually exports them ---');
  for (const key of [
    'LUA_MASKCALL', 'LUA_MASKRET', 'LUA_MASKLINE', 'LUA_MASKCOUNT',
    'LUA_HOOKCALL', 'LUA_HOOKRET', 'LUA_HOOKLINE', 'LUA_HOOKCOUNT', 'LUA_HOOKTAILCALL',
    'LUA_MASKCOUNT_bits',
  ]) {
    say(`${key.padEnd(22)} = ${String(lua[key])}`);
  }
  say(`typeof lua_sethook      = ${typeof lua.lua_sethook}`);
  say(`typeof lua_gethookmask  = ${typeof lua.lua_gethookmask}`);
  say(`typeof lua_gethook      = ${typeof lua.lua_gethook}`);
}

if (which === 'fires') {
  // Does a count hook fire at all on a bounded loop?
  const mask = lua.LUA_MASKCOUNT ?? 8;
  say(`using mask=${mask} count=1000`);
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  let ticks = 0;
  let sample = '';
  lua.lua_sethook(L, function (...args) {
    ticks += 1;
    if (!sample) {
      sample = args.map((a) => {
        if (a === L) return '<L>';
        if (a !== null && typeof a === 'object') {
          try { return `obj{${Object.keys(a).slice(0, 8).join(',')}}`; } catch { return 'obj?'; }
        }
        return `${typeof a}:${String(a)}`;
      }).join(' | ');
    }
  }, mask, 1000);

  const src = 'local s = 0 for i = 1, 200000 do s = s + i end return s';
  const load = lauxlib.luaL_loadstring(L, to_luastring(src));
  const call = load === lua.LUA_OK ? lua.lua_pcall(L, 0, 1, 0) : -1;
  say(`load=${load} pcall=${call} ticks=${ticks}`);
  say(`first hook args: ${sample || '<never fired>'}`);
  if (call === lua.LUA_OK) say(`result=${to_jsstring(lauxlib.luaL_tolstring(L, -1))}`);
  lua.lua_close(L);
}

if (which === 'abort') {
  // Can the host hook abort a runaway loop? If this prints, it can.
  const mask = lua.LUA_MASKCOUNT ?? 8;
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  let ticks = 0;
  let raised = 'none';
  lua.lua_sethook(L, function () {
    ticks += 1;
    if (ticks > 20) {
      try { lauxlib.luaL_error(L, to_luastring('execution budget exhausted')); }
      catch (e) { raised = `js-catch:${e && e.message ? e.message : String(e)}`; }
    }
  }, mask, 1000);

  const load = lauxlib.luaL_loadstring(L, to_luastring('while true do end'));
  say(`load=${load}`);
  const started = Date.now();
  const call = lua.lua_pcall(L, 0, 0, 0);
  say(`ABORTED OK ticks=${ticks} pcall=${call} elapsedMs=${Date.now() - started} raisedVia=${raised}`);
  lua.lua_close(L);
}

if (which === 'chunkname') {
  // Confirm the error-message shape so the diagnostics parser has a stable
  // contract to rely on.
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const src = 'local x = 1\nx += 2\nreturn x';
  const load = lauxlib.luaL_loadbuffer(L, to_luastring(src), src.length, to_luastring('@Script 7'));
  say(`syntax load=${load} (LUA_ERRSYNTAX=${lua.LUA_ERRSYNTAX})`);
  try { say(`message: ${to_jsstring(lua.lua_tostring(L, -1))}`); } catch { say('message: <unprintable>'); }
  lua.lua_close(L);
}

if (which === 'traceback') {
  // Does debug.traceback used as errfunc produce a usable Lua traceback?
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const src = 'local function inner() error("boom") end\nlocal function outer() inner() end\nouter()';
  lauxlib.luaL_loadbuffer(L, to_luastring(src), src.length, to_luastring('@Script 1'));
  lua.lua_getglobal(L, to_luastring('debug'));
  lua.lua_getfield(L, -1, to_luastring('traceback'));
  lua.lua_remove(L, -2);
  lua.lua_insert(L, 1);
  const call = lua.lua_pcall(L, 0, 0, 1);
  say(`runtime pcall=${call} (LUA_ERRRUN=${lua.LUA_ERRRUN})`);
  try {
    const tb = to_jsstring(lua.lua_tostring(L, -1));
    tb.split('\n').forEach((l) => say(`  | ${l}`));
  } catch { say('  | <unprintable>'); }
  lua.lua_close(L);
}

if (which === 'nonstring-error') {
  // error() with a non-string value: lua_tostring returns null. Confirm what the
  // existing harness would do (it calls to_jsstring on the result).
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const src = 'error({ code = 42 })';
  lauxlib.luaL_loadbuffer(L, to_luastring(src), src.length, to_luastring('@S'));
  const call = lua.lua_pcall(L, 0, 0, 0);
  say(`pcall=${call}`);
  const raw = lua.lua_tostring(L, -1);
  say(`lua_tostring(top) is null? ${raw === null}`);
  try { say(`to_jsstring(raw) = ${to_jsstring(raw)}`); }
  catch (e) { say(`to_jsstring(raw) THREW: ${e && e.message ? e.message : String(e)}`); }
  try { say(`luaL_tolstring(top) = ${to_jsstring(lauxlib.luaL_tolstring(L, -1))}`); }
  catch (e) { say(`luaL_tolstring THREW: ${e && e.message ? e.message : String(e)}`); }
  lua.lua_close(L);
}
