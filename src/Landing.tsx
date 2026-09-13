import { Activity, BookOpen, Code2, FilePlus2, FolderOpen, Play, Search, Settings2, Zap } from 'lucide-react';
import './landing.css';

// Replace this with the hosted Aervyx .exe URL before deploying.
const DOWNLOAD_URL = '/downloads/Aervyx.exe';
const previewCode = ['-- Aervyx Showcase Script', '-- Fast • Keyless • Reliable', '', 'local Aervyx = {', '    Version = "1.0.0",', '    Author = "wtzx",', '    Status = "Ready"', '}', '', 'function Aervyx:Init()', '    print("AERVYX EXECUTOR")', '    print("Version: " .. self.Version)', '    print("Loaded successfully!")', 'end'];
const features = [
  { icon: Zap, title: 'Lightning Fast Execution', text: 'A focused runtime built to keep your scripts moving without friction.' },
  { icon: BookOpen, title: 'Completely Keyless', text: 'Open Aervyx and get straight to the work with no extra steps.' },
  { icon: Settings2, title: 'Clean Modern UI', text: 'A calm, precise workspace designed for repeated daily use.' },
  { icon: Search, title: 'ScriptHub Supported', text: 'Discover and bring community scripts into your workflow.' },
];

function ExecutorPreview() {
  return <div className="preview-window" aria-label="Aervyx Executor preview"><div className="preview-sidebar"><div className="preview-brand"><img src="/aervyx-logo.png" alt="Aervyx" /><strong>Aervyx</strong></div><div className="preview-nav-label">WORKSPACE</div><div className="preview-nav active"><Code2 size={13} /> Executor <i /></div><div className="preview-nav"><BookOpen size={13} /> ScriptHub</div><div className="preview-nav"><Settings2 size={13} /> Settings</div><div className="preview-runtime"><Zap size={13} /><span>Lua runtime<small>Embedded &amp; sandboxed</small></span></div></div><div className="preview-main"><div className="preview-topbar"><div><small>AERVYX / EXECUTOR</small><strong>Script Executor</strong></div><div className="preview-window-actions"><span>−</span><span>□</span><span>×</span></div></div><div className="preview-tabs"><span><i /> Script 1 <b>×</b></span><button><FilePlus2 size={12} /></button></div><div className="preview-toolbar"><button className="preview-execute"><Play size={11} fill="currentColor" /> Execute</button><span><Activity size={10} /> Clear</span><span>■ Stop</span><div /><span><FolderOpen size={11} /> Open</span><span><Search size={11} /> Lua 5.3</span></div><div className="preview-editor"><div className="preview-lines">{previewCode.map((_, index) => <span key={index}>{index + 1}</span>)}</div><pre>{previewCode.map((line, index) => <code key={`${line}-${index}`} className={index < 2 ? 'comment' : index === 3 || index === 9 ? 'keyword' : ''}>{line || ' '}{'\n'}</code>)}</pre></div><div className="preview-console"><div className="preview-console-tabs"><strong>Output <em>1</em></strong><span>Console</span><span>Errors <em>0</em></span><span>Warnings <em>0</em></span><i>Clear Console　 Copy Output</i></div><div className="preview-output"><b>›</b> Aervyx runtime ready. Output from your scripts will appear here.</div></div></div></div>;
}

function DiscordLink() {
  return (
    <a
      className="discord-float"
      href="https://discord.gg/M7pD8FnSe"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Join Aervyx Discord"
      title="Join our Discord"
    >
      <Zap size={22} aria-hidden="true" />
      <span className="discord-tooltip">Join our Discord</span>
    </a>
  );
}

export default function Landing() {
  return <div className="download-site"><div className="ambient ambient-one" /><div className="ambient ambient-two" /><nav className="site-nav"><a className="site-brand" href="#top"><img src="/aervyx-logo.png" alt="Aervyx" /><span>Aervyx</span></a><a className="nav-download" href={DOWNLOAD_URL} download><FilePlus2 size={15} /> Download</a></nav><DiscordLink /><main id="top"><section className="hero-section"><div className="hero-copy"><div className="eyebrow-pill"><span /> BUILT FOR MOMENTUM</div><h1>Aervyx</h1><p className="hero-tagline">Fast <b>•</b> Keyless <b>•</b> Reliable Executor</p><p className="hero-description">A sharp, streamlined Lua workspace for writing, discovering, and running scripts with confidence.</p><a className="hero-download" href={DOWNLOAD_URL} download><FilePlus2 size={18} /> Download Aervyx <span>→</span></a><p className="hero-meta"><Activity size={13} /> Windows 10/11 <span /> v1.0.0</p></div><div className="hero-orbit"><div className="orbit-ring" /><div className="hero-mark"><img src="/aervyx-logo.png" alt="" /></div></div></section><section className="preview-section"><div className="section-kicker"><span /> THE WORKSPACE <span /></div><h2>Everything you need.<br /><em>Nothing in the way.</em></h2><p className="section-lead">A precise executor interface that keeps your attention on the script.</p><ExecutorPreview /></section><section className="features-section"><div className="section-kicker"><span /> WHY AERVYX <span /></div><h2>Made to feel <em>effortless.</em></h2><div className="feature-grid">{features.map(({ icon: Icon, title, text }) => <article className="feature-card" key={title}><div className="feature-icon"><Icon size={18} /></div><h3>{title}</h3><p>{text}</p></article>)}</div></section><section className="final-cta"><div><div className="eyebrow-pill"><span /> READY WHEN YOU ARE</div><h2>Start building with Aervyx.</h2><p>Download the cleanest way to run your scripts.</p></div><a className="hero-download" href={DOWNLOAD_URL} download><FilePlus2 size={18} /> Download for Windows <span>→</span></a></section></main><footer><div className="footer-brand"><Code2 size={15} /> Aervyx</div><span>© 2026 Aervyx. All rights reserved.</span><span>Fast • Keyless • Reliable</span></footer></div>;
}
