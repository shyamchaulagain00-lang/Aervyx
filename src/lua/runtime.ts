// The hardened execution harness for the embedded Lua runtime.
//
// Every non-obvious decision here is backed by a measurement against the shipped
// build (fengari 0.1.4 -> Lua 5.3.4). The probe is scripts/probe-hook.mjs and the
// numbers are quoted inline so a future reader can tell deliberate behaviour from
// a bug. scripts/test-lua-runtime.mjs locks the behaviour in.
//
// Three defects in the previous harness are fixed here, each confirmed by probe:
//   1. `lua_tostring` returns NULL for a non-string/number value, and Fengari's
//      to_jsstring throws "to_jsstring expects a Uint8Array" on NULL. The old code
//      passed it straight in, so `print({})` and `error({code=42})` both replaced
//      the real error with that unrelated TypeError. Fixed by converting through
//      luaL_tolstring, which also honours __tostring.
//   2. lua_pcall was given errfunc 0, so runtime errors arrived with no traceback.
//      A traceback handler built on luaL_traceback is installed at absolute stack
//      index 1 instead. The absolute-vs-relative subtlety is the one documented in
//      luau-embed-demo/README.md; the handler is pushed before the chunk precisely
//      so no lua_insert is needed.
//   3. luaL_loadstring used the whole source as the chunk name, producing
//      `[string "..."]:1:` in every message. luaL_loadbuffer with an "@Name" chunk
//      name yields `Script 1:2: ...`, which the diagnostics parser relies on.

import { lua, lauxlib, lualib, to_jsstring, to_luastring } from 'fengari-web';
import { diagnose, formatDiagnostic, type Diagnostic } from './diagnostics.ts';

export type LogKind = 'output' | 'error' | 'warning';

export interface RuntimeLog {
  kind: LogKind;
  text: string;
}

/**
 * Which standard libraries untrusted code is allowed to see.
 *  - 'strict' (default): `debug`, `io`, `package`, `require`, `dofile` and
 *    `loadfile` are removed, and `os` is replaced with a whitelist. Use this for
 *    scripts the user did not write.
 *  - 'full': adds Lua's `debug` library for local debugging. Host access remains
 *    disabled in every mode.
 */
export type SandboxMode = 'strict' | 'full';

/**
 * Whether a script that is already running can be stopped from the host.
 *
 * MEASURED: false, and this is not a tuning problem. The host count hook does
 * fire (mask 8, 400 callbacks over a 200k-iteration loop), but calling
 * luaL_error from inside the hook does not unwind lua_pcall: the probe left
 * `while true do end` running until an external timeout killed the process.
 * A usable stop therefore requires running the VM where it can be killed
 * outright, and is tracked as the next piece of work rather than faked here.
 */
export const EXECUTION_CAN_BE_INTERRUPTED = false;

/** `os` members kept in strict mode. The rest are dropped, including os.exit. */
const SAFE_OS_MEMBERS = ['time', 'clock', 'date', 'difftime'] as const;

/** Globals removed in strict mode. `debug` and `io` are the interesting ones. */
const HOST_ACCESS_GLOBALS = ['io', 'package', 'require', 'dofile', 'loadfile'] as const;

export interface RunOptions {
  source: string;
  /** Name shown in runtime messages. Defaults to "Script". */
  chunkName?: string;
  /** Defaults to 'strict'. */
  sandbox?: SandboxMode;
  /** Receives output/warning lines as they are produced. */
  write?: (log: RuntimeLog) => void;
  /** Installs deterministic, local-only Roblox-shaped test fixtures. Never enabled by the app UI. */
  mockRoblox?: boolean;
}

export interface RunOutcome {
  ok: boolean;
  logs: RuntimeLog[];
  diagnostic?: Diagnostic;
  /** Status from whichever call failed, or LUA_OK. */
  status: number;
  elapsedMs: number;
}

/** Runtime identity, read from the VM rather than hard-coded in the UI. */
export function describeRuntime(): { version: string; release: string; versionNum: number } {
  return {
    version: String(lua.LUA_VERSION ?? 'unknown'),
    release: String(lua.LUA_RELEASE ?? 'unknown'),
    versionNum: Number(lua.LUA_VERSION_NUM ?? 0),
  };
}

/**
 * Convert the value at `index` to a JS string using luaL_tolstring -- the same
 * conversion Lua's own `print` performs. This is what makes tables, nil,
 * booleans and values with a __tostring metamethod safe to render.
 *
 * luaL_tolstring pushes the converted string, so the push is undone here to keep
 * the caller's stack exactly as it was found.
 */
function tostringAt(L: unknown, index: number): string {
  const converted = lauxlib.luaL_tolstring(L, index);
  const text = to_jsstring(converted);
  lua.lua_pop(L, 1);
  return text;
}

function removeGlobal(L: unknown, name: string): void {
  lua.lua_pushnil(L);
  lua.lua_setglobal(L, to_luastring(name));
}

/**
 * Rebuild `os` from an allow-list. Done for every sandbox mode because `os.exit`
 * is measurably present as a real function on this build, and no script the user
 * did not write should be able to end their session.
 */
function replaceOsWithSafeSubset(L: unknown): void {
  const base = lua.lua_gettop(L);
  lua.lua_getglobal(L, to_luastring('os'));
  if (lua.lua_type(L, -1) !== lua.LUA_TTABLE) {
    lua.lua_pop(L, 1);
    return;
  }
  const osIndex = lua.lua_gettop(L);
  lua.lua_newtable(L);
  const safeIndex = lua.lua_gettop(L);

  for (const member of SAFE_OS_MEMBERS) {
    lua.lua_getfield(L, osIndex, to_luastring(member));
    if (lua.lua_type(L, -1) === lua.LUA_TNIL) {
      lua.lua_pop(L, 1);
      continue;
    }
    lua.lua_setfield(L, safeIndex, to_luastring(member));
  }

  lua.lua_pushvalue(L, safeIndex);
  lua.lua_setglobal(L, to_luastring('os'));
  lua.lua_settop(L, base);
}

function installSandbox(L: unknown, mode: SandboxMode): void {
  replaceOsWithSafeSubset(L);
  for (const name of HOST_ACCESS_GLOBALS) removeGlobal(L, name);
  if (mode === 'strict') removeGlobal(L, 'debug');
}

/** Lua 5.3 does not include Lua 5.1's loadstring. This compatibility helper
 * only compiles Lua text inside this already-sandboxed, per-run state. */
function installLoadstring(L: unknown): void {
  lua.lua_pushjsfunction(L, (state: unknown) => {
    if (lua.lua_type(state, 1) !== lua.LUA_TSTRING) {
      lauxlib.luaL_error(state, to_luastring("bad argument #1 to 'loadstring' (string expected)"));
      return 0;
    }
    const source = to_jsstring(lua.lua_tostring(state, 1));
    const bytes = to_luastring(source) as Uint8Array;
    const base = lua.lua_gettop(state);
    const status = lauxlib.luaL_loadbuffer(state, bytes, bytes.length, to_luastring('=(loadstring)'));
    if (status === lua.LUA_OK) return 1;
    const message = readMessageSafely(state);
    lua.lua_settop(state, base);
    lua.lua_pushnil(state);
    lua.lua_pushstring(state, to_luastring(message));
    return 2;
  });
  lua.lua_setglobal(L, to_luastring('loadstring'));
}

/** Small deterministic fixtures for local runtime tests; these are tables, not
 * Roblox Instances, and intentionally implement only GetService and basic names. */
function installMockRoblox(L: unknown): void {
  const base = lua.lua_gettop(L);
  const setString = (table: number, key: string, value: string) => {
    lua.lua_pushstring(L, to_luastring(value)); lua.lua_setfield(L, table, to_luastring(key));
  };
  const makeObject = (name: string, className: string) => {
    lua.lua_newtable(L);
    const index = lua.lua_gettop(L);
    setString(index, 'Name', name); setString(index, 'ClassName', className);
    return index;
  };
  const workspaceIndex = makeObject('Workspace', 'Workspace');
  const partIndex = makeObject('TestPart', 'Part');
  lua.lua_pushnumber(L, 0); lua.lua_setfield(L, partIndex, to_luastring('Transparency'));
  lua.lua_setfield(L, workspaceIndex, to_luastring('TestPart'));
  const playersIndex = makeObject('Players', 'Players');
  const playerIndex = makeObject('LocalTestPlayer', 'Player');
  lua.lua_pushvalue(L, playerIndex); lua.lua_setfield(L, playersIndex, to_luastring('LocalPlayer'));
  const storageIndex = makeObject('ReplicatedStorage', 'ReplicatedStorage');
  lua.lua_newtable(L);
  const gameIndex = lua.lua_gettop(L);
  setString(gameIndex, 'Name', 'AervyxMockGame');
  lua.lua_pushjsfunction(L, (state: unknown) => {
    const serviceName = lua.lua_type(state, 2) === lua.LUA_TSTRING ? to_jsstring(lua.lua_tostring(state, 2)) : '';
    lua.lua_getglobal(state, to_luastring('game'));
    lua.lua_getfield(state, -1, to_luastring(serviceName));
    if (lua.lua_type(state, -1) === lua.LUA_TNIL) {
      lauxlib.luaL_error(state, to_luastring(`Roblox API unavailable in Aervyx standalone runtime: mock service '${serviceName}' is not implemented.`));
      return 0;
    }
    lua.lua_remove(state, -2);
    return 1;
  });
  lua.lua_setfield(L, gameIndex, to_luastring('GetService'));
  lua.lua_pushvalue(L, workspaceIndex); lua.lua_setfield(L, gameIndex, to_luastring('Workspace'));
  lua.lua_pushvalue(L, playersIndex); lua.lua_setfield(L, gameIndex, to_luastring('Players'));
  lua.lua_pushvalue(L, storageIndex); lua.lua_setfield(L, gameIndex, to_luastring('ReplicatedStorage'));
  lua.lua_pushvalue(L, gameIndex); lua.lua_setglobal(L, to_luastring('game'));
  lua.lua_pushvalue(L, workspaceIndex); lua.lua_setglobal(L, to_luastring('workspace'));
  lua.lua_settop(L, base);
}

/**
 * The message handler passed to lua_pcall as errfunc.
 *
 * It receives the error object as its single argument, so that object sits at
 * index 1 of the handler's own frame. luaL_traceback is used directly rather than
 * debug.traceback so that the `debug` library can stay removed in strict mode --
 * the handler needs a traceback, but scripts should not have access to the
 * introspection surface that comes with it.
 */
function buildTracebackHandler() {
  return (L: unknown) => {
    let message: string | null = null;
    try {
      message = tostringAt(L, 1);
    } catch {
      message = null;
    }
    lauxlib.luaL_traceback(L, L, message === null ? null : to_luastring(message), 1);
    return 1;
  };
}

/**
 * Replacement for `print`. The previous implementation called lua_tostring on
 * each argument, which returns NULL for anything that is not a string or number,
 * and Fengari's to_jsstring then threw. `print(someTable)` -- an extremely common
 * thing to write while debugging -- aborted the whole script. Converting via
 * tostringAt uses the same conversion Lua's own print does, so tables, nil,
 * booleans and __tostring all render instead of throwing.
 */
function buildPrintHandler(write: (log: RuntimeLog) => void, kind: LogKind) {
  return (L: unknown) => {
    const count = lua.lua_gettop(L);
    const parts: string[] = [];
    for (let index = 1; index <= count; index += 1) {
      try {
        parts.push(tostringAt(L, index));
      } catch {
        parts.push('<unprintable>');
      }
    }
    write({ kind, text: parts.join('\t') });
    return 0;
  };
}

/** Read the top of the stack as text without ever throwing. */
function readMessageSafely(L: unknown): string {
  const top = lua.lua_gettop(L);
  if (top < 1) return '';
  try {
    return tostringAt(L, top);
  } catch {
    return '';
  }
}

export function runLua(options: RunOptions): RunOutcome {
  const logs: RuntimeLog[] = [];
  const write = options.write ?? ((log: RuntimeLog) => { logs.push(log); });
  const source = options.source ?? '';
  const chunkName = options.chunkName?.trim() || 'Script';
  const sandbox: SandboxMode = options.sandbox ?? 'strict';
  const started = Date.now();

  const L = lauxlib.luaL_newstate();
  let status: number = lua.LUA_OK;

  const settle = (diagnostic?: Diagnostic): RunOutcome => ({
    ok: diagnostic === undefined,
    logs,
    diagnostic,
    status,
    elapsedMs: Date.now() - started,
  });

  try {
    lualib.luaL_openlibs(L);
    installSandbox(L, sandbox);
    installLoadstring(L);
    if (options.mockRoblox === true) installMockRoblox(L);

    // Pushed before the chunk so that it occupies absolute stack index 1, which
    // is what lua_pcall is given as errfunc. Pushing it first removes any need
    // for lua_insert and avoids the negative-index trap documented in
    // luau-embed-demo/README.md.
    lua.lua_pushjsfunction(L, buildTracebackHandler());
    lua.lua_pushjsfunction(L, buildPrintHandler(write, 'output'));
    lua.lua_setglobal(L, to_luastring('print'));
    lua.lua_pushjsfunction(L, buildPrintHandler(write, 'warning'));
    lua.lua_setglobal(L, to_luastring('warn'));

    // Byte length, not source.length: to_luastring yields UTF-8, so the two
    // differ for any non-ASCII character and passing the JS string length would
    // silently truncate the chunk.
    const bytes = to_luastring(source) as Uint8Array;
    status = lauxlib.luaL_loadbuffer(L, bytes, bytes.length, to_luastring(`@${chunkName}`));
    if (status !== lua.LUA_OK) {
      const diagnostic = diagnose({
        status,
        message: readMessageSafely(L),
        phase: 'load',
        source,
        chunkName,
      });
      write({ kind: 'error', text: formatDiagnostic(diagnostic) });
      return settle(diagnostic);
    }

    status = lua.lua_pcall(L, 0, lua.LUA_MULTRET, 1);
    if (status !== lua.LUA_OK) {
      const diagnostic = diagnose({
        status,
        message: readMessageSafely(L),
        phase: 'call',
        source,
        chunkName,
      });
      write({ kind: 'error', text: formatDiagnostic(diagnostic) });
      return settle(diagnostic);
    }

    return settle();
  } catch (error) {
    // A JS-level fault, not a Lua error. Report it as an Aervyx defect instead of
    // letting it escape into React's error boundary and blank the editor.
    const diagnostic: Diagnostic = {
      severity: 'error',
      phase: 'internal',
      title: 'Runtime harness fault',
      detail: error instanceof Error ? error.message : String(error),
      hint:
        'This is a defect in Aervyx rather than in your script. The Lua state was closed ' +
        'cleanly and the app is still usable.',
    };
    write({ kind: 'error', text: formatDiagnostic(diagnostic) });
    return settle(diagnostic);
  } finally {
    lua.lua_close(L);
  }
}
