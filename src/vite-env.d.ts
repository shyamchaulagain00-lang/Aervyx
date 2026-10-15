/// <reference types="vite/client" />

declare module '*?worker' {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}

interface Window { aervyx: {
	openFile: () => Promise<{ path: string; content: string } | null>;
	saveFile: (payload: { path?: string; content: string }) => Promise<string | null>;
	restartApp: () => Promise<void>;
	openFolder: (folder: 'workspace' | 'autoexec') => Promise<void>;
	setAlwaysOnTop: (value: boolean) => Promise<void>;
	getRobloxTestInfo: () => Promise<{ status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'; endpoint: string; pairingToken: string; error: string }>;
	sendRobloxTestCommand: (command: { command: string; args: Record<string, unknown> }) => Promise<{ id: string; ok: boolean; output: string }>;
	onRobloxTestStatus: (callback: (status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR') => void) => () => void;
} }

declare module 'fengari-web' {
	export const lua: any; export const lauxlib: any; export const lualib: any;
	export const to_jsstring: (value: unknown) => string; export const to_luastring: (value: string) => unknown;
}
