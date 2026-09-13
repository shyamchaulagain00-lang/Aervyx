# Aervyx

**AERVYX / Lua Development Environment** is a standalone Windows desktop Lua editor. It runs scripts in an embedded Fengari Lua 5.3 runtime inside the renderer sandbox. It does not attach to, inject into, modify, or communicate with external processes.

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

`npm run dev` starts Vite and opens the Electron desktop window. The application supports native `.lua` open/save dialogs, multiple script tabs, dirty-state indicators, Lua syntax highlighting, search/replace through Monaco, output/error/warning console filters, and settings persistence for editor font size.

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

To publish an updated installer on the public download site, copy it across:

```powershell
Copy-Item release\Aervyx-Setup.exe aervyx-download-site\public\downloads\Aervyx-Setup.exe
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