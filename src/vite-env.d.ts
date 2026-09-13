/// <reference types="vite/client" />

declare module '*?worker' {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}

interface Window { aervyx: { openFile: () => Promise<{ path: string; content: string } | null>; saveFile: (payload: { path?: string; content: string }) => Promise<string | null>; restartApp: () => Promise<void>; openFolder: (folder: 'workspace' | 'autoexec') => Promise<void>; setAlwaysOnTop: (value: boolean) => Promise<void> } }

declare module 'lucide-react' {
	import type { FC, SVGProps } from 'react';
	type Icon = FC<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string; absoluteStrokeWidth?: boolean }>;
	export const Activity: Icon; export const BookOpen: Icon; export const ChevronDown: Icon; export const Code2: Icon;
	export const Copy: Icon; export const FilePlus2: Icon; export const FolderOpen: Icon; export const Gear: Icon;
	export const LayoutDashboard: Icon; export const Play: Icon; export const Save: Icon; export const Search: Icon;
	export const Settings2: Icon; export const Square: Icon; export const Trash2: Icon;
	export const X: Icon; export const Zap: Icon;
}

declare module 'fengari-web' {
	export const lua: any; export const lauxlib: any; export const lualib: any;
	export const to_jsstring: (value: unknown) => string; export const to_luastring: (value: string) => unknown;
}