# Aervyx

**AERVYX / Lua Development Environment** is a Windows desktop Lua editor with a sandboxed standalone runtime and an optional Roblox Studio development test bridge. The bridge communicates only with a local Studio plugin using allowlisted test commands; it does not attach to, inject into, or hook a Roblox client process.

## Why Electron

Electron provides native Windows windowing and file dialogs while allowing the editor surface to use Monaco, the same mature editing engine used by VS Code. The runtime is intentionally kept in the renderer with `contextIsolation` enabled and Node integration disabled.

## Branding asset

Place the exact uploaded Aervyx logo image at `public/aervyx-logo.png`. The UI uses that path for the top-left sidebar brand and the Electron window icon. No replacement or recreated logo is included in this project because the uploaded binary asset was not available as a workspace file.

## Requirements

- Windows 10 or later
- Node.js 20+
- npm 10+

## Install and run

```powershell
npm install
npm run dev
```

The application supports native `.lua` open/save dialogs, multiple script tabs, dirty-state indicators, Lua syntax highlighting, search/replace through Monaco, output/error/warning console filters, and settings persistence for editor font size.

For the Electron desktop development build, use `npm run dev:desktop`. It builds the app, starts Vite, then opens Electron with the development renderer. The loopback Roblox Studio Test bridge starts in Electron's main process. `npm run dev` alone runs only the Vite renderer.

## Build for Windows

```powershell
npm run dist
```

This runs `npm run build` and then `electron-builder --win nsis`, producing
`release/Aervyx-Setup.exe` — a per-user NSIS installer with a selectable install
directory, branded with `build/icon.png`.

You can also run the steps manually:

```powershell
npm run build
npx electron-builder --win nsis
```

The installer is written to `release/` (configured via the `build.directories.output`
field in `package.json`, which is deliberately *not* `dist/` so it cannot collide with
the Vite renderer build). For a portable local check, run `npm run build` followed by
`npm start`.

To publish the downloadable file on the public download site, copy the exact working
`Aervyx BootStrapper.exe` (the file users actually download, not the NSIS installer)
into the site's public directory, keeping the filename exactly as-is:

```powershell
Copy-Item "C:\path\to\Aervyx BootStrapper.exe" aervyx-download-site\public\downloads\Aervyx BootStrapper.exe
```

## VS Code setup

1. Open this folder in VS Code.
2. Run `npm install` in the integrated terminal.
3. Use the `npm run dev` script from the terminal, or add it as a VS Code task.
4. Use the built-in TypeScript diagnostics for source checks.

## Keyboard shortcuts

- `F6`: Execute the active Lua script
- `Ctrl+S`: Save the active script
- `Ctrl+O`: Open a `.lua` file
- `Ctrl+N`: Create a new script tab

## Runtime safety

Lua code is evaluated only by Fengari in the Aervyx renderer. The runtime has no Electron IPC access, no Node integration, and no API for process injection, DLL injection, memory manipulation, anti-cheat bypass, or client modification. Runtime and syntax errors are caught and displayed in the console instead of crashing the application.

Scripts are executed in the **strict** sandbox by default: `debug`, `io`, `package`, `require`, `dofile` and `loadfile` are removed, and `os` is reduced to `time`, `clock`, `date` and `difftime`. The optional `full` harness mode only restores Lua's `debug` library; it still blocks I/O, package loading, file loading, and process termination. No Node.js globals or Electron APIs are exposed. Each execution creates and closes its own Lua state, so globals and tables do not persist between runs. Scripts cannot be interrupted while running; the Stop control remains disabled.

`loadstring(source)` is provided as a Lua 5.1 compatibility helper. It compiles source inside the current run's sandbox and returns `function, nil` or `nil, error`; it does not enable Roblox functionality.

### Local development mocks

Runtime tests may pass `{ mockRoblox: true }` to `runLua`. This opt-in fixture installs plain Lua tables named `game` and `workspace`, with deterministic `Players.LocalPlayer`, `Workspace.TestPart`, and `ReplicatedStorage` objects, plus `game:GetService("Players" | "Workspace" | "ReplicatedStorage")`. They are mock tables, not Roblox Instances, and are never enabled by the application UI. Unsupported mock services raise a message beginning `Roblox API unavailable in Aervyx standalone runtime:`. There is no real Roblox API or Roblox compatibility claim.

### Roblox Studio Test bridge

This is a separate, local development integration. It does not expose a Roblox client process or evaluate Lua sent by Aervyx. The editor's **Roblox Studio Test** mode accepts JSON from the allowlist below; that command is passed to a Studio plugin, which starts a Play test through Roblox's `StudioTestService:ExecutePlayModeAsync`. The test server validates the command a third time, performs the one supported operation, and returns a small result. Arbitrary source code and unknown fields are rejected at every boundary.

The Aervyx main process binds only to `127.0.0.1:43827`, generates a fresh random pairing token on launch, and accepts plugin requests only with that token. The plugin polls with a heartbeat; its status appears as `DISCONNECTED`, `CONNECTING`, `CONNECTED`, or `ERROR`. Requests time out after 45 seconds. The bridge leases one request at a time and caches completed IDs; the plugin caches results so retrying delivery does not run the Studio command a second time. Closing Studio makes the status disconnected after the heartbeat expires.

#### Start Aervyx and the Studio test place

1. Start Aervyx with `npm run dev:desktop` (or build first and run `npm start`). This starts the local listener inside Electron; it is not available from `npm run dev` alone.
2. In Aervyx, open **Roblox Studio Test** and copy the displayed pairing token.
3. Install the [Rojo](https://rojo.space/docs/) CLI if needed. In a terminal, run:

   ```powershell
   cd roblox-studio-test
   rojo serve
   ```

   Open a local Roblox Studio test place, select **Plugins → Rojo → Connect**, and connect it to the Rojo server. The project creates `ReplicatedStorage/AervyxTest` and its `Ready`, `Output`, and `Acknowledge` RemoteEvents, a server handler in `ServerScriptService`, and a client output panel in `StarterPlayerScripts`. Use a dedicated development copy of your place.
4. Install `roblox-studio-test/plugin/AervyxStudioBridge.plugin.lua` as a local plugin: open its contents in a Studio `Script`, then use **Save as Local Plugin**. The plugin adds an **Aervyx Studio Test** dock widget.
5. Paste the pairing token into the plugin widget and press **Connect to Aervyx**. Approve the plugin's localhost permission prompt for `127.0.0.1` if Studio presents one. Keep the place open in Edit mode; the plugin starts a Play test for each command.
6. Return to Aervyx's **Executor**, choose **Roblox Studio Test**, enter one JSON command, and click **Send Test** or press F6. Aervyx logs `[AERVYX] Sending command...` and `[AERVYX] Response received...`; Studio logs `[AERVYX TEST] Command received...` and `[AERVYX TEST] Command completed...`. The test place also displays the returned output in a small ScreenGui.

Supported command examples (each object is the full editor contents):

```json
{"command":"print","args":{"message":"hello from Aervyx"}}
{"command":"getPlayerName","args":{}}
{"command":"getPlayerPosition","args":{}}
{"command":"moveTestObject","args":{"x":0,"y":8,"z":0}}
{"command":"setTestObjectProperty","args":{"property":"Transparency","value":0.25}}
{"command":"setTestObjectProperty","args":{"property":"Color","value":"blue"}}
{"command":"setTestObjectProperty","args":{"property":"Anchored","value":true}}
{"command":"createTestPart","args":{}}
{"command":"removeTestPart","args":{}}
```

Movement is limited to coordinates within ±10,000 studs. Property changes are limited to `Transparency`, `Anchored`, and a small named-color set. Part creation/removal is limited to `AervyxBridgePart` inside `Workspace/AervyxTestObjects`; player queries inspect only the local Studio test player. The standalone **Lua** mode continues to run Lua 5.3 in its own sandbox and is not sent to Roblox.

The design uses Roblox's documented plugin localhost communication and `StudioTestService` APIs. Studio must support `ExecutePlayModeAsync`; this integration has not been represented as a public experience API or real Roblox compatibility layer.

### Diagnostics

Failures are reported with the phase they occurred in (`syntax`, `runtime`, `memory`, `internal`), the line in the script, the offending source line, a Lua traceback, and — when the cause is recognised — a specific hint.

The engine knows the difference between the runtime Aervyx embeds (Lua 5.3) and the dialect Roblox uses (Luau), so a Roblox script using `continue`, `+=`, backtick interpolation or type annotations is named as such rather than reported as a generic parse failure. Missing names are looked up individually; Roblox APIs used without the explicit local mock produce a clear standalone-runtime diagnostic.

### Known limits of the embedded runtime

Both were measured against the shipped build. Neither is fixable from the application side.

- **Integers wrap at 32 bits.** Fengari 0.1.4 does not give Lua 5.3 its full 64-bit integer subtype. Summing 1..200000 returns `-1474736480` instead of `20000100000`. Lua 5.3 proper uses 64-bit integers, and Luau has no integer subtype at all, so integer-heavy arithmetic can silently disagree with both.
- **A running script cannot be interrupted.** The host instruction hook does fire, but raising from it does not unwind the running call, so a runaway loop holds the thread until it finishes. The Stop control is disabled rather than pretending otherwise; guard loops in your own scripts.

## Tests

```powershell
npm test
```

Runs both `scripts/test-lua-runtime.mjs` and `scripts/test-roblox-bridge.mjs`. They cover Lua runtime behavior, protocol validation, allowlisted command arguments, duplicate request handling, timeouts, heartbeat disconnect/recovery, and response validation. Tests are bundled with esbuild first because Node's own CommonJS named-export detection cannot see `fengari-web`'s exports, while the application's bundler can.

The experiments behind those numbers are in `scripts/probe-hook.mjs`, which runs each case in its own child process so that a case which hangs the VM cannot mask the others.
