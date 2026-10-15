import { Component, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker';
import { Activity, Award, BookOpen, ChevronDown, Code2, Copy, Crown, FilePlus2, FolderOpen, LayoutDashboard, LayoutPanelLeft, Play, Radio, Save, Search, Settings2, Square, Trash2, X, Zap } from 'lucide-react';
import { runLua, describeRuntime } from './lua/runtime';
import { RUNTIME_LIMITS } from './lua/diagnostics';
import { parseCommandInput } from './roblox-test/protocol';
import './scripthub.css';
import './settings.css';
import './roblox-test/roblox-test.css';

type Tab = { id: number; name: string; path?: string; code: string; dirty: boolean };
type Log = { type: 'output' | 'error' | 'warning'; text: string; time: string };
type ScriptBloxScript = {
  _id?: string;
  slug?: string;
  title?: string;
  game?: { name?: string; imageUrl?: string };
  image?: string;
  views?: number;
  likes?: number;
  key?: boolean;
  verified?: boolean;
  isUniversal?: boolean;
  scriptType?: string;
};
const scriptBloxApi = 'https://scriptblox.com/api/script';

function getScriptImage(script: ScriptBloxScript) {
  const image = script.image || script.game?.imageUrl;
  if (!image) return '';
  return image.startsWith('/') ? `https://scriptblox.com${image}` : image;
}

const initialTabs: Tab[] = [{ id: 1, name: 'Script 1', code: '', dirty: false }];

const defaultSettings: Record<string, boolean> = { alwaysOnTop: false, systemTray: false };

const TAB_MENU_WIDTH = 168;
const TAB_MENU_HEIGHT = 96;

function readFontSize(): number {
  try {
    const value = Number(localStorage.getItem('aervyx-font-size') ?? 14);
    return Number.isFinite(value) && value > 0 ? value : 14;
  } catch { return 14; }
}

function readSettings(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem('aervyx-settings');
    if (!saved) return { ...defaultSettings };
    const parsed: unknown = JSON.parse(saved);
    if (typeof parsed !== 'object' || parsed === null) return { ...defaultSettings };
    return { ...defaultSettings, ...(parsed as Record<string, boolean>) };
  } catch (error) { console.warn('[aervyx] ignoring corrupt settings', error); return { ...defaultSettings }; }
}

function safeStorageSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch (error) { console.warn('[aervyx] storage write failed', error); }
}

function getBridge() { return (window as unknown as { aervyx?: Window['aervyx'] }).aervyx; }

function invokeSafely(task: () => Promise<unknown> | undefined | void) {
  try {
    const result = task();
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      (result as Promise<unknown>).catch((error) => console.warn('[aervyx] bridge call failed', error));
    }
  } catch (error) { console.warn('[aervyx] bridge unavailable', error); }
}

// Bundle Monaco locally instead of loading it from a CDN. The packaged Electron
// renderer runs over file://, often without network access, so the default
// @monaco-editor/react CDN loader can fail and leave the Executor pane broken.
// This must never throw: a Monaco failure may only break the editor pane
// (caught by EditorPaneBoundary), never the whole app module import.
try {
  loader.config({ monaco });
} catch (error) {
  console.warn('[aervyx] monaco loader config failed', error);
}
try {
  if (typeof self !== 'undefined') {
    (self as unknown as { MonacoEnvironment?: { getWorker: (_: string, label: string) => Worker } }).MonacoEnvironment = {
      getWorker(_: string, label: string) {
        if (label === 'json') return new jsonWorker();
        if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
        if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
        if (label === 'typescript' || label === 'javascript') return new tsWorker();
        return new editorWorker();
      },
    };
  }
} catch (error) {
  console.warn('[aervyx] monaco worker setup failed', error);
}

class EditorPaneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('[aervyx] editor failed', error); }
  render() {
    if (this.state.failed) {
      return <div className="editor-fallback">Code editor failed to load. Your scripts are safe — restart Aervyx and try again.</div>;
    }
    return this.props.children;
  }
}

function nowTime() {
  try { return new Date().toLocaleTimeString('en-GB', { hour12: false }); } catch { return ''; }
}

// Runtime identity is read from the VM itself rather than hard-coded, so the
// version shown in the UI cannot drift from the version actually executing code.
const runtimeInfo = describeRuntime();
const runtimeLimitsTooltip = RUNTIME_LIMITS.map((limit) => `${limit.title}: ${limit.detail}`).join('\n\n');

// Execution lives in src/lua/runtime.ts and diagnostics in src/lua/diagnostics.ts.
// Both are covered by scripts/test-lua-runtime.mjs (`npm run test:lua`). The old
// inline harness was removed from this file because it could not be tested
// without rendering the whole app, which is why three defects in it went
// unnoticed: print({}) threw instead of printing, error({...}) replaced the real
// message with an unrelated TypeError, and runtime errors arrived with no
// traceback because lua_pcall was given errfunc 0.

export default function App() {
  const [tabs, setTabs] = useState(initialTabs);
  const [active, setActive] = useState(1);
  const [logs, setLogs] = useState<Log[]>([{ type: 'output', text: 'Aervyx runtime ready. Output from your scripts will appear here.', time: nowTime() }]);
  const [consoleTab, setConsoleTab] = useState<Log['type'] | 'console'>('output');
  const [running, setRunning] = useState(false);
  const [executionMode, setExecutionMode] = useState<'lua' | 'studio-test'>('lua');
  const [studioStatus, setStudioStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'>('CONNECTING');
  const [studioBridgeInfo, setStudioBridgeInfo] = useState<{ endpoint: string; pairingToken: string; error: string }>({ endpoint: 'http://127.0.0.1:43827', pairingToken: '', error: '' });
  const [tabMenu, setTabMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [nav, setNav] = useState('Executor');
  const [fontSize, setFontSize] = useState(readFontSize);
  const [scripts, setScripts] = useState<ScriptBloxScript[]>([]);
  const [scriptSearch, setScriptSearch] = useState('');
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState('');
  const [scriptAction, setScriptAction] = useState<string | null>(null);
  const [scriptImageErrors, setScriptImageErrors] = useState<Record<string, boolean>>({});
  const [settingsTab, setSettingsTab] = useState<'General' | 'Integrations'>('General');
  const [settings, setSettings] = useState<Record<string, boolean>>(readSettings);
  const editorRef = useRef<unknown>(null);
  const current = tabs.find((tab) => tab.id === active) || tabs[0];

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) { setStudioStatus('DISCONNECTED'); setStudioBridgeInfo((info) => ({ ...info, error: 'Aervyx desktop bridge is available only in the Electron app.' })); return; }
    let activeEffect = true;
    const unsubscribe = bridge.onRobloxTestStatus((status) => { if (activeEffect) setStudioStatus(status); });
    bridge.getRobloxTestInfo()
      .then((info) => { if (activeEffect) { setStudioStatus(info.status); setStudioBridgeInfo(info); } })
      .catch((error: unknown) => { if (activeEffect) { setStudioStatus('ERROR'); setStudioBridgeInfo((info) => ({ ...info, error: error instanceof Error ? error.message : String(error) })); } });
    return () => { activeEffect = false; unsubscribe(); };
  }, []);

  useEffect(() => { safeStorageSet('aervyx-font-size', String(fontSize)); }, [fontSize]);
  useEffect(() => { safeStorageSet('aervyx-settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => {
    if (nav !== 'ScriptHub') return;
    const controller = new AbortController();
    setScriptLoading(true);
    setScriptError('');
    fetch(`${scriptBloxApi}/fetch?max=20&sortBy=updatedAt&order=desc`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(`ScriptBlox returned ${response.status}`); return response.json(); })
      .then((payload) => setScripts(Array.isArray(payload?.result?.scripts) ? payload.result.scripts : Array.isArray(payload?.scripts) ? payload.scripts : []))
      .catch((error: unknown) => { if ((error as Error).name !== 'AbortError') setScriptError(error instanceof Error ? error.message : 'Unable to load ScriptBlox scripts.'); })
      .finally(() => setScriptLoading(false));
    return () => controller.abort();
  }, [nav]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F6') { event.preventDefault(); execute(); }
      if (event.ctrlKey && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
      if (event.ctrlKey && event.key.toLowerCase() === 'o') { event.preventDefault(); void open(); }
      if (event.ctrlKey && event.key.toLowerCase() === 'n') { event.preventDefault(); newTab(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => {
    if (!tabMenu) return;
    const closeMenu = () => setTabMenu(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setTabMenu(null); };
    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
      window.removeEventListener('keydown', onKey);
    };
  }, [tabMenu]);
  useEffect(() => {
    if (renamingId === null) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setRenamingId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [renamingId]);

  function updateCode(code: string) { setTabs((items) => items.map((tab) => tab.id === active ? { ...tab, code, dirty: true } : tab)); }
  function newTab() { const id = Date.now(); setTabs((items) => [...items, { id, name: `Script ${items.length + 1}`, code: '-- New Lua script\n\n', dirty: false }]); setActive(id); }
  function deleteTab(id: number) {
    setTabMenu(null);
    setRenamingId(null);
    if (tabs.length === 1) {
      const fresh = { id: Date.now(), name: 'Script 1', code: '', dirty: false };
      setTabs([fresh]);
      setActive(fresh.id);
      return;
    }
    const index = tabs.findIndex((tab) => tab.id === id);
    const next = tabs.filter((tab) => tab.id !== id);
    setTabs(next);
    if (id === active) setActive(next[Math.max(0, index - 1)].id);
  }
  function openTabMenu(event: ReactMouseEvent<HTMLButtonElement>, id: number) {
    event.preventDefault();
    setActive(id);
    const x = Math.max(8, Math.min(window.innerWidth - TAB_MENU_WIDTH - 8, event.clientX));
    const y = Math.max(8, Math.min(window.innerHeight - TAB_MENU_HEIGHT - 8, event.clientY));
    setTabMenu({ id, x, y });
  }
  function startRename(id: number) {
    const tab = tabs.find((item) => item.id === id);
    setRenameValue(tab?.name ?? '');
    setRenamingId(id);
    setTabMenu(null);
  }
  function confirmRename() {
    if (renamingId === null) return;
    const trimmed = renameValue.trim();
    if (trimmed.length > 0) setTabs((items) => items.map((item) => item.id === renamingId ? { ...item, name: trimmed } : item));
    setRenamingId(null);
  }
  async function save() {
    const bridge = getBridge();
    if (!bridge) { console.warn('[aervyx] save unavailable outside Electron'); return; }
    try {
      const path = await bridge.saveFile({ path: current.path, content: current.code });
      if (path) setTabs((items) => items.map((tab) => tab.id === active ? { ...tab, path, name: path.split(/[\\/]/).pop()?.replace(/\.lua$/, '') || tab.name, dirty: false } : tab));
    } catch (error) { console.warn('[aervyx] save failed', error); }
  }
  async function open() {
    const bridge = getBridge();
    if (!bridge) { console.warn('[aervyx] open unavailable outside Electron'); return; }
    try {
      const result = await bridge.openFile();
      if (!result) return;
      const id = Date.now();
      setTabs((items) => [...items, { id, name: result.path.split(/[\\/]/).pop()?.replace(/\.lua$/, '') || 'Opened script', path: result.path, code: result.content, dirty: false }]);
      setActive(id);
    } catch (error) { console.warn('[aervyx] open failed', error); }
  }
  async function searchScripts(event: React.FormEvent) {
    event.preventDefault();
    const query = scriptSearch.trim();
    if (!query) return;
    setScriptLoading(true); setScriptError('');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let response: Response;
      try {
        response = await fetch(`${scriptBloxApi}/search?q=${encodeURIComponent(query)}&max=20`, { signal: controller.signal });
      } finally { clearTimeout(timeout); }
      if (!response.ok) throw new Error(`ScriptBlox returned ${response.status}`);
      const payload = await response.json();
      setScripts(Array.isArray(payload?.result?.scripts) ? payload.result.scripts : Array.isArray(payload?.scripts) ? payload.scripts : []);
    } catch (error) {
      console.warn('[aervyx] scripthub search failed', error);
      setScripts([]);
      setScriptError(error instanceof Error ? error.message : 'Unable to search ScriptBlox scripts.');
    }
    finally { setScriptLoading(false); }
  }
  async function loadScriptBloxCode(script: ScriptBloxScript, executeAfter: boolean) {
    const identifier = script._id || script.slug;
    if (!identifier) { setScriptError('This ScriptBlox entry has no raw script identifier.'); return; }
    setScriptAction(identifier);
    setScriptError('');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let response: Response;
      try {
        response = await fetch(`${scriptBloxApi}/raw/${encodeURIComponent(identifier)}`, { signal: controller.signal });
      } finally { clearTimeout(timeout); }
      if (!response.ok) throw new Error(`Unable to fetch raw script (${response.status}).`);
      const text = await response.text();
      let source = text;
      try {
        const payload = JSON.parse(text);
        source = payload?.script || payload?.raw || payload?.code || payload?.result?.script || text;
      } catch { /* ScriptBlox may return raw Lua text. */ }
      const id = Date.now();
      setTabs((items) => [...items, { id, name: script.title || 'ScriptBlox script', code: source, dirty: false }]);
      setActive(id);
      if (executeAfter) {
        setExecutionMode('lua');
        setNav('Executor');
        runScript(source, script.title || 'ScriptBlox script');
      }
    } catch (error) {
      console.warn('[aervyx] scripthub raw fetch failed', error);
      setScriptError(error instanceof Error ? error.message : 'Unable to load this ScriptBlox script.');
    }
    finally { setScriptAction(null); }
  }
  // Runs a script through the hardened harness. The chunk name is the tab name,
  // which is what then appears in error messages and tracebacks.
  function runScript(source: string, chunkName: string) {
    setRunning(true);
    setLogs([{ type: 'output', text: 'Executing script…', time: nowTime() }]);
    setConsoleTab('output');
    // Deferred so the "Executing" state paints before the synchronous VM takes
    // over the thread. The VM cannot be pre-empted from here; see
    // EXECUTION_CAN_BE_INTERRUPTED in src/lua/runtime.ts for the measurement.
    setTimeout(() => {
      const outcome = runLua({
        source,
        chunkName,
        sandbox: 'strict',
        write: (log) => setLogs((items) => [...items, { type: log.kind, text: log.text, time: nowTime() }]),
      });
      setRunning(false);
      if (outcome.ok) {
        setLogs((items) => [...items, { type: 'output', text: `Finished in ${outcome.elapsedMs} ms on ${runtimeInfo.release}.`, time: nowTime() }]);
      }
    }, 0);
  }

  async function execute() {
    if (running) return;
    if (!current.code.trim()) {
      setLogs([{ type: 'warning', text: 'Execution skipped — the editor is empty. Write a Lua script first.', time: nowTime() }]);
      setConsoleTab('console');
      return;
    }
    if (executionMode === 'studio-test') {
      const parsed = parseCommandInput(current.code);
      if (!parsed.ok) {
        setLogs([{ type: 'error', text: `Invalid Roblox Studio Test command\n${parsed.error}`, time: nowTime() }]);
        setConsoleTab('error');
        return;
      }
      const bridge = getBridge();
      if (!bridge) {
        setLogs([{ type: 'error', text: 'Roblox Studio Test requires the Aervyx Electron desktop bridge.', time: nowTime() }]);
        setConsoleTab('error');
        return;
      }
      setRunning(true);
      setConsoleTab('console');
      setLogs([{ type: 'output', text: `[AERVYX] Sending command... ${parsed.value.command}`, time: nowTime() }]);
      console.log('[AERVYX] Sending command...', parsed.value.command);
      try {
        const response = await bridge.sendRobloxTestCommand(parsed.value);
        console.log('[AERVYX] Response received...', response.id, response.ok);
        setLogs((items) => [...items,
          { type: response.ok ? 'output' : 'error', text: `[AERVYX] Response received... ${response.id}`, time: nowTime() },
          { type: response.ok ? 'output' : 'error', text: response.output, time: nowTime() },
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[AERVYX] Roblox Studio Test command failed', message);
        setLogs((items) => [...items, { type: 'error', text: `[AERVYX] ${message}`, time: nowTime() }]);
        try {
          const info = await bridge.getRobloxTestInfo();
          setStudioStatus(info.status);
          setStudioBridgeInfo(info);
        } catch { setStudioStatus('ERROR'); }
      } finally { setRunning(false); }
      return;
    }
    runScript(current.code, current.name);
  }

  function openStudioTestExample() {
    setExecutionMode('studio-test');
    updateCode('{\n  "command": "print",\n  "args": { "message": "Hello from Aervyx Studio Test" }\n}');
    setNav('Executor');
  }

  async function copyPairingToken() {
    try { await navigator.clipboard.writeText(studioBridgeInfo.pairingToken); }
    catch (error) { setLogs((items) => [...items, { type: 'warning', text: `Clipboard unavailable: ${String(error)}`, time: nowTime() }]); }
  }
  function clear() { updateCode(''); }
  function copyOutput() {
    try {
      const text = logs.map((log) => log.text).join('\n');
      const done = navigator?.clipboard?.writeText(text);
      if (done && typeof done.catch === 'function') done.catch((error) => console.warn('[aervyx] copy failed', error));
    } catch (error) { console.warn('[aervyx] copy unavailable', error); }
  }
  async function toggleSetting(key: string) {
    const value = !settings[key];
    if (typeof value !== 'boolean') return;
    setSettings((items) => ({ ...items, [key]: value }));
    if (key === 'alwaysOnTop') invokeSafely(() => getBridge()?.setAlwaysOnTop(value));
  }
  function settingToggle(key: string) { return <button className={`setting-toggle ${settings[key] ? 'on' : ''}`} aria-pressed={settings[key]} onClick={() => void toggleSetting(key)}><span /></button>; }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><img src="./aervyx-logo.png" alt="Aervyx" /><span>Aervyx</span></div>
      <div className="side-label">WORKSPACE</div>
      <nav>{( [['Dashboard', LayoutDashboard], ['Executor', Code2], ['Roblox Studio Test', Radio], ['ScriptHub', BookOpen], ['Credits', BookOpen], ['Settings', Settings2]] as const).map(([label, Icon]) => <button className={`nav-item ${nav === label ? 'active' : ''}`} key={String(label)} onClick={() => setNav(String(label))}><Icon size={17} /><span>{label}</span>{label === 'Executor' && <span className="nav-pip" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="runtime-card"><div className="runtime-icon"><Zap size={16} /></div><div><strong>{runtimeInfo.release}</strong><small>Embedded, sandboxed, no host access</small></div><Activity size={14} className="pulse" /></div><div className="version">AERVYX <span>v1.0.0</span></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><div className="eyebrow">AERVYX / {nav.toUpperCase()}</div><h1>{nav === 'Executor' ? 'Script Executor' : nav}</h1></div><div className="window-actions"><button title="Settings"><Settings2 size={17} /></button><span className="window-divider" /><button title="Minimize">−</button><button title="Maximize">□</button><button title="Close" className="close-window">×</button></div></header>
      {nav === 'Roblox Studio Test' ? <section className="roblox-test-page">
        <div className="roblox-test-intro"><span className="eyebrow">LOCAL DEVELOPMENT BRIDGE</span><h2>Roblox Studio Test</h2><p>Send a small allowlisted test command to your open Studio project. Aervyx sends structured JSON only; it never forwards or runs arbitrary Lua source.</p></div>
        <article className="roblox-test-card">
          <div className="roblox-test-card-head"><div><strong>Connection</strong><p>Local Studio plugin heartbeat</p></div><span className={`roblox-test-status ${studioStatus.toLowerCase()}`}>{studioStatus}</span></div>
          {studioBridgeInfo.error && <p className="roblox-test-error">{studioBridgeInfo.error}</p>}
          <label className="roblox-test-field"><span>Local endpoint</span><code>{studioBridgeInfo.endpoint}</code></label>
          <label className="roblox-test-field"><span>Pairing token <small>Paste into the Aervyx Studio Test plugin.</small></span><div className="roblox-token-row"><code>{studioBridgeInfo.pairingToken || 'Unavailable outside the Aervyx desktop app'}</code><button onClick={() => void copyPairingToken()} disabled={!studioBridgeInfo.pairingToken}>Copy token</button></div></label>
          <div className="roblox-test-steps"><strong>Start the bridge</strong><ol><li>Open <code>roblox-studio-test/default.project.json</code> in Roblox Studio with Rojo, then press Play.</li><li>Install <code>AervyxStudioBridge.plugin.lua</code> as a local Studio plugin.</li><li>Paste the token above into the plugin and connect.</li><li>Return to Executor, select <b>Roblox Studio Test</b>, and execute a JSON command.</li></ol></div>
          <button className="roblox-test-primary" onClick={openStudioTestExample}>Open a test command in the editor</button>
        </article>
        <p className="roblox-test-footnote">Commands are validated by Aervyx, the plugin, and the Studio server handler. Only the dedicated Aervyx test Part and the current local Studio test player are affected.</p>
      </section> : nav === 'Settings' ? <section className="settings-page">
        <div className="settings-tabs">{(['General', 'Integrations'] as const).map((tab) => <button className={settingsTab === tab ? 'selected' : ''} key={tab} onClick={() => setSettingsTab(tab)}>{tab}</button>)}</div>
        <div className="settings-section"><span className="settings-section-label">{settingsTab.toUpperCase()}</span><span className="settings-section-rule" /></div>
        {settingsTab === 'General' ? <div className="settings-list">
          <div className="settings-card"><div><strong>Folders</strong><p>Quickly open important Aervyx folders</p></div><div className="settings-actions"><button onClick={() => invokeSafely(() => getBridge()?.openFolder('workspace'))}>Open Workspace</button><button onClick={() => invokeSafely(() => getBridge()?.openFolder('autoexec'))}>Open Autoexec</button></div></div>
          <div className="settings-card"><div><strong>Restart App</strong><p>Restart Aervyx to apply changes or recover from issues</p></div><button onClick={() => invokeSafely(() => getBridge()?.restartApp())}>Restart</button></div>
          <div className="settings-card"><div><strong>Always on Top</strong><p>Keep Aervyx window above other applications</p></div>{settingToggle('alwaysOnTop')}</div>
        </div> : <div className="settings-list">
          <div className="settings-card"><div><strong>Discord RPC</strong><p>Show Aervyx status in Discord</p></div>{settingToggle('discordRpc')}</div>
          <div className="settings-card"><div><strong>Debug Console</strong><p>Enable console window for debugging</p></div>{settingToggle('debugConsole')}</div>
          <div className="settings-card"><div><strong>Notification Sound</strong><p>Play a sound when in-app notifications appear</p></div>{settingToggle('notificationSound')}</div>
          <div className="settings-card"><div><strong>Sidebar Client Count</strong><p>Show attached clients count badge in sidebar</p></div>{settingToggle('sidebarClientCount')}</div>
          <div className="settings-card"><div><strong>Taskbar Client Count</strong><p>Show attached clients count on taskbar overlay</p></div>{settingToggle('taskbarClientCount')}</div>
        </div>}
      </section> : nav === 'ScriptHub' ? <section className="scripthub-page">
        <div className="scripthub-toolbar"><div><span className="eyebrow">AERVYX / SCRIPTHUB</span><h2>Community scripts</h2></div><form className="scripthub-search" onSubmit={searchScripts}><Search size={16} /><input value={scriptSearch} onChange={(event) => setScriptSearch(event.target.value)} placeholder="Search ScriptBlox" aria-label="Search ScriptBlox" /><button type="submit">Search</button></form></div>
        {scriptError && <div className="scripthub-error">{scriptError}</div>}
        {scriptLoading ? <div className="scripthub-state">Loading scripts from ScriptBlox...</div> : scripts.length === 0 ? <div className="scripthub-state">No scripts found.</div> : <div className="script-grid">{scripts.map((script, index) => {
          const identifier = script._id || script.slug || String(index);
          const image = getScriptImage(script);
          const imageFailed = scriptImageErrors[identifier];
          return <article className="script-card" key={identifier}><div className="script-card-image">{image && !imageFailed ? <img src={image} alt="" loading="lazy" decoding="async" onError={() => setScriptImageErrors((items) => ({ ...items, [identifier]: true }))} /> : <BookOpen size={28} aria-hidden="true" />}</div><div className="script-card-content"><h3>{script.title || 'Untitled script'}</h3><p className="script-game">{script.game?.name || 'Universal'}</p><div className="script-stats"><span>{typeof script.views === 'number' ? `${script.views.toLocaleString()} views` : 'Views unavailable'}</span>{typeof script.likes === 'number' && <span>{script.likes.toLocaleString()} likes</span>}</div><div className="script-badges">{script.verified && <span>VERIFIED</span>}{script.key && <span>KEY</span>}{script.isUniversal && <span>UNIVERSAL</span>}<span>{script.scriptType?.toLowerCase() === 'paid' ? 'PAID' : 'FREE'}</span></div><div className="script-card-actions"><button onClick={() => void loadScriptBloxCode(script, false)} disabled={scriptAction === identifier}>Open in Tab</button><button className="script-execute" onClick={() => void loadScriptBloxCode(script, true)} disabled={scriptAction === identifier}><Play size={13} fill="currentColor" />{scriptAction === identifier ? 'Loading...' : 'Execute Script'}</button></div></div></article>;
        })}</div>}
        <div className="scripthub-powered">Powered by ScriptBlox.com</div>
      </section> : nav === 'Credits' ? <section className="credits-page">
        <div className="credits-card">
          <div className="credits-head"><Award size={30} strokeWidth={1.8} /><h2>Credits</h2><p>Thanks to our contributors</p></div>
          <div className="credits-rows">
            <div className="credit-row"><Crown size={17} /><strong>wtzx</strong><span className="credit-role">&mdash; Developer &amp; Owner of Aervyx</span></div>
            <div className="credit-row"><LayoutPanelLeft size={17} /><strong>wtzx</strong><span className="credit-role">&mdash; UI Designer</span></div>
          </div>
        </div>
      </section> : <section className="editor-workspace">
        <div className="tabs-bar"><div className="tabs-scroll">{tabs.map((tab) => <button className={`script-tab ${tab.id === active ? 'active' : ''}`} key={tab.id} onClick={() => setActive(tab.id)} onContextMenu={(event) => openTabMenu(event, tab.id)}><span className="tab-dot" />{tab.name}{tab.dirty && <span className="dirty">●</span>}<X size={13} onClick={(event: ReactMouseEvent<SVGSVGElement>) => { event.stopPropagation(); deleteTab(tab.id); }} /></button>)}</div><button className="new-tab" onClick={newTab} title="New script (Ctrl+N)"><FilePlus2 size={16} /></button></div>
        {tabMenu && <div className="tab-context-menu" style={{ left: tabMenu.x, top: tabMenu.y }} role="menu" aria-label="Script tab options"><button role="menuitem" onClick={(event) => { event.stopPropagation(); startRename(tabMenu.id); }}>Rename</button><button role="menuitem" className="danger" onClick={(event) => { event.stopPropagation(); deleteTab(tabMenu.id); }}>Delete</button></div>}
        {renamingId !== null && <div className="rename-overlay" onClick={() => setRenamingId(null)}><div className="rename-dialog" role="dialog" aria-label="Rename script" onClick={(event) => event.stopPropagation()}><h3>Rename Script</h3><input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') confirmRename(); }} onFocus={(event) => event.currentTarget.select()} spellCheck={false} aria-label="Script name" maxLength={80} /><div className="rename-actions"><button onClick={() => setRenamingId(null)}>Cancel</button><button className="primary" onClick={confirmRename} disabled={renameValue.trim().length === 0}>Rename</button></div></div></div>}
        <div className="toolbar"><div className="toolbar-group"><div className="execution-mode-toggle" role="group" aria-label="Execution mode"><button className={executionMode === 'lua' ? 'selected' : ''} aria-pressed={executionMode === 'lua'} onClick={() => setExecutionMode('lua')}>Standalone Lua</button><button className={executionMode === 'studio-test' ? 'selected' : ''} aria-pressed={executionMode === 'studio-test'} onClick={() => setExecutionMode('studio-test')}>Roblox Studio Test</button></div><button className="execute" onClick={() => void execute()} disabled={running}><Play size={15} fill="currentColor" />{running ? 'Running' : executionMode === 'studio-test' ? 'Send Test' : 'Execute'}<kbd>F6</kbd></button><button onClick={clear}><Trash2 size={15} />Clear</button><button disabled title="A running script cannot be interrupted. Measured on this build: the host instruction hook fires, but raising from it does not unwind the running call, so a runaway loop keeps the thread until it finishes. Use a loop guard in the script itself."><Square size={14} fill="currentColor" />Stop</button></div><div className="toolbar-group"><button onClick={() => void save()}><Save size={15} />Save<kbd>Ctrl S</kbd></button><button onClick={() => void open()}><FolderOpen size={15} />Open<kbd>Ctrl O</kbd></button><span className="tool-divider" /><button className="icon-btn" title="Search in editor"><Search size={16} /></button>{executionMode === 'studio-test' ? <span className={`roblox-inline-status ${studioStatus.toLowerCase()}`}>STUDIO {studioStatus}</span> : <span className="editor-meta" title={`Embedded ${runtimeInfo.release} runtime, read from the VM itself`}>{runtimeInfo.release} <ChevronDown size={13} /></span>}</div></div>
        <div className="editor-pane"><EditorPaneBoundary><Editor height="100%" theme="vs-dark" language={executionMode === 'studio-test' ? 'json' : 'lua'} value={current.code} onChange={(value) => updateCode(value || '')} onMount={(editor) => { editorRef.current = editor; }} options={{ fontSize, fontFamily: 'JetBrains Mono, Consolas, monospace', minimap: { enabled: false }, smoothScrolling: true, padding: { top: 16 }, lineNumbersMinChars: 3, renderLineHighlight: 'all', bracketPairColorization: { enabled: true }, scrollBeyondLastLine: false, tabSize: 4, automaticLayout: true, scrollbar: { horizontalScrollbarSize: 8, verticalScrollbarSize: 8 } }} /></EditorPaneBoundary></div>
        <div className="console-panel"><div className="console-head"><div className="console-tabs">{[['output', 'Output'], ['console', 'Console'], ['error', 'Errors'], ['warning', 'Warnings']].map(([key, label]) => <button className={consoleTab === key ? 'selected' : ''} key={key} onClick={() => setConsoleTab(key as typeof consoleTab)}>{label}{key !== 'console' && <span className="count">{logs.filter((log) => log.type === key).length}</span>}</button>)}</div><div className="console-actions"><button onClick={() => setLogs([])}><Trash2 size={14} />Clear Console</button><button onClick={copyOutput}><Copy size={14} />Copy Output</button></div></div><div className="console-body">{(consoleTab === 'console' ? logs : logs.filter((log) => log.type === consoleTab)).map((log, index) => <div className={`log-line ${log.type}`} key={`${log.text}-${index}`}><span className="log-symbol">{log.type === 'output' ? '›' : log.type === 'error' ? '!' : '▲'}</span><span className="log-text">{log.text}</span>{log.time && <time className="log-time">{log.time}</time>}</div>)}{logs.length === 0 && <div className="empty-console">No messages yet</div>}</div></div>
      </section>}
      <footer className="statusbar"><div><span className="status-dot" />Ready</div><div className="status-right"><span className="statusbar-version">Executor Version: 1.0.0</span><span>UTF-8</span><span>LF</span><label>Font <select value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))}><option value="12">12px</option><option value="14">14px</option><option value="16">16px</option></select></label><span>Ln 1, Col 1</span></div></footer>
    </main>
  </div>;
}
