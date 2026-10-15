// ============================================================================
//  luau-embed-demo - embedding a Luau (or Lua 5.1) interpreter in C++
// ============================================================================
//
//  What runs, in order:
//
//    DEMO 1  lua_State creation, opening the standard libraries, teardown
//    DEMO 2  registering C++ functions (lua_CFunction) in the global table
//    DEMO 3  compiling + running a script held in a C++ string
//    DEMO 4  reading, compiling + running scripts/marshalling.lua from disk
//    DEMO 5  C++ calling a Lua function directly (lua_getglobal + lua_pcall)
//    DEMO 6  error handling: Lua runtime error, syntax error, C-side error
//    DEMO 7  two independent lua_States, to show state is not process-global
//
//  Every interesting step dumps the interpreter stack, so the comments can
//  point at real slot numbers instead of hand-waving.
//
//  ---------------------------------------------------------------------------
//  THE API DIFFERENCES THAT ACTUALLY BREAK EMBEDDINGS
//  (verified against luau-lang/luau commit 7d5f7336, 2026-09-15)
//
//   1. Luau has NO luaL_loadbuffer / luaL_loadstring / luaL_loadfile.
//      Source text is compiled with luau_compile() (Compiler library), which
//      returns Luau bytecode, and that bytecode is pushed with luau_load()
//      (VM library). Compile errors do not fail luau_compile(): it returns a
//      bytecode blob that ENCODES the error message. luau_load() notices that,
//      pushes "chunkname: <parser error>" and returns 1 - NOT LUA_ERRSYNTAX -
//      so always test `status != LUA_OK`, never `== LUA_ERRSYNTAX`.
//      The buffer returned by luau_compile() is released with free() in this
//      Luau version (older releases exposed a luau_free() helper instead).
//
//   2. lua_pushcfunction() takes a debugname in current Luau:
//        lua_pushcfunction(L, fn, "name") // -> lua_pushcclosurek(L, fn, name, 0, NULL)
//      Stock Lua 5.1 takes two arguments. The PUSH_CFUNC() macro below hides
//      that difference so this file builds against both.
//
//   3. Luau's status codes (LUA_OK, LUA_ERRRUN, LUA_ERRSYNTAX, ...) are enum
//      members, not #defines, so you cannot #ifdef them. Using them directly in
//      a switch works on both engines.
//
//   4. Build Luau with LUA_USE_LONGJMP=1. It defaults to 0, which makes
//      luaL_error() throw a C++ exception; throwing across the extern "C" API
//      boundary is undefined, and it skips the destructors of any C++ locals in
//      the frame. With longjmp the jump is clean but C++ objects are still not
//      destroyed, so keep luaL_error() calls free of live RAII objects.
//
//   5. luaL_sandbox() (Luau only) makes the global table read-only. Call it
//      *after* every global you need has been registered.
//
//   6. lua_next() exists in Luau as well as Lua 5.1; Luau also offers the
//      cheaper lua_rawiter(). The classic "push nil, loop while lua_next != 0,
//      pop the value" contract is identical in both.
// ============================================================================

#if defined(_MSC_VER) && !defined(_CRT_SECURE_NO_WARNINGS)
#define _CRT_SECURE_NO_WARNINGS   // allows snprintf without MSVC deprecation noise
#endif

#include <cstdio>   // printf, snprintf
#include <cstdlib>  // free
#include <cstring>  // memset
#include <string>   // std::string
#include <fstream>  // std::ifstream
#include <sstream>  // std::ostringstream

// ---------------------------------------------------------------------------
// Backend selection
//
//   -DLUAU_EMBED=1  -> real Luau (VM + Compiler + Ast + Common)
//   (default)       -> stock Lua 5.1
// ---------------------------------------------------------------------------
#if defined(LUAU_EMBED)
    // Luau declares everything the Lua 5.1 auxiliary library used to keep in
    // lauxlib.h (luaL_newstate, luaL_openlibs, luaL_error, ...) inside lualib.h.
    #include "lua.h"
    #include "lualib.h"
    #include "luacode.h"    // luau_compile() + lua_CompileOptions
    #define DEMO_ENGINE "Luau"
    #define PUSH_CFUNC(L, fn, name) lua_pushcclosurek((L), (fn), (name), 0, NULL)
#else
    #include "lua.h"
    #include "lualib.h"
    #include "lauxlib.h"
    #define DEMO_ENGINE "Lua 5.1"
    #define PUSH_CFUNC(L, fn, name) lua_pushcclosure((L), (fn), 0)
#endif

// ============================================================================
//  Stack inspection helpers - the tools you actually debug with
// ============================================================================

// Convert the value in stack slot `idx` to text, WITHOUT disturbing the stack.
//
// Why not just call lua_tostring()? It is a macro for lua_tolstring(L, idx,
// NULL), which is fine for strings and numbers but returns NULL for
// tables/functions/threads because they have no string form. Branching on
// lua_type() first keeps the output meaningful for every type.
static std::string luaValueToText(lua_State* L, int idx)
{
    switch (lua_type(L, idx))
    {
    case LUA_TNONE:
        return "<no value>";

    case LUA_TNIL:
        return "nil";

    case LUA_TBOOLEAN:
        return lua_toboolean(L, idx) ? "true" : "false";

    case LUA_TNUMBER:
    {
        char buf[32];
        snprintf(buf, sizeof(buf), "%g", lua_tonumber(L, idx));
        return buf;
    }

    case LUA_TSTRING:
    {
        // lua_tolstring() hands back the pointer AND the length, and Lua
        // strings are not NUL-terminated by contract, so build the std::string
        // from both. Reading a string never copies it - the VM owns the memory.
        size_t len = 0;
        const char* s = lua_tolstring(L, idx, &len);
        return std::string("\"") + std::string(s, len) + "\"";
    }

    default:
    {
        const char* typeName = lua_typename(L, lua_type(L, idx));
        return std::string("<") + (typeName ? typeName : "?") + ">";
    }
    }
}

// Print every occupied slot of the current frame.
//
// Indexing rules: positive indices count up from the bottom of the frame (slot
// 1 is the first argument of a C function, or the bottom-most value of main's
// "frame"); negative indices count down from the top, so -1 is always the top.
// Slot i therefore equals negative index (i - top - 1).
static void dumpStack(lua_State* L, const char* label)
{
    const int top = lua_gettop(L);

    printf("    %-34s stack depth = %d", label, top);
    if (top == 0)
    {
        printf("  [empty]\n");
        return;
    }
    printf("\n");

    for (int i = 1; i <= top; ++i)
    {
        const std::string text = luaValueToText(L, i);
        printf("      slot[%2d] (neg %3d)  %-9s  %s\n",
               i, i - top - 1, lua_typename(L, lua_type(L, i)), text.c_str());
    }
}

// Human-readable name for a lua_pcall() / luau_load() status code, with the raw
// number appended.
//
// The number matters, because Luau's luau_load() does NOT return LUA_ERRSYNTAX
// for a compile error: lvmload.cpp reads the encoded error out of the bytecode
// and does `return 1` (which is LUA_YIELD in the enum). So the rule is: always
// test `status != LUA_OK`, never `status == LUA_ERRSYNTAX`.
static std::string statusText(int status)
{
    const char* name = "unknown";
    switch (status)
    {
    case LUA_OK:        name = "LUA_OK"; break;
    case LUA_YIELD:     name = "LUA_YIELD"; break;
    case LUA_ERRRUN:    name = "LUA_ERRRUN"; break;
    case LUA_ERRSYNTAX: name = "LUA_ERRSYNTAX"; break;
    case LUA_ERRMEM:    name = "LUA_ERRMEM"; break;
    case LUA_ERRERR:    name = "LUA_ERRERR"; break;
    default: break;
    }

    char buf[64];
    snprintf(buf, sizeof(buf), "%s (status %d)", name, status);
    return buf;
}

// ============================================================================
//  The Lua -> C++ bridge: lua_CFunction implementations
// ============================================================================
//
// A lua_CFunction has the signature  int fn(lua_State* L).
//
// Contract:
//   * On entry the VM has pushed exactly one slot per Lua argument, starting at
//     index 1. Nothing else is on the stack.
//   * The return value is a COUNT, not a value: "the top N slots are my
//     results". The VM pops everything else for you.
//   * Slots you leave below the returned window are simply discarded, so a
//     function may leave garbage behind as long as the top N are the results.
//
// Keep the stack balanced anyway - it is the cheapest way to avoid the classic
// "stack overflow" / "invalid index" crashes in long-lived embeds.

// Forward declarations: cpp_makeRecord stores a pointer to cpp_add inside a
// table, so cpp_add must be declared before that definition.
static int cpp_add(lua_State* L);
static int cpp_join(lua_State* L);
static int cpp_stats(lua_State* L);
static int cpp_dumpTable(lua_State* L);
static int cpp_makeRecord(lua_State* L);
static int cpp_apply(lua_State* L);
static int cpp_fail(lua_State* L);
static int cppTraceback(lua_State* L);

// ---------------------------------------------------------------------------
// cpp_add(a, b) -> number
//
// Fixed arity, type-checked, single return value. The smallest possible
// illustration of argument marshalling Lua -> C++ and result C++ -> Lua.
// ---------------------------------------------------------------------------
static int cpp_add(lua_State* L)
{
    // Stack on entry:   slot[1] = a,  slot[2] = b
    //
    // luaL_checknumber() reads a double *and raises a Lua error* if the value is
    // not a number, so the function body never has to handle the bad case. The
    // raised error travels back to the caller of lua_pcall() as LUA_ERRRUN.
    const double a = luaL_checknumber(L, 1);
    const double b = luaL_checknumber(L, 2);

    lua_pushnumber(L, a + b);   // Stack: slot[1]=a, slot[2]=b, slot[3]=result
    return 1;                   // "the top 1 slot is my result"
}

// ---------------------------------------------------------------------------
// cpp_join(...) -> string
//
// Variadic. The VM stacks every argument for us, so a C function can accept any
// number of values without a varargs mechanism of its own: the count is
// lua_gettop(L) and the slots are 1..count.
// ---------------------------------------------------------------------------
static int cpp_join(lua_State* L)
{
    const int argc = lua_gettop(L);   // total slots == number of arguments

    std::string out;
    for (int i = 1; i <= argc; ++i)
    {
        if (i > 1)
            out += " | ";
        out += luaValueToText(L, i);   // read-only, type-aware
    }

    // lua_pushlstring takes an explicit length, so it is safe for strings that
    // contain embedded NUL bytes.
    lua_pushlstring(L, out.data(), out.size());
    return 1;
}

// ---------------------------------------------------------------------------
// cpp_stats(array) -> count, sum, mean, best
//
// Reads a Lua table, returns FOUR values. This is the multi-value return path:
// push the values in order, return how many you pushed. The VM hands them to
// the Lua caller as a normal multiple assignment.
// ---------------------------------------------------------------------------
static int cpp_stats(lua_State* L)
{
    luaL_checktype(L, 1, LUA_TTABLE);   // raises a Lua error if slot 1 is not a table

    // lua_objlen() is the array-part length (the same number Lua's '#' gives).
    // Cast is deliberate: it returns int in Luau and size_t in Lua 5.1.
    const int n = static_cast<int>(lua_objlen(L, 1));

    double sum = 0.0;
    double best = 0.0;

    for (int i = 1; i <= n; ++i)
    {
        lua_rawgeti(L, 1, i);                      // push t[i]  -> new top slot

        // luaL_checknumber(L, -1) reads the value we just pushed. Using the
        // relative index -1 means this line keeps working no matter how deep the
        // stack already is.
        const double v = luaL_checknumber(L, -1);

        sum += v;
        if (i == 1 || v > best)
            best = v;

        lua_pop(L, 1);                             // balance: drop t[i] again
    }

    lua_pushnumber(L, static_cast<double>(n));            // 1st result
    lua_pushnumber(L, sum);                               // 2nd result
    lua_pushnumber(L, n > 0 ? sum / n : 0.0);             // 3rd result
    lua_pushnumber(L, best);                              // 4th result
    return 4;                                             // "the top 4 slots are my results"
}

// ---------------------------------------------------------------------------
// cpp_dumpTable(table) -> string
//
// Walks a Lua table with lua_next(), which is the one traversal primitive that
// exists in both Luau and Lua 5.1. The protocol is exact and worth memorising:
//
//   lua_pushnil(L)            -- the "start of traversal" key
//   while (lua_next(L, t) != 0)
//   {
//       -- the VM popped the key and pushed key then value, so
//       --   value is at -1 and the key is at -2
//       ...
//       lua_pop(L, 1)         -- pop the VALUE, keep the KEY for the next round
//   }
//
// Two rules that cause most lua_next bugs:
//   * Never pop the key yourself; lua_next needs it to find the next entry.
//   * The table index `t` must stay valid for the whole loop, so do not insert
//     or remove anything BELOW that slot while iterating.
// ---------------------------------------------------------------------------
static int cpp_dumpTable(lua_State* L)
{
    luaL_checktype(L, 1, LUA_TTABLE);

    lua_pushnil(L);          // Stack: slot[1]=table, slot[2]=key(nil)

    std::string out;
    int entries = 0;

    while (lua_next(L, 1) != 0)
    {
        // Stack now: slot[1]=table, slot[2]=key, slot[3]=value
        if (entries > 0)
            out += ", ";

        out += luaValueToText(L, 2);   // the key   (negative index -2)
        out += "=";
        out += luaValueToText(L, 3);   // the value (negative index -1)

        ++entries;

        lua_pop(L, 1);                 // drop the value, keep the key
    }

    // The loop ended because lua_next popped the final key, so only the table
    // remains below us. We push the summary string as the single result.
    lua_pushlstring(L, out.data(), out.size());
    return 1;
}

// ---------------------------------------------------------------------------
// cpp_makeRecord(name) -> table
//
// Builds a non-trivial Lua value entirely in C++: a table with string, number
// and boolean fields, a nested table, an array part, and a C function stored as
// a field. This is the C++ -> Lua direction of the bridge (pushing values), and
// it is how real embeds expose an API object to scripts.
//
// The pattern for writing a field is always two stack operations:
//     <push the value>          -- now on top
//     lua_setfield(L, -2, "k")  -- -- t.k = <popped top value>
// so the literal -2 always refers to "the table, which is one below the value".
// ---------------------------------------------------------------------------
static int cpp_makeRecord(lua_State* L)
{
    const char* name = luaL_checkstring(L, 1);

    lua_createtable(L, 0, 5);   // Stack: slot[1]=name, slot[2]=record (0 array, 5 hash slots)

    lua_pushstring(L, name);
    lua_setfield(L, -2, "name");            // record.name = <name>

    lua_pushnumber(L, 1.0);
    lua_setfield(L, -2, "version");         // record.version = 1

    lua_pushboolean(L, 1);
    lua_setfield(L, -2, "windows");         // record.windows = true

    // Nested table -> record.scores = { min = ..., max = ... }
    lua_createtable(L, 0, 2);               // push the nested table on top
    lua_pushnumber(L, 1);
    lua_setfield(L, -2, "min");
    lua_pushnumber(L, 99);
    lua_setfield(L, -2, "max");
    lua_setfield(L, -2, "scores");          // pop the nested table into the record

    // Array part -> record.steps = { "init", "load", "run" }
    lua_createtable(L, 3, 0);
    lua_pushstring(L, "init");
    lua_rawseti(L, -2, 1);                  // rawset: bypasses __newindex on purpose
    lua_pushstring(L, "load");
    lua_rawseti(L, -2, 2);
    lua_pushstring(L, "run");
    lua_rawseti(L, -2, 3);
    lua_setfield(L, -2, "steps");

    // A C function exported as a field: Lua can now call record.add(5, 6).
    PUSH_CFUNC(L, cpp_add, "cpp_add");
    lua_setfield(L, -2, "add");

    return 1;   // the record table is the single result
}

// ---------------------------------------------------------------------------
// cpp_apply(fn, x) -> whatever fn returns
//
// The C++ -> Lua -> C++ round trip. A Lua function arrives as a normal stack
// slot, so C++ can call it with lua_pcall(). This is re-entrancy: Lua is already
// running when this C function starts a nested Lua execution.
//
// lua_pcall(L, nargs, nresults, errfunc) expects the stack to look like:
//     [ ... ] [ function ] [ arg1 ] ... [ argN ]
// i.e. the function immediately below its arguments, with the count of arguments
// passed separately. On success it pops function+args and pushes `nresults`
// results. On failure it pops function+args and pushes ONE error object.
// ---------------------------------------------------------------------------
static int cpp_apply(lua_State* L)
{
    // Stack on entry: slot[1] = the Lua function, slot[2] = x
    luaL_checktype(L, 1, LUA_TFUNCTION);
    const double x = luaL_checknumber(L, 2);

    lua_pushvalue(L, 1);        // slot[3] = a copy of the function, on top
    lua_pushnumber(L, x);       // slot[4] = first argument for the callback
    lua_pushnumber(L, x * 2.0); // slot[5] = second argument

    // 0 as errfunc means "no message handler": the error object arrives raw.
    if (lua_pcall(L, 2, 1, 0) != 0)
    {
        // The error object is now the top slot. lua_tostring() returns NULL for
        // error objects that are not strings or numbers (e.g. a table), so check.
        const char* err = lua_tostring(L, -1);

        // NOTE: this call does not return. With LUA_USE_LONGJMP=1 it longjmps to
        // the nearest protected call; there are deliberately no live C++ objects
        // with destructors in this scope, because a longjmp would skip them.
        luaL_error(L, "cpp_apply: the Lua callback failed: %s",
                   err ? err : "(non-string error object)");
        return 0;   // unreachable, present only to satisfy the compiler
    }

    return 1;       // the callback's single result is the top slot
}

// ---------------------------------------------------------------------------
// cpp_fail(message) -> never returns
//
// Shows how a C function signals failure: luaL_error() formats the message,
// attaches source-position information, and raises a Lua error. The error
// unwinds to the enclosing lua_pcall() and becomes its LUA_ERRRUN result.
// ---------------------------------------------------------------------------
static int cpp_fail(lua_State* L)
{
    const char* msg = luaL_checkstring(L, 1);
    luaL_error(L, "cpp_fail raised a C-side error: %s", msg);
    return 0;   // unreachable
}

// ---------------------------------------------------------------------------
// Traceback message handler
//
// Passed as the `errfunc` argument of lua_pcall(): when the call fails, the VM
// calls it with the error object INSTEAD of returning straight to C++, letting
// us turn a bare message into a full stack trace. This is the single most
// useful debugging tool when embedding.
//
// Implementation detail: rather than reaching into lua_getinfo() (whose
// signature differs between Luau and Lua 5.1), we reuse Lua's own
// debug.traceback, which exists in both and is written by the engine authors.
// ---------------------------------------------------------------------------
static int cppTraceback(lua_State* L)
{
    // Stack on entry: slot[1] = the error object
    lua_getglobal(L, "debug");                      // slot[2] = debug table
    if (lua_istable(L, -1))
    {
        lua_getfield(L, -1, "traceback");           // slot[3] = debug.traceback
        if (lua_isfunction(L, -1))
        {
            lua_pushvalue(L, 1);                    // slot[4] = the message
            lua_pushnumber(L, 2);                   // slot[5] = level to start at
            if (lua_pcall(L, 2, 1, 0) == 0)
            {
                // [msg][debug][traceback][result] -> keep only the result
                lua_remove(L, -2);                  // drop debug.traceback
                lua_remove(L, -2);                  // drop the debug table
                lua_remove(L, -2);                  // drop the original message
                return 1;
            }
        }
        lua_pop(L, 1);      // drop debug.traceback, or the nested error
    }
    lua_pop(L, 1);          // drop the debug table

    return 1;               // fall back to the untouched error object
}

// ---------------------------------------------------------------------------
// Registering a C function as a global
//
// There is no luaL_register/luaL_Reg helper in Luau, and the portable two-line
// idiom is: push the function, then pop it into a global. lua_setglobal() is a
// macro for lua_setfield(L, LUA_GLOBALSINDEX, name) in BOTH Luau and Lua 5.1.
// ---------------------------------------------------------------------------
static void registerFunction(lua_State* L, const char* name, lua_CFunction fn)
{
    PUSH_CFUNC(L, fn, name);    // push the closure, tagged with a debug name
    lua_setglobal(L, name);     // pop it into globals[name]
}

// ============================================================================
//  Loading and running code: the execution pipeline
// ============================================================================

// ---------------------------------------------------------------------------
// loadString(): source text -> one function on the stack
// ---------------------------------------------------------------------------
// Returns LUA_OK on success, leaving the compiled chunk as the top stack slot.
// On failure it returns an error status and leaves a message on the top slot.
//
// The two engines do the same two conceptual steps, but Luau splits them because
// compilation lives in a separate library (Compiler) from the VM:
//
//   Lua 5.1:  luaL_loadbuffer(L, src, len, name)      -- parse, compile, push
//   Luau:     luau_compile(src, len, opts, &size)     -- parse, compile -> bytecode
//             luau_load(L, name, bytecode, size, 0)   -- deserialize, push
//
// The split matters for real embeds: you can compile on a background thread (the
// Compiler library does not touch a lua_State), cache the bytecode, and only pay
// the VM cost at load time.
// ---------------------------------------------------------------------------
static int loadString(lua_State* L, const char* chunkname, const char* source, size_t len)
{
#if defined(LUAU_EMBED)
    // Compile options: zero-initialise first. A zeroed struct means
    // "no optimisation, no debug info", so set what you want explicitly.
    lua_CompileOptions options;
    memset(&options, 0, sizeof(options));
    options.optimizationLevel = 1;  // 1 = safe baseline (2 enables inlining, which hurts backtraces)
    options.debugLevel = 1;         // 1 = line numbers + function names, enough for tracebacks

    size_t bytecodeSize = 0;
    char* bytecode = luau_compile(source, len, &options, &bytecodeSize);
    if (!bytecode)
    {
        lua_pushliteral(L, "luau_compile: out of memory");
        return LUA_ERRMEM;
    }

    // A parse error is not reported by luau_compile: it returns a bytecode blob
    // that ENCODES the error. luau_load() notices, pushes "chunkname: <error>"
    // and returns a non-zero status (1 in this Luau version, not LUA_ERRSYNTAX),
    // which we pass straight back to the caller.
    const int status = luau_load(L, chunkname, bytecode, bytecodeSize, /*env=*/0);

    free(bytecode);      // owned by us, released with free() in this Luau version

    if (status != LUA_OK && lua_gettop(L) == 0)
        lua_pushliteral(L, "luau_load failed without a message");

    return status;
#else
    // Stock Lua 5.1 keeps load-from-buffer in the auxiliary library.
    return luaL_loadbuffer(L, source, len, chunkname);
#endif
}

// Read a whole file into a std::string. Returns false if it cannot be opened.
static bool readWholeFile(const std::string& path, std::string& out)
{
    std::ifstream file(path.c_str(), std::ios::binary);
    if (!file.is_open())
        return false;

    std::ostringstream buffer;
    buffer << file.rdbuf();
    out = buffer.str();
    return true;
}

// ---------------------------------------------------------------------------
// runFunctionOnTop(): protected call of the function sitting on the stack
// ---------------------------------------------------------------------------
// On entry the stack must look like:
//     [ ... ] [ function ] [ arg1 ] ... [ argN ]     (function at top)
//
// THE ORDERING TRAP - this is the single easiest thing to get wrong:
// lua_pcall() calls whatever value is ON TOP, so the error handler cannot simply
// be pushed on top of the function - that would make the handler the callee. The
// handler has to sit BELOW the function, which is what lua_insert() does:
//
//     before:  [ ... ][ function ][ arg1 ]   errfunc not pushed yet
//     push tb: [ ... ][ function ][ arg1 ][ tb ]
//     insert:  [ ... ][ tb ][ function ][ arg1 ]      <-- tb at fnIndex
//     pcall:   [ ... ][ tb ][ result1 ] ... [ resultM ]
//     remove:  [ ... ][ result1 ] ... [ resultM ]
//
// Two more details that matter:
//   * The errfunc argument must be an ABSOLUTE index (a negative one would be
//     wrong, because lua_pcall moves the stack while it runs).
//   * lua_insert() is available in both Luau and Lua 5.1.
//
// nresults == LUA_MULTRET asks for "all results".
//
// Returns the status code (LUA_OK, LUA_ERRRUN, ...).
// ---------------------------------------------------------------------------
static int runFunctionOnTop(lua_State* L, int nargs, int nresults, int* firstResultIndex)
{
    const int fnIndex = lua_gettop(L) - nargs;   // absolute index of the function

    if (fnIndex < 1 || !lua_isfunction(L, fnIndex))
    {
        // Defensive check with a message that names the usual cause: this fires
        // when the caller pushed the function AFTER its arguments, or pushed
        // nothing at all. Truncate first so the stack is left clean.
        lua_settop(L, fnIndex < 1 ? 0 : fnIndex - 1);
        lua_pushliteral(L, "runFunctionOnTop: the value at (top - nargs) is not a "
                           "function - the function must be pushed BEFORE its arguments");
        if (firstResultIndex)
            *firstResultIndex = lua_gettop(L);
        return LUA_ERRRUN;
    }

    PUSH_CFUNC(L, cppTraceback, "__traceback");  // pushed on top ...
    lua_insert(L, fnIndex);                      // ... then moved below the function

    const int status = lua_pcall(L, nargs, nresults, fnIndex);

    // The handler is no longer needed; removing it leaves the results (or the
    // error object) starting exactly at fnIndex.
    lua_remove(L, fnIndex);

    if (firstResultIndex)
        *firstResultIndex = fnIndex;

    return status;
}

// ---------------------------------------------------------------------------
// pushGlobalFunction(): put globals[name] on the stack, ready to be called
// ---------------------------------------------------------------------------
// Returns false (pushing nothing) if the global is missing or not callable.
//
// THE ARGUMENT-ORDER RULE, which is the second classic mistake in embeds:
// lua_pcall() expects the function to be pushed BEFORE its arguments. Lua 5.1's
// manual states it plainly: "first, the function to be called is pushed onto the
// stack; then, the arguments to the function are pushed in direct order".
//
//     lua_getglobal(L, "f");   // 1. the function
//     lua_pushnumber(L, 21);   // 2. argument 1
//     lua_pushnumber(L, 2);    // 3. argument 2
//     lua_pcall(L, 2, 1, 0);
//
// Push the function LAST instead and the VM reads the first argument as the
// callee, failing with "attempt to call a number value".
// ---------------------------------------------------------------------------
static bool pushGlobalFunction(lua_State* L, const char* name)
{
    lua_getglobal(L, name);         // push the value (the function, we hope)
    if (!lua_isfunction(L, -1))
    {
        lua_pop(L, 1);              // it was not callable: leave nothing behind
        return false;
    }
    return true;
}

// Print a failure in a consistent shape: status name + the error object that the
// failing operation left on top of the stack.
static void reportFailure(lua_State* L, const char* what, int status, int errorIndex)
{
    printf("    !! %s failed: %s\n", what, statusText(status).c_str());
    printf("    !! message: %s\n", luaValueToText(L, errorIndex).c_str());
    lua_settop(L, errorIndex - 1);          // drop the error object
}

// ============================================================================
//  Convenience wrappers used by the demos
// ============================================================================

// Compile `source` and run it, printing the result, then leave the stack as it
// was found. `nresults` may be LUA_MULTRET to keep every returned value.
static void runSource(lua_State* L, const char* label, const char* chunkname,
                      const char* source, size_t len, int nresults)
{
    printf("\n  -- %s\n", label);

    // Step 1: compile. On failure the message is the top slot.
    const int loadStatus = loadString(L, chunkname, source, len);
    if (loadStatus != LUA_OK)
    {
        reportFailure(L, label, loadStatus, lua_gettop(L));
        return;
    }

    dumpStack(L, "after compile (chunk is on top)");

    // Step 2: run it under a protected call. 0 arguments, because the chunk
    // itself is the function that lua_pcall() is about to invoke.
    int first = 0;
    const int runStatus = runFunctionOnTop(L, 0, nresults, &first);
    if (runStatus != LUA_OK)
    {
        reportFailure(L, label, runStatus, first);
        return;
    }

    const int count = (nresults == LUA_MULTRET) ? (lua_gettop(L) - first + 1) : nresults;
    printf("    %s finished with %d result slot(s)\n", label, count);
    for (int i = 0; i < count; ++i)
        printf("      result %d: %s\n", i + 1, luaValueToText(L, first + i).c_str());

    lua_settop(L, first - 1);   // drop the results
}

// Same, but with the source read from disk.
static void runFile(lua_State* L, const char* chunkname, const char* path, int nresults)
{
    std::string source;
    if (!readWholeFile(path, source))
    {
        printf("\n  -- %s\n    !! could not open %s\n", path, path);
        return;
    }

    printf("    (read %d byte(s) from %s)\n", static_cast<int>(source.size()), path);
    runSource(L, path, chunkname, source.data(), source.size(), nresults);
}

// ---------------------------------------------------------------------------
// The script that this program compiles out of a plain C++ string.
// Deliberately written in Lua 5.1 syntax so it is valid on both engines.
// Every call below lands in one of the lua_CFunctions defined above.
// ---------------------------------------------------------------------------
static const char* kEmbeddedScript = R"LUA(
-- Runs inside the lua_State created in main(); the C functions it calls were
-- registered as globals just before this chunk was compiled.
print("    [lua] chunk started")

local total = cpp_add(19, 23)
print("    [lua] cpp_add(19, 23)                  -> " .. total)

local joined = cpp_join("aervyx", 1, true, nil)
print("    [lua] cpp_join('aervyx', 1, true, nil) -> " .. joined)

local samples = { 12, 48, 7, 33, 2 }
local count, sum, mean, best = cpp_stats(samples)
print("    [lua] cpp_stats({12,48,7,33,2})        -> count=" .. count ..
      " sum=" .. sum .. " mean=" .. mean .. " best=" .. best)

print("    [lua] cpp_dumpTable(samples)           -> " .. cpp_dumpTable(samples))

local record = cpp_makeRecord("luau-embed-demo")
print("    [lua] record.name                      -> " .. record.name)
print("    [lua] record.version                   -> " .. record.version)
print("    [lua] record.windows                   -> " .. tostring(record.windows))
print("    [lua] record.scores.min                -> " .. record.scores.min)
print("    [lua] record.steps[3]                  -> " .. record.steps[3])
print("    [lua] #record.steps                    -> " .. #record.steps)
print("    [lua] record.add(5, 6)                 -> " .. record.add(5, 6))

-- A Lua closure handed to C++, which calls it back with lua_pcall.
local function combine(x, y)
  return x * 100 + y
end
print("    [lua] cpp_apply(combine, 7)            -> " .. cpp_apply(combine, 7))

-- Exposed as a global so main() can call it directly from C++ (DEMO 5).
function lua_scale(value, factor)
  return value * factor, "scaled by " .. factor
end

print("    [lua] chunk finished")
return total, joined
)LUA";

// ============================================================================
//  main(): the full pipeline, top to bottom
// ============================================================================
int main()
{
    printf("\n=== luau-embed-demo | engine: %s ===\n", DEMO_ENGINE);

    // -----------------------------------------------------------------------
    // DEMO 1 - create the interpreter state
    // -----------------------------------------------------------------------
    printf("\n[DEMO 1] lua_State creation and library setup\n");

    // luaL_newstate() allocates a state with a fresh global table, a registry and
    // a main thread. It returns NULL only on allocation failure.
    lua_State* L = luaL_newstate();
    if (!L)
    {
        printf("  !! luaL_newstate() returned NULL (out of memory)\n");
        return 1;
    }

    // Opening the standard libraries is what makes print, table, string, math and
    // debug exist. debug is required for the traceback handler used below, so it
    // is not optional in practice.
    luaL_openlibs(L);

    // A brand-new state has an empty stack: nothing is on it by default, and the
    // globals/registry are reachable through pseudo-indices rather than slots.
    dumpStack(L, "fresh state");

    // -----------------------------------------------------------------------
    // DEMO 2 - provide C++ functions to Lua
    // -----------------------------------------------------------------------
    printf("\n[DEMO 2] registering lua_CFunctions as globals\n");

    registerFunction(L, "cpp_add", cpp_add);
    registerFunction(L, "cpp_join", cpp_join);
    registerFunction(L, "cpp_stats", cpp_stats);
    registerFunction(L, "cpp_dumpTable", cpp_dumpTable);
    registerFunction(L, "cpp_makeRecord", cpp_makeRecord);
    registerFunction(L, "cpp_apply", cpp_apply);
    registerFunction(L, "cpp_fail", cpp_fail);

    // Registration balances the stack, so we are back to depth 0.
    dumpStack(L, "after registering C functions");

    // Prove a C function is now a first-class Lua value: it lives in the globals
    // table and lua_type() reports it as a function.
    lua_getglobal(L, "cpp_add");
    dumpStack(L, "after lua_getglobal(\"cpp_add\")");
    printf("      globals[\"cpp_add\"] has Lua type: %s\n",
           lua_typename(L, lua_type(L, -1)));
    lua_pop(L, 1);      // balance

#if defined(LUAU_EMBED)
    // Luau extra: luaL_sandbox() replaces the global table with a read-only
    // version and sandboxes the standard libraries. It must run AFTER every
    // registerFunction() call, because a sandboxed global table rejects writes.
    // Enable it for untrusted scripts:
    //     luaL_sandbox(L);
    printf("      (Luau: luaL_sandbox(L) available for read-only globals - left OFF)\n");
#endif

    // -----------------------------------------------------------------------
    // DEMO 3 - compile and run a script that lives in a C++ string
    // -----------------------------------------------------------------------
    printf("\n[DEMO 3] load-from-string: compile + run the embedded chunk\n");
    {
        const size_t len = strlen(kEmbeddedScript);
        runSource(L, "embedded chunk", "embedded-demo", kEmbeddedScript, len, LUA_MULTRET);
    }

    // -----------------------------------------------------------------------
    // DEMO 4 - the same pipeline, but the source comes from a file
    // -----------------------------------------------------------------------
    printf("\n[DEMO 4] load-from-file: read + compile + run scripts/marshalling.lua\n");
    {
        // The working directory depends on how the program was started, so try the
        // likely locations before giving up.
        const char* candidates[] = {
            "scripts/marshalling.lua",
            "../scripts/marshalling.lua",
            "../../scripts/marshalling.lua",
        };

        bool loaded = false;
        for (size_t i = 0; i < sizeof(candidates) / sizeof(candidates[0]); ++i)
        {
            std::string probe;
            if (readWholeFile(candidates[i], probe))
            {
                runSource(L, candidates[i], candidates[i], probe.data(), probe.size(), LUA_MULTRET);
                loaded = true;
                break;
            }
        }

        if (!loaded)
            printf("    !! scripts/marshalling.lua not found; skipping this demo\n");
    }

    // -----------------------------------------------------------------------
    // DEMO 5 - C++ calls into Lua
    // -----------------------------------------------------------------------
    printf("\n[DEMO 5] C++ -> Lua: call the global lua_scale(value, factor)\n");
    {
        // Push the FUNCTION first, then its arguments, in that order.
        if (!pushGlobalFunction(L, "lua_scale"))
        {
            printf("    !! global 'lua_scale' is missing or not a function\n");
        }
        else
        {
            lua_pushnumber(L, 21.0);        // argument 1
            lua_pushnumber(L, 2.0);         // argument 2
            dumpStack(L, "function + arguments on the stack");

            int first = 0;
            const int status = runFunctionOnTop(L, 2, 2, &first);
            if (status != LUA_OK)
            {
                reportFailure(L, "lua_scale", status, first);
            }
            else
            {
                dumpStack(L, "results of lua_scale(21, 2)");
                printf("      lua_scale(21, 2) -> %s, %s\n",
                       luaValueToText(L, first).c_str(),
                       luaValueToText(L, first + 1).c_str());
                lua_settop(L, first - 1);   // drop the two results
            }
        }
    }

    // -----------------------------------------------------------------------
    // DEMO 6 - four different failure modes
    // -----------------------------------------------------------------------
    printf("\n[DEMO 6] error handling: four failure modes and their diagnostics\n");

    // (a) Runtime error raised deep inside a Lua function. Because the call used
    //     runFunctionOnTop(), the traceback handler turns the bare message into a
    //     full stack trace - which is how you find out WHERE the failure was.
    const char* kRuntimeError =
        "local function boom()\n"
        "  error('intentional failure raised inside a Lua function')\n"
        "end\n"
        "boom()\n";
    runSource(L, "runtime error", "runtime-error-demo",
              kRuntimeError, strlen(kRuntimeError), 0);

    // (b) Syntax error. This never reaches the VM: with Luau it is encoded into
    //     the bytecode by luau_compile() and only surfaces when luau_load() reads
    //     it back and returns LUA_ERRSYNTAX. Notice that the status differs from
    //     the runtime error above, and that the chunk never executed.
    const char* kSyntaxError = "local x = = 5\nprint(x)\n";
    runSource(L, "syntax error", "syntax-error-demo",
              kSyntaxError, strlen(kSyntaxError), 0);

    // (c) Error raised BY the C++ side (luaL_error inside cpp_fail). It unwinds
    //     through the Lua frame that called it and lands back in C++ as the
    //     LUA_ERRRUN result of our protected call.
    const char* kCError = "cpp_fail('propagated from Lua into C++ and back')\n";
    runSource(L, "c-side error", "c-error-demo",
              kCError, strlen(kCError), 0);

    // (d) Type error raised by luaL_checknumber inside cpp_add. This is why the
    //     check* family exists: the failure is reported at the exact argument
    //     that was wrong ("bad argument #1"), with the Lua call site attached.
    const char* kTypeError = "cpp_add('not', 'numbers')\n";
    runSource(L, "argument type error", "type-error-demo",
              kTypeError, strlen(kTypeError), 0);

    // -----------------------------------------------------------------------
    // DEMO 7 - two states are fully independent
    // -----------------------------------------------------------------------
    printf("\n[DEMO 7] a second lua_State shares nothing with the first\n");
    {
        lua_State* L2 = luaL_newstate();
        if (!L2)
        {
            printf("    !! luaL_newstate() failed\n");
        }
        else
        {
            luaL_openlibs(L2);

            // cpp_add was registered on L, so L2's globals know nothing about it.
            lua_getglobal(L2, "cpp_add");
            printf("      globals[\"cpp_add\"] in the new state: %s\n",
                   lua_typename(L2, lua_type(L2, -1)));
            lua_pop(L2, 1);

            // Register it on this state only, then call it from a chunk.
            registerFunction(L2, "cpp_add", cpp_add);

            const char* kSecondState = "return cpp_add(2, 3)\n";
            runSource(L2, "second state", "second-state-demo",
                      kSecondState, strlen(kSecondState), 1);

            lua_close(L2);
            printf("      second state closed; the first state is untouched\n");
        }
    }

    // -----------------------------------------------------------------------
    // Teardown
    // -----------------------------------------------------------------------
    printf("\n[teardown] releasing the first state\n");
    dumpStack(L, "just before lua_close");
    lua_close(L);       // frees every object owned by the state; do not touch L after this

    printf("\n=== done ===\n");
    return 0;
}





