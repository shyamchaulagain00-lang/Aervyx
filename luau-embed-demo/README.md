# luau-embed-demo

A self-contained C++17 example that embeds a **Luau** interpreter (with a stock
**Lua 5.1** fallback) and demonstrates the four mechanics you asked for, printing
the interpreter stack at every step that matters:

1. **Initialization of a `lua_State`** - `luaL_newstate()` + `luaL_openlibs()`
2. **Loading source from a string** - `luau_compile()` + `luau_load()`, which is
   what modern Luau uses instead of `luaL_loadbuffer()`
3. **A custom C++ function callable from Lua** - seven `lua_CFunction`s
4. **Marshalling in both directions** - Lua values into C++ (including tables),
   and C++ values back into Lua (including tables and multi-value returns)

It also covers what usually breaks first-time embeddings: protected calls,
traceback error handlers, re-entrant `lua_pcall` from inside a C function, four
distinct failure modes, and `lua_close()` teardown.

---

## Verified against

| Item | Value |
| --- | --- |
| Luau revision | `7d5f73364fdbbaa984fa545071630eba73cfea98` (2026-09-15) |
| Compiler used | MSVC 19.51.36231 (Visual Studio Build Tools 18), `/std:c++17 /O2` |
| Build script | `build-msvc.ps1` (validated end to end) |
| Result | Compiles with **0 warnings**, runs with **exit code 0** |

Luau's C API changes over time, so pin the revision if you want exactly the
behaviour described here. Three of the traps below are recent changes.

---

## Requirements

- **Option A (no CMake needed):** `git` + the Visual Studio "Desktop development
  with C++" workload. Use `build-msvc.ps1`.
- **Option B:** CMake 3.16+ and any C++17 compiler. Use `CMakeLists.txt`.
- No other dependencies. Luau is fetched from GitHub on the first build.

---

## Build and run

### Windows / MSVC (validated)

```powershell
cd luau-embed-demo
pwsh -File .\build-msvc.ps1     # fetches Luau into %LOCALAPPDATA%\luau-embed-demo\luau
.\build\luau_embed_demo.exe     # run FROM THE PROJECT ROOT
```

Already have a Luau checkout? Point the script at it:

```powershell
pwsh -File .\build-msvc.ps1 -LuauSrc 'C:\src\luau'
```

### CMake (provided, not executed on the development machine)

```powershell
cmake -S . -B build-cmake -DCMAKE_BUILD_TYPE=Release
cmake --build build-cmake --config Release
.\build-cmake\Release\luau_embed_demo.exe
```

Run it from the project root or `scripts/marshalling.lua` will not be found. The
demo tries `scripts/`, `../scripts/` and `../../scripts/` before reporting that it
could not open the file, so running from `build\` also works.

### Building against stock Lua 5.1 instead

Omit `-DLUAU_EMBED=1` and provide Lua 5.1 headers + library. The code then takes
the `luaL_loadbuffer()` path and the 2-argument `lua_pushcfunction(L, fn)` form.
Everything else in `main.cpp` is identical - that portability is why the
`PUSH_CFUNC` macro and the `loadString()` wrapper exist.

---

## Expected output

Exact output of the verified run (stack dumps abridged only where repetition makes
it long):

```
=== luau-embed-demo | engine: Luau ===

[DEMO 1] lua_State creation and library setup
    fresh state                        stack depth = 0  [empty]

[DEMO 2] registering lua_CFunctions as globals
    after registering C functions      stack depth = 0  [empty]
    after lua_getglobal("cpp_add")     stack depth = 1
      slot[ 1] (neg  -1)  function   <function>
      globals["cpp_add"] has Lua type: function
      (Luau: luaL_sandbox(L) available for read-only globals - left OFF)

[DEMO 3] load-from-string: compile + run the embedded chunk

  -- embedded chunk
    after compile (chunk is on top)    stack depth = 1
      slot[ 1] (neg  -1)  function   <function>
    [lua] chunk started
    [lua] cpp_add(19, 23)                  -> 42
    [lua] cpp_join('aervyx', 1, true, nil) -> "aervyx" | 1 | true | nil
    [lua] cpp_stats({12,48,7,33,2})        -> count=5 sum=102 mean=20.4 best=48
    [lua] cpp_dumpTable(samples)           -> 1=12, 2=48, 3=7, 4=33, 5=2
    [lua] record.name                      -> luau-embed-demo
    [lua] record.version                   -> 1
    [lua] record.windows                   -> true
    [lua] record.scores.min                -> 1
    [lua] record.steps[3]                  -> run
    [lua] #record.steps                    -> 3
    [lua] record.add(5, 6)                 -> 11
    [lua] cpp_apply(combine, 7)            -> 714
    [lua] chunk finished
    embedded chunk finished with 2 result slot(s)
      result 1: 42
      result 2: ""aervyx" | 1 | true | nil"

[DEMO 4] load-from-file: read + compile + run scripts/marshalling.lua

  -- scripts/marshalling.lua
    after compile (chunk is on top)    stack depth = 1
      slot[ 1] (neg  -1)  function   <function>
    [lua-file] cpp_stats(squares)      -> count=6 sum=91 mean=15.166666666666666 best=36
    [lua-file] cpp_dumpTable(squares)  -> 1=1, 2=4, 3=9, 4=16, 5=25, 6=36
    [lua-file] cpp_dumpTable(mixed)    -> "ok"=true, "depth"=3, "name"="marshalling", "limits"=<table>
    [lua-file] cpp_apply(double, 21)   -> 42
    scripts/marshalling.lua finished with 4 result slot(s)
      result 1: "file chunk finished"
      result 2: 6
      result 3: true
      result 4: <table>

[DEMO 5] C++ -> Lua: call the global lua_scale(value, factor)
    function + arguments on the stack  stack depth = 3
      slot[ 1] (neg  -3)  function   <function>
      slot[ 2] (neg  -2)  number     21
      slot[ 3] (neg  -1)  number     2
    results of lua_scale(21, 2)        stack depth = 2
      slot[ 1] (neg  -2)  number     42
      slot[ 2] (neg  -1)  string     "scaled by 2"
      lua_scale(21, 2) -> 42, "scaled by 2"

[DEMO 6] error handling: four failure modes and their diagnostics

  -- runtime error
    !! runtime error failed: LUA_ERRRUN (status 2)
    !! message: "[string "runtime-error-demo"]:2: intentional failure raised inside a Lua function
[string "runtime-error-demo"]:2 function boom
[string "runtime-error-demo"]:4
"

  -- syntax error
    !! syntax error failed: LUA_YIELD (status 1)
    !! message: "[string "syntax-error-demo"]:1: Expected identifier when parsing expression, got '='"

  -- c-side error
    !! c-side error failed: LUA_ERRRUN (status 2)
    !! message: "[string "c-error-demo"]:1: cpp_fail raised a C-side error: propagated from Lua into C++ and back
[string "c-error-demo"]:1
"

  -- argument type error
    !! argument type error failed: LUA_ERRRUN (status 2)
    !! message: "[string "type-error-demo"]:1: invalid argument #1 to 'cpp_add' (number expected, got string)
[string "type-error-demo"]:1
"

[DEMO 7] a second lua_State shares nothing with the first
      globals["cpp_add"] in the new state: nil

  -- second state
    second state finished with 1 result slot(s)
      result 1: 5
      second state closed; the first state is untouched

[teardown] releasing the first state
    just before lua_close              stack depth = 0  [empty]

=== done ===
```

Note the syntax-error line: the status is `LUA_YIELD (status 1)`, not
`LUA_ERRSYNTAX`. That is not a bug in the demo - see trap #2 below.

---

## The six API details that actually break embeddings

Every one of these was verified against the Luau revision above.

### 1. Luau has no `luaL_loadbuffer`, `luaL_loadstring` or `luaL_loadfile`

A repo-wide search of Luau returns zero hits for `luaL_loadbuffer`. Loading source
is a two-library operation:

```cpp
lua_CompileOptions options;                   // zero-init first, then set what you want
memset(&options, 0, sizeof(options));
options.optimizationLevel = 1;                // 2 enables inlining, which hurts backtraces
options.debugLevel = 1;                       // line numbers + names, enough for tracebacks

size_t size = 0;
char* bytecode = luau_compile(source, len, &options, &size);      // Compiler library
int status = luau_load(L, chunkname, bytecode, size, /*env=*/0);  // VM library, 0 = globals
free(bytecode);
```

The compiler never touches a `lua_State`, so you can compile on a worker thread
and cache the bytecode. `env = 0` means "the current thread's global table"; any
other value is a stack index of the environment table to use instead.

Also: this revision documents the `luau_compile` buffer as `use free() to
destroy`. Older Luau releases exposed `luau_free()`.

### 2. A compile error is reported by `luau_load`, with status `1`

`luau_compile` does not fail on a syntax error. It returns a bytecode blob whose
first byte is `0` and whose remaining bytes are the parser message. `luau_load`
detects that, pushes `"chunkname: <parser error>"` and returns **`1`** - which in
the `lua_Status` enum is `LUA_YIELD`, not `LUA_ERRSYNTAX`:

```cpp
// lvmload.cpp
if (version == 0)          // 0 means the rest of the bytecode is the error message
{
    lua_pushfstring(L, "%s%.*s", chunkid, int(size - offset), data + offset);
    return 1;
}
```

**Rule: test `status != LUA_OK`, never `status == LUA_ERRSYNTAX`.** This is why
`statusText()` in the demo prints the raw number alongside the name.

### 3. `lua_pushcfunction` takes a debug name in current Luau

```cpp
lua_pushcfunction(L, fn, "my_fn");   // Luau  -> lua_pushcclosurek(L, fn, name, 0, NULL)
lua_pushcfunction(L, fn);            // Lua 5.1
```

The demo hides this behind `PUSH_CFUNC(L, fn, name)` so the same line compiles
against both engines.

### 4. Build Luau with `LUA_USE_LONGJMP=1`

`luaconf.h` defaults it to `0`, which makes `luaL_error()` **throw a C++
exception**. Throwing across the `extern "C"` API boundary is undefined behaviour.
Luau's own CMake sets it, with the comment: *"otherwise functions like luaL_error
will throw C++ exceptions, which can't be done from extern \"C\" functions"*.

**Caveat either way:** `luaL_error()` does not run the destructors of C++ locals
in the frames it unwinds. Keep RAII objects out of any scope that can raise a Lua
error - the demo deliberately keeps `luaL_error()` calls free of live `std::string`s.

### 5. The error handler must go *below* the function, not on top of it

`lua_pcall` calls whatever value is on top of the stack. Pushing the traceback
handler last makes the handler the callee - the real function never runs, and you
get a bogus "success". The handler has to be inserted *under* the function:

```cpp
const int fnIndex = lua_gettop(L) - nargs;      // absolute index of the function
PUSH_CFUNC(L, cppTraceback, "__traceback");     // pushed on top ...
lua_insert(L, fnIndex);                         // ... then moved below the function
int status = lua_pcall(L, nargs, nresults, fnIndex);   // absolute index, never negative
lua_remove(L, fnIndex);                         // drop the handler
```

`errfunc` must be an **absolute** index: a negative one is invalidated the moment
`lua_pcall` rearranges the stack.

This bug is subtle because it does not crash. In the first run of this demo, the
traceback handler was called instead of the chunk, and the program cheerfully
reported success with the *chunk* as its single "result".

### 6. The function must be pushed *before* its arguments

```cpp
lua_getglobal(L, "f");   // 1. the function
lua_pushnumber(L, 21);   // 2. argument 1
lua_pushnumber(L, 2);    // 3. argument 2
lua_pcall(L, 2, 1, 0);
```

Reversed, the VM reads argument 1 as the callee and fails with
`attempt to call a number value` - the exact error the first version of DEMO 5
produced. `pushGlobalFunction()` in the demo exists so the correct order is
enforced at the call site, and `runFunctionOnTop()` defensively rejects a
`(top - nargs)` slot that is not a function.

---

## The execution pipeline, in the order the code runs it

```
luaL_newstate()                     allocate state: empty stack, fresh globals
      |
luaL_openlibs(L)                    print / table / string / math / debug ...
      |
registerFunction(L, name, fn)       per C function: PUSH_CFUNC + lua_setglobal
      |                             (lua_setglobal pops, so the stack stays balanced)
      |-- optional: luaL_sandbox(L)   makes the global table read-only
      |
loadString(L, name, src, len)       luau_compile  -> bytecode (Compiler library)
      |                             luau_load     -> chunk closure, pushed on the stack
      |                             free(bytecode)
      |
runFunctionOnTop(L, 0, n, &first)   push traceback, lua_insert it below the chunk,
      |                             lua_pcall, lua_remove the handler
      |
   LUA_OK ? -> results start at index `first`   (LUA_MULTRET keeps them all)
      |
   error  ? -> the error object is at index `first`; statusText() names the code
      |
lua_settop(L, first - 1)            drop the results, restore the stack depth
      |
lua_close(L)                        free everything owned by the state
```

Inside a running chunk, `cpp_stats(samples)` looks like this from the VM's side:

```
Lua: cpp_stats(samples)  ->  the VM pushes [samples] as slot 1 of a new C frame
C++: luaL_checktype(L, 1, LUA_TTABLE)   validate argument 1
     lua_objlen(L, 1)                   array length (same as Lua's '#')
     lua_rawgeti -> lua_pop              read element i without growing the stack
     lua_pushnumber x4                  push the four results
     return 4                           "the top 4 slots are my results"
Lua: local count, sum, mean, best = cpp_stats(samples)   <- four values, in order
```

---

## Marshalling cheat sheet

**Reading Lua values from C++** (`idx` = stack slot):

| Lua value | Read it with | Notes |
| --- | --- | --- |
| anything | `lua_type(L, idx)` | returns `LUA_TNUMBER`, `LUA_TTABLE`, ... |
| number | `lua_tonumber(L, idx)` | returns `double` |
| string | `lua_tolstring(L, idx, &len)` | pointer **and** length; not NUL-terminated by contract |
| boolean | `lua_toboolean(L, idx)` | anything except `false`/`nil` is true |
| table field | `lua_getfield` / `lua_rawgeti` | pushes a value; you must pop it |
| table entry | `lua_next(L, idx)` | raw traversal; pop the value, keep the key |
| table length | `lua_objlen(L, idx)` | array part only |
| validated | `luaL_checknumber`, `luaL_checktype`, `luaL_checklstring`, `luaL_checkinteger` | **raise a Lua error** naming `bad argument #N` |

**Pushing C++ values into Lua:**

| C++ value | Push it with | Pop it into something |
| --- | --- | --- |
| nil | `lua_pushnil(L)` | `lua_setglobal(L, "x")` |
| boolean | `lua_pushboolean(L, 1)` | `lua_setfield(L, -2, "k")` |
| number | `lua_pushnumber(L, 3.5)` | `lua_rawseti(L, -2, 1)` |
| string | `lua_pushlstring(L, p, len)` | `lua_setfield(L, -2, "k")` |
| table | `lua_createtable(L, narr, nrec)` | `lua_setfield(L, -2, "k")` |
| C function | `PUSH_CFUNC(L, fn, "name")` | `lua_setfield(L, -2, "k")` |

Every write follows the same shape: **push the value, then pop it into a
container using a relative index.** The container is at `-2` immediately after the
push, which is why `lua_setfield(L, -2, "k")` appears everywhere in the demo.

---

## How the requirements map to the code

| Requirement | Where it lives |
| --- | --- |
| 1. Initialise the `lua_State` | `main()`, DEMO 1 - `luaL_newstate()` + `luaL_openlibs()`, torn down with `lua_close()` |
| 2. Load code from a string | `loadString()` - `luau_compile()` + `luau_load()`, driven by `runSource()` in DEMO 3 |
| 3. A custom C++ function callable from Lua | `cpp_add`, `cpp_join`, `cpp_stats`, `cpp_dumpTable`, `cpp_makeRecord`, `cpp_apply`, `cpp_fail`, registered in DEMO 2 |
| 4. Data marshalling both ways | Lua -> C++: `cpp_stats`, `cpp_dumpTable`, `cpp_apply`. C++ -> Lua: `cpp_makeRecord`, the multi-value returns of `cpp_stats`, and DEMO 5's direct call |
| Execution flow with `lua_pcall` | `runFunctionOnTop()`, with the traceback handler installed as `errfunc` |
| Stack manipulation, documented | `dumpStack()` prints every occupied slot before and after each interesting operation |

---

## Files

```
main.cpp                    the whole demo, sectioned and commented
scripts/marshalling.lua     the "load from file" script (plain Lua 5.1 syntax)
build-msvc.ps1              MSVC-only build: locates vcvars64.bat, compiles Luau + main.cpp
CMakeLists.txt              FetchContent build against Luau's own CMake targets
README.md                   this file
```

`build-msvc.ps1` compiles Luau's `Common`, `Ast`, `Bytecode`, `Compiler` and `VM`
sources directly - `CodeGen`, `Analysis` and `Inliner` are not needed for
compile-and-run, and leaving them out keeps the build short.

---

## Deliberate limitations

- **Hash iteration order is not stable.** `cpp_dumpTable` uses `lua_next`, so the
  order of non-array keys (`"ok"`, `"depth"`, `"name"`, `"limits"`) is an
  implementation detail. Array parts iterate in order. Do not build a golden test
  on this output.
- **No coroutine / `lua_resume` demo.** Yielding across a C call needs the
  continuation-passing variants (`lua_pcallk` in Lua 5.1, `lua_Continuation` /
  `lua_pcallyieldable` in Luau) plus a different error model. Left out on purpose:
  getting it half right is worse than not showing it.
- **No `userdata`/metatable section.** `luaL_newmetatable` exists in Luau and is
  the usual way to expose C++ objects to scripts, but it deserves its own document.
- **Sandboxing is shown, not enabled.** `luaL_sandbox(L)` is a Luau extra that
  makes globals read-only; it must be called *after* every `registerFunction()`.
- **The CMake path is unexecuted.** No CMake on the machine this was developed on,
  so `CMakeLists.txt` was reviewed rather than run. `build-msvc.ps1` is the path
  that was verified end to end.

