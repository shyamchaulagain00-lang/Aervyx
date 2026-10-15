// Diagnostics for the embedded Lua runtime.
//
// Everything here is derived from measurements taken against the exact Fengari
// build this app ships (fengari 0.1.4 -> LUA_RELEASE "Lua 5.3.4",
// LUA_VERSION_NUM 503), not from assumptions about Lua in general. The probe that
// produced these facts is scripts/probe-hook.mjs, which runs each experiment in
// its own child process so that a case which hangs the VM cannot mask the rest.
// scripts/test-lua-runtime.mjs is the safety net that keeps them true.
//
// Design principle: a failure should say what happened, which phase it happened
// in, where in the user's own source it is, and what to do about it. A bare
// "Execution failed" satisfies none of those.
//
// Provenance: Aervyx embeds Lua 5.3. Roblox runs Luau, a separate fork of Lua
// 5.1 carrying some 5.2/5.3 backports. The two overlap but are not the same
// language, and that mismatch is the single most common real-world failure.

/** Where a run failed. `load` is compile-only; `call` means the chunk ran. */
export type RunPhase = 'load' | 'call';

export type DiagnosticPhase = 'syntax' | 'runtime' | 'memory' | 'internal';

export interface Diagnostic {
  severity: 'error' | 'warning';
  phase: DiagnosticPhase;
  /** Short headline shown as the first console line. */
  title: string;
  /** The cleaned message from the runtime. Never empty. */
  detail: string;
  /** 1-based line in the user's script, when it could be determined. */
  line?: number;
  /** Actionable next step. Only set when the failure was actually recognised. */
  hint?: string;
  /** The offending source line, trimmed, so the UI can show it inline. */
  excerpt?: string;
  /** Lua-level traceback lines, when the runtime produced one. */
  traceback?: string[];
}

/**
 * Status codes as exported by the shipped Fengari build. Verified, not assumed:
 * LUA_OK 0, LUA_YIELD 1, LUA_ERRRUN 2, LUA_ERRSYNTAX 3, LUA_ERRMEM 4, LUA_ERRERR 6.
 * LUA_ERRERR is 6, not 5 -- 5 is unused in 5.3.
 */
const STATUS_NAMES: Record<number, string> = {
  0: 'LUA_OK',
  1: 'LUA_YIELD',
  2: 'LUA_ERRRUN',
  3: 'LUA_ERRSYNTAX',
  4: 'LUA_ERRMEM',
  6: 'LUA_ERRERR',
};

export const LUA_OK = 0;
export const LUA_ERRRUN = 2;
export const LUA_ERRSYNTAX = 3;

export function statusName(status: number): string {
  return STATUS_NAMES[status] ?? `LUA_ERR_CODE_${status}`;
}

/** A measured limitation of the embedded runtime, stated rather than hidden. */
export interface RuntimeLimit {
  title: string;
  detail: string;
}

/**
 * Quirks of the shipped build that users should be told about up front instead
 * of discovering them as mystery bugs. Both were measured; see
 * scripts/probe-hook.mjs, and the informational case 12 in
 * scripts/test-lua-runtime.mjs which prints the arithmetic result on every run.
 */
export const RUNTIME_LIMITS: readonly RuntimeLimit[] = [
  {
    title: 'Integers wrap at 32 bits',
    detail:
      'Fengari 0.1.4 does not give Lua 5.3 its full 64-bit integer subtype. Measured: ' +
      'summing 1..200000 returns -1474736480 instead of 20000100000. Real Lua 5.3 uses ' +
      '64-bit integers, and Luau has no integer subtype at all (every number is a double), ' +
      'so this build can silently disagree with both on integer-heavy arithmetic.',
  },
  {
    title: 'A runaway script cannot be interrupted in-process',
    detail:
      'The host instruction hook does fire, but raising from it does not unwind lua_pcall. ' +
      'Measured: installing a count hook and calling luaL_error from it leaves ' +
      '"while true do end" running until an external timeout kills the process. ' +
      'Interruption therefore has to come from outside the Lua thread.',
  },
];

// ---------------------------------------------------------------------------
// Message parsing
// ---------------------------------------------------------------------------

const CHUNK_LOCATION = /^([^\s:][^:]*?):(\d+):\s*([\s\S]*)$/;

/**
 * Pull `chunk:line: message` apart. Fengari emits this shape when the chunk is
 * named via luaL_loadbuffer with an "@Name" chunk name. Measured output:
 *   "Script 7:2: syntax error near '+'"
 * When a chunk was loaded with luaL_loadstring the "name" is the whole source, so
 * the leading segment is a `[string "..."]` blob; that is tolerated and the line
 * number is still recovered.
 */
export function parseLocation(message: string): { chunk: string; line: number; rest: string } | null {
  const firstLine = message.split('\n', 1)[0];
  const match = firstLine.match(CHUNK_LOCATION);
  if (!match) return null;
  const line = Number(match[2]);
  if (!Number.isFinite(line)) return null;
  return { chunk: match[1], line, rest: match[3] };
}

export function readSourceLine(source: string, line: number | undefined): string | undefined {
  if (line === undefined || line < 1) return undefined;
  const rows = source.split(/\r\n|\r|\n/);
  const row = rows[line - 1];
  return row === undefined ? undefined : row.trim();
}

/**
 * Split a message into the primary error plus any traceback the runtime attached.
 * The traceback handler produces "msg\nstack traceback:\n ...".
 */
export function splitTraceback(message: string): { primary: string; traceback?: string[] } {
  const marker = 'stack traceback:';
  const index = message.indexOf(marker);
  if (index === -1) return { primary: message.trim() };
  const primary = message.slice(0, index).trim();
  const traceback = message
    .slice(index + marker.length)
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  return { primary, traceback: traceback.length > 0 ? traceback : undefined };
}

// ---------------------------------------------------------------------------
// Luau-only syntax, matched against the offending source line
// ---------------------------------------------------------------------------

interface SyntaxRule {
  test: RegExp;
  title: string;
  hint: string;
}

/**
 * Matched against the *source line*, not the error text, because the parser's own
 * message is frequently misleading: `continue` inside an if-block is reported as
 * "syntax error near 'end'", pointing at the wrong token entirely. All of the
 * first four rules were measured as load-time failures (LUA_ERRSYNTAX) on the
 * shipped build.
 */
const SYNTAX_RULES: readonly SyntaxRule[] = [
  {
    test: /(^|[^\w.:])continue\b/,
    title: '`continue` is not part of Lua',
    hint:
      '`continue` exists in Luau (Roblox) but not in Lua 5.3. Invert the condition instead, ' +
      'or use `goto` with a label, which Lua 5.3 does support.',
  },
  {
    test: /[+\-*/%^]=|\.\.=/,
    title: 'Compound assignment is not part of Lua',
    hint:
      '`+=`, `-=`, `*=`, `/=`, `%=`, `^=` and `..=` are Luau extensions. Write the explicit ' +
      'form, e.g. `x = x + 1`.',
  },
  {
    test: /`/,
    title: 'Backtick string interpolation is not part of Lua',
    hint:
      'Backtick interpolation is Luau-only. Use `string.format` or concatenation with `..`.',
  },
  {
    test: /\blocal\s+[\w.]+\s*:\s*\w/,
    title: 'Type annotations are not part of Lua',
    hint:
      'Annotations such as `local x: number` are Luau-only. Lua 5.3 has no gradual typing, ' +
      'so remove the annotation.',
  },
  {
    test: /\bexport\s+type\b|(^|\s)type\s+\w+\s*=/,
    title: 'Type declarations are not part of Lua',
    hint: '`type` and `export type` declarations are Luau-only.',
  },
];

// ---------------------------------------------------------------------------
// Names the Lua 5.3 runtime does not provide
// ---------------------------------------------------------------------------

interface GlobalNote {
  reason: string;
  hint: string;
}

/**
 * Each entry is either confirmed nil on the shipped build, or is a Roblox-only
 * name. The distinction drives different advice: `loadstring`/`setfenv`/`bit32`/
 * `unpack`/`math.pow` all work in Roblox but were removed from upstream Lua, so
 * there is a concrete fix. The Roblox globals have no fix in a standalone runtime,
 * and saying so plainly is more useful than a generic nil-value message.
 */
const GLOBAL_NOTES: Record<string, GlobalNote> = {
  loadstring: {
    reason: '`loadstring` is provided by Aervyx as a compatibility helper.',
    hint: 'It compiles source within the current isolated, sandboxed Lua run; it does not provide Roblox compatibility.',
  },
  load: {
    reason: '`load` exists here, but passing a string as the first argument is the 5.1 style.',
    hint: 'In Lua 5.3 `load` accepts a string or a reader function; the second optional argument is the chunk name.',
  },
  setfenv: {
    reason: '`setfenv` was removed in Lua 5.2 in favour of the `_ENV` upvalue.',
    hint: 'Lua 5.3 changes an environment by assigning `_ENV` in the desired scope. Luau keeps `setfenv`.',
  },
  getfenv: {
    reason: '`getfenv` was removed in Lua 5.2 in favour of the `_ENV` upvalue.',
    hint: 'Read the current environment via `_ENV`. Luau keeps `getfenv`.',
  },
  bit32: {
    reason: 'The `bit32` library was deprecated in Lua 5.3.',
    hint: 'Lua 5.3 has native bitwise operators: `&`, `|`, `~`, `<<`, `>>`. Luau provides `bit32` and the operators.',
  },
  unpack: {
    reason: 'The global `unpack` moved to `table.unpack` in Lua 5.2.',
    hint: 'Use `table.unpack(t)`. Luau keeps the global `unpack`.',
  },
  gfind: {
    reason: '`string.gfind` was renamed in Lua 5.1.',
    hint: 'Use `string.gmatch`.',
  },
  getn: {
    reason: '`table.getn` was removed in Lua 5.1.',
    hint: 'Use the length operator `#t`.',
  },
  mod: {
    reason: '`math.mod` was renamed.',
    hint: 'Use `math.fmod` for a remainder with the sign of the dividend, or `%` for modulo.',
  },
  pow: {
    reason: '`math.pow` was removed in Lua 5.3.',
    hint: 'Use the `^` operator. Luau still provides `math.pow`.',
  },
  game: {
    reason: '`game` is a Roblox global that only exists inside the Roblox client.',
    hint:
      'Aervyx is a standalone Lua 5.3 environment. It does not attach to Roblox, so there is ' +
      'nothing for `game` to refer to and the Roblox API is not available here.',
  },
  workspace: {
    reason: '`workspace` is a Roblox global that only exists inside the Roblox client.',
    hint: 'The Roblox API is not available in Aervyx, so `workspace` cannot be provided.',
  },
  Instance: {
    reason: '`Instance` is part of the Roblox datamodel API.',
    hint: 'The Roblox datamodel API is not available in Aervyx.',
  },
  task: {
    reason: '`task` is a Roblox scheduling library.',
    hint: 'Plain Lua 5.3 uses `coroutine` for this. Roblox-only APIs are not available here.',
  },
  wait: {
    reason: '`wait` is a Roblox global.',
    hint: 'Roblox-only. Lua has `os.clock`/`os.time` but no task scheduler without `coroutine`.',
  },
  spawn: {
    reason: '`spawn` is a Roblox global.',
    hint: 'Roblox-only. Use `coroutine.create`/`coroutine.resume` in plain Lua.',
  },
  getgenv: {
    reason: '`getgenv` is provided by third-party Roblox execution environments.',
    hint: 'It is not part of Lua, Luau, or the Roblox API. Nothing here can provide it.',
  },
  getrenv: {
    reason: '`getrenv` is provided by third-party Roblox execution environments.',
    hint: 'Not part of Lua or the Roblox API.',
  },
  hookfunction: {
    reason: '`hookfunction` is provided by third-party Roblox execution environments.',
    hint: 'Not part of Lua or the Roblox API.',
  },
  getrawmetatable: {
    reason: '`getrawmetatable` is provided by third-party Roblox execution environments.',
    hint: 'Plain Lua uses `debug.getmetatable`, and the `debug` library is deliberately not exposed here.',
  },
  request: {
    reason: '`request` is provided by third-party Roblox execution environments.',
    hint: 'Not part of Lua. The embedded runtime has no network access by design.',
  },
  identifyexecutor: {
    reason: '`identifyexecutor` is provided by third-party Roblox execution environments.',
    hint: 'Not part of Lua or the Roblox API.',
  },
};

/**
 * Name extraction and nil-failure detection are kept as SEPARATE patterns on
 * purpose. Combining them into one alternation looked tidy and was wrong: in
 * "attempt to index a nil value (global 'game')" the detection alternative starts
 * earlier in the string, so JS returns that match first and the capture group
 * holding the name stays undefined. Every named-global lookup silently failed.
 */
const NAME_IN_PARENS = /\((?:global|field|upvalue|local)\s+'([^']+)'\)/i;
const NIL_VALUE = /attempt to (?:call|index)\s+(?:a\s+)?nil\s+value/i;

function lookupName(name: string): GlobalNote | undefined {
  const bare = name.trim();
  if (!bare) return undefined;
  if (GLOBAL_NOTES[bare]) return GLOBAL_NOTES[bare];
  // `math.pow` -> pow, `string.gfind` -> gfind, `table.getn` -> getn.
  const last = bare.split('.').pop();
  return last && GLOBAL_NOTES[last] ? GLOBAL_NOTES[last] : undefined;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The runtime reports a missing field as `field 'pow'` without naming the table it
 * was looked up on. That reads poorly, so the qualifier is recovered from the
 * offending source line to name what the user actually wrote: `math.pow`.
 *
 * This is presentation only. Lookup still uses the bare name, so a failed match
 * here degrades to the name the runtime reported rather than losing the note.
 */
function qualifyName(name: string, excerpt: string | undefined): string {
  if (!excerpt || name.includes('.')) return name;
  try {
    const pattern = new RegExp(`([A-Za-z_][\\w.]*)\\.${escapeForRegExp(name)}\\b`);
    const found = excerpt.match(pattern);
    return found ? `${found[1]}.${name}` : name;
  } catch {
    return name;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface DiagnoseInput {
  /** Status returned by luaL_loadbuffer or lua_pcall. */
  status: number;
  /** Message read from the top of the stack, already stringified safely. */
  message: string;
  /** Which call produced the status. */
  phase: RunPhase;
  /** The user's source, used to recover the offending line. */
  source: string;
  /** Chunk name as shown in runtime messages, e.g. "Script 1". */
  chunkName: string;
}

export function diagnose(input: DiagnoseInput): Diagnostic {
  const { status, message, phase, source, chunkName } = input;
  const { primary, traceback } = splitTraceback(message || '');
  const location = parseLocation(primary);

  // Map the status to a phase first: memory and error-handler failures deserve
  // their own voice rather than being funnelled through the syntax path.
  let diagnosticPhase: DiagnosticPhase;
  if (status === 3) diagnosticPhase = 'syntax';
  else if (status === 4) diagnosticPhase = 'memory';
  else if (status === 6) diagnosticPhase = 'internal';
  else diagnosticPhase = phase === 'load' ? 'syntax' : 'runtime';

  const base: Diagnostic = {
    severity: 'error',
    phase: diagnosticPhase,
    title: '',
    detail: primary || `The runtime returned ${statusName(status)} with no message.`,
    line: location?.line,
    excerpt: readSourceLine(source, location?.line),
    traceback,
  };

  if (diagnosticPhase === 'memory') {
    return {
      ...base,
      title: 'Ran out of memory',
      hint:
        'The runtime could not allocate. This usually means unbounded table or string growth. ' +
        'Check for loops that append without a terminating condition.',
    };
  }

  if (diagnosticPhase === 'internal') {
    return {
      ...base,
      title: 'Error handler failed',
      hint:
        'The runtime failed while reporting another error (LUA_ERRERR). That normally means the ' +
        'traceback handler itself raised; please report this case with the script that caused it.',
    };
  }

  if (diagnosticPhase === 'syntax') {
    return { ...base, ...classifySyntax(base, source) };
  }

  return { ...base, ...classifyRuntime(base, chunkName) };
}

/**
 * Syntax failures.
 *
 * The reported line is searched first, then a small window around it, then the
 * whole source. That ordering exists because the parser reports where it gave up,
 * not where the bad token is: `continue` inside a loop is reported as
 * "syntax error near 'end'", which points at the closing keyword. Falling back to
 * a whole-source scan is acceptable because a syntax error has already occurred,
 * so a misclassification costs clarity rather than correctness.
 */
function classifySyntax(base: Diagnostic, source: string): Partial<Diagnostic> {
  const rows = source.split(/\r\n|\r|\n/);
  const reported = base.line;

  const candidates: number[] = [];
  if (reported !== undefined) {
    for (const n of [reported, reported - 1, reported + 1, reported - 2, reported + 2]) {
      if (n >= 1 && n <= rows.length) candidates.push(n);
    }
  }
  for (let n = 1; n <= rows.length; n += 1) candidates.push(n);

  for (const n of candidates) {
    const text = rows[n - 1].trim();
    if (!text) continue;
    const rule = SYNTAX_RULES.find((candidate) => candidate.test.test(text));
    if (rule) {
      // Point at the line that actually contains the construct, which is often
      // more useful than the line the parser complained about.
      return { title: rule.title, hint: rule.hint, line: n, excerpt: text };
    }
  }

  return {
    title: 'Syntax error',
    hint:
      'The parser rejected this before any code ran. When porting from Roblox, the usual causes ' +
      'are Luau-only constructs such as `continue`, `+=`, backtick interpolation and type ' +
      'annotations, none of which Lua 5.3 accepts.',
  };
}

/** Runtime failures: missing names dominate, so recognise those first. */
function classifyRuntime(base: Diagnostic, chunkName: string): Partial<Diagnostic> {
  const innermost = [...(base.traceback ?? [])].reverse().find((row) => row.includes(chunkName));

  const name = base.detail.match(NAME_IN_PARENS)?.[1]?.trim() ?? '';

  if (name) {
    const display = qualifyName(name, base.excerpt);
    const note = lookupName(name);
    if (note) {
      if (['game', 'workspace', 'Instance', 'task', 'wait', 'spawn'].includes(name)) {
        return {
          title: `Roblox API unavailable in Aervyx standalone runtime: ${display}`,
          hint: `${note.reason} ${note.hint}`,
        };
      }
      return { title: `\`${display}\` is not available`, hint: `${note.reason} ${note.hint}` };
    }
    return {
      title: `\`${display}\` is not available`,
      hint:
        `This name is nil in the embedded Lua 5.3 runtime. If it came from the Roblox API it ` +
        `cannot be provided here, because Aervyx does not attach to Roblox. Otherwise it is a ` +
        `typo or a value assigned later than it is used.`,
    };
  }

  const detail = base.detail;
  if (/attempt to index/i.test(detail) && NIL_VALUE.test(detail)) {
    return {
      title: 'Indexed a nil value',
      hint:
        `The value being indexed was nil${innermost ? ` (${innermost})` : ''}. Print it on the ` +
        `preceding line to find where it was meant to be assigned.`,
    };
  }
  if (/attempt to perform arithmetic/i.test(detail)) {
    return {
      title: 'Arithmetic on a non-number',
      hint: 'A value in the operation was nil, a table, or a string Lua could not coerce to a number.',
    };
  }
  if (/attempt to compare/i.test(detail)) {
    return {
      title: 'Compared incompatible values',
      hint: '`<` and `<=` only work between two numbers or two strings. Mixed types raise this error.',
    };
  }
  if (/attempt to concatenate/i.test(detail)) {
    return {
      title: 'Concatenated a non-string',
      hint: 'Wrap the value in `tostring(...)`, or use `string.format`, when joining tables or nil into a string.',
    };
  }
  if (/attempt to call/i.test(detail)) {
    return {
      title: 'Called a non-function',
      hint: 'The call target was nil or not callable, which is normally a misspelled function name.',
    };
  }
  if (/stack overflow/i.test(detail)) {
    return {
      title: 'Stack overflow',
      hint: 'Unbounded recursion. Add a base case, or rewrite the recursion as a loop.',
    };
  }

  return {
    title: 'Runtime error',
    hint:
      'The script compiled and began running, then raised. Line numbers refer to the script named ' +
      'in the traceback.',
  };
}

/**
 * Render a diagnostic as console text. Kept in one place so the console and any
 * future export or test path cannot drift apart.
 */
export function formatDiagnostic(d: Diagnostic): string {
  const rows: string[] = [d.title];
  rows.push(`Phase: ${d.phase}   Severity: ${d.severity}`);
  if (d.line !== undefined) rows.push(`Line: ${d.line}`);
  if (d.excerpt) rows.push(`Source: ${d.excerpt}`);
  rows.push(`Detail: ${d.detail}`);
  if (d.hint) rows.push(`Hint: ${d.hint}`);
  if (d.traceback && d.traceback.length > 0) {
    rows.push('Traceback:');
    d.traceback.forEach((row) => rows.push(`  ${row}`));
  }
  return rows.join('\n');
}
