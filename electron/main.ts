import { app, BrowserWindow, dialog, ipcMain, Menu, net, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { appendFileSync } from 'node:fs';

let mainWindow: BrowserWindow;
const createWindow = () => {
  const win = new BrowserWindow({ width: 1440, height: 920, minWidth: 1050, minHeight: 680, title: 'Aervyx', backgroundColor: '#08090d', icon: path.join(__dirname, '../dist/aervyx-logo.png'), webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs') } });
  mainWindow = win;

  // Production debugging is controlled by AERVYX_DEBUG_RENDERER=1. Logs renderer
  // console output + load failures to a file and opens DevTools. Keep this
  // permanently opt-in: it costs nothing when disabled and makes any future
  // packaged-app black screen diagnosable without a code change.
  if (process.env.AERVYX_DEBUG_RENDERER) {
    const debugLog = path.join(process.env.TEMP ?? '.', 'aervyx-renderer-debug.log');
    const shotPath = path.join(process.env.TEMP ?? '.', 'aervyx-window.png');
    const log = (line: string) => { try { appendFileSync(debugLog, `${line}\n`); } catch { /* diagnostics are best-effort */ } };
    win.webContents.on('console-message', (_event, level, message, line, source) => log(`[console:${level}] ${message} (${source}:${line})`));
    win.webContents.on('did-fail-load', (_event, code, desc, url) => log(`[did-fail-load] ${code} ${desc} ${url}`));
    win.webContents.on('render-process-gone', (_event, details) => log(`[render-process-gone] ${JSON.stringify(details)}`));
    win.webContents.on('did-finish-load', () => {
      log('[did-finish-load] OK');
      setTimeout(() => { void win.webContents.capturePage().then((image) => fs.writeFile(shotPath, image.toPNG())).then(() => log(`[screenshot] ${shotPath}`)).catch((error: unknown) => log(`[screenshot-failed] ${String(error)}`)); }, 5000);
    });
  }

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  // Only use the Vite dev server in development. When packaged, always load the built
  // renderer from disk so a stale env var can never point the app at localhost.
  if (devUrl && !app.isPackaged) void win.loadURL(devUrl); else void win.loadFile(path.join(__dirname, '../dist/index.html'));
};

ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Lua Script', extensions: ['lua'] }] });
  if (result.canceled || !result.filePaths[0]) return null;
  return { path: result.filePaths[0], content: await fs.readFile(result.filePaths[0], 'utf8') };
});
ipcMain.handle('file:save', async (_event, payload: { path?: string; content: string }) => {
  let filePath = payload.path;
  if (!filePath) {
    const result = await dialog.showSaveDialog({ defaultPath: 'script.lua', filters: [{ name: 'Lua Script', extensions: ['lua'] }] });
    if (result.canceled || !result.filePath) return null;
    filePath = result.filePath.endsWith('.lua') ? result.filePath : `${result.filePath}.lua`;
  }
  await fs.writeFile(filePath, payload.content, 'utf8');
  return filePath;
});
ipcMain.handle('app:restart', () => { app.relaunch(); app.exit(0); });
ipcMain.handle('window:always-on-top', (_event, value: boolean) => { mainWindow?.setAlwaysOnTop(Boolean(value)); });
ipcMain.handle('folder:open', async (_event, folder: 'workspace' | 'autoexec') => {
  const target = folder === 'autoexec' ? path.join(app.getAppPath(), 'autoexec') : app.getAppPath();
  await fs.mkdir(target, { recursive: true });
  await shell.openPath(target);
});

app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });