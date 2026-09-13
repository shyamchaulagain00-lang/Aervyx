"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_electron = require("electron");
var import_node_path = __toESM(require("node:path"));
var import_promises = __toESM(require("node:fs/promises"));
var import_node_fs = require("node:fs");
var mainWindow;
var createWindow = () => {
  const win = new import_electron.BrowserWindow({ width: 1440, height: 920, minWidth: 1050, minHeight: 680, title: "Aervyx", backgroundColor: "#08090d", icon: import_node_path.default.join(__dirname, "../dist/aervyx-logo.png"), webPreferences: { contextIsolation: true, nodeIntegration: false, preload: import_node_path.default.join(__dirname, "preload.cjs") } });
  mainWindow = win;
  if (process.env.AERVYX_DEBUG_RENDERER) {
    const debugLog = import_node_path.default.join(process.env.TEMP ?? ".", "aervyx-renderer-debug.log");
    const shotPath = import_node_path.default.join(process.env.TEMP ?? ".", "aervyx-window.png");
    const log = (line) => {
      try {
        (0, import_node_fs.appendFileSync)(debugLog, `${line}
`);
      } catch {
      }
    };
    win.webContents.on("console-message", (_event, level, message, line, source) => log(`[console:${level}] ${message} (${source}:${line})`));
    win.webContents.on("did-fail-load", (_event, code, desc, url) => log(`[did-fail-load] ${code} ${desc} ${url}`));
    win.webContents.on("render-process-gone", (_event, details) => log(`[render-process-gone] ${JSON.stringify(details)}`));
    win.webContents.on("did-finish-load", () => {
      log("[did-finish-load] OK");
      setTimeout(() => {
        void win.webContents.capturePage().then((image) => import_promises.default.writeFile(shotPath, image.toPNG())).then(() => log(`[screenshot] ${shotPath}`)).catch((error) => log(`[screenshot-failed] ${String(error)}`));
      }, 5e3);
    });
  }
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl && !import_electron.app.isPackaged) void win.loadURL(devUrl);
  else void win.loadFile(import_node_path.default.join(__dirname, "../dist/index.html"));
};
import_electron.ipcMain.handle("file:open", async () => {
  const result = await import_electron.dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "Lua Script", extensions: ["lua"] }] });
  if (result.canceled || !result.filePaths[0]) return null;
  return { path: result.filePaths[0], content: await import_promises.default.readFile(result.filePaths[0], "utf8") };
});
import_electron.ipcMain.handle("file:save", async (_event, payload) => {
  let filePath = payload.path;
  if (!filePath) {
    const result = await import_electron.dialog.showSaveDialog({ defaultPath: "script.lua", filters: [{ name: "Lua Script", extensions: ["lua"] }] });
    if (result.canceled || !result.filePath) return null;
    filePath = result.filePath.endsWith(".lua") ? result.filePath : `${result.filePath}.lua`;
  }
  await import_promises.default.writeFile(filePath, payload.content, "utf8");
  return filePath;
});
import_electron.ipcMain.handle("app:restart", () => {
  import_electron.app.relaunch();
  import_electron.app.exit(0);
});
import_electron.ipcMain.handle("window:always-on-top", (_event, value) => {
  mainWindow?.setAlwaysOnTop(Boolean(value));
});
import_electron.ipcMain.handle("folder:open", async (_event, folder) => {
  const target = folder === "autoexec" ? import_node_path.default.join(import_electron.app.getAppPath(), "autoexec") : import_electron.app.getAppPath();
  await import_promises.default.mkdir(target, { recursive: true });
  await import_electron.shell.openPath(target);
});
import_electron.app.whenReady().then(() => {
  import_electron.Menu.setApplicationMenu(null);
  createWindow();
  import_electron.app.on("activate", () => {
    if (import_electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
import_electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron.app.quit();
});
