import { ArrowDownToLine, Check, Code2, Command, FileCode2, FolderOpen, Play, Search, Settings2, Sparkles, Terminal, Zap } from 'lucide-react';
import { DOWNLOAD_PROVIDER_LIST } from './download-providers';
import './App.css';

// Root-relative so the same URL works on the *.vercel.app URL and on aervyx.com.
// The installer is served from public/downloads/Aervyx-Setup.exe.
const DOWNLOAD_URL = '/downloads/Aervyx-Setup.exe';
const codeLines = ['-- Aervyx Showcase Script', '-- Fast • Keyless • Reliable', '', 'local Aervyx = {', '    Version = "1.0.0",', '    Author = "wtzx",', '    Status = "Ready"', '}', '', 'function Aervyx:Init()', '    print("AERVYX EXECUTOR")', '    print("Loaded successfully!")', 'end'];
const features = [{ icon: Zap, title: 'Lightning Fast Execution', text: 'A focused runtime built to keep your scripts moving without friction.' }, { icon: Sparkles, title: 'Completely Keyless', text: 'Open Aervyx and get straight to work with no extra steps.' }, { icon: Settings2, title: 'Clean Modern UI', text: 'A calm, precise workspace designed for repeated daily use.' }, { icon: Search, title: 'ScriptHub Supported', text: 'Discover and bring community scripts into your workflow.' }];

function Preview() {
  return <div className="preview-window"><aside className="preview-sidebar"><div className="preview-brand"><img src="/aervyx-logo.png" alt="Aervyx" /><b>Aervyx</b></div><small className="preview-label">WORKSPACE</small><div className="preview-nav active"><Code2 size={13} /> Executor <i /></div><div className="preview-nav"><Sparkles size={13} /> ScriptHub</div><div className="preview-nav"><Settings2 size={13} /> Settings</div><div className="preview-runtime"><Zap size={13} /><span>Lua runtime<small>Embedded &amp; sandboxed</small></span></div></aside><div className="preview-main"><header className="preview-header"><div><small>AERVYX / EXECUTOR</small><b>Script Executor</b></div><span>−　□　×</span></header><div className="preview-tabs"><span><i /> Script 1　×</span><button><FileCode2 size={12} /></button></div><div className="preview-toolbar"><button><Play size={11} fill="currentColor" /> Execute</button><span><Command size={10} /> Clear</span><span>■ Stop</span><em /><span><FolderOpen size={11} /> Open</span><span><Search size={11} /> Lua 5.3</span></div><div className="preview-editor"><div className="line-numbers">{codeLines.map((_, index) => <span key={index}>{index + 1}</span>)}</div><pre>{codeLines.map((line, index) => <code key={index} className={index < 2 ? 'comment' : index === 3 || index === 9 ? 'keyword' : ''}>{line || ' '}{'\n'}</code>)}</pre></div><div className="preview-console"><div><b>Output <small>1</small></b><span>Console</span><span>Errors <small>0</small></span><span>Warnings <small>0</small></span><i>Clear Console　 Copy Output</i></div><p><strong>›</strong> Aervyx runtime ready. Output from your scripts will appear here.</p></div></div></div>;
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
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M20.321 19.267a1.837 1.837 0 0 0 1.837-2.236 6.024 6.024 0 0 0 .43-2.43 1.837 1.837 0 0 0-1.944-2.09A8.6 8.6 0 0 0 15.61 5.3a1.837 1.837 0 0 0-3.674 0 8.577 8.577 0 0 0-1.946 3.246 1.837 1.837 0 0 0 1.837 1.837c.496.78.576 1.764.237 2.654a3.72 3.72 0 0 1-.772 1.554 5.88 5.88 0 0 1-2.368 1.089 1.837 1.837 0 0 0-1.556 2.518 6.024 6.024 0 0 0 2.43 4.918c.436.354.782.196.982.07a1.837 1.837 0 0 0 1.556-2.517 5.88 5.88 0 0 1 2.04-3.838 3.717 3.717 0 0 1 2.48-.383c.892.125 1.78.046 2.668-.236a6.024 6.024 0 0 0 2.43-4.917 1.837 1.837 0 0 0-1.557-2.518 5.88 5.88 0 0 1 1.88-4.75 3.72 3.72 0 0 1 4.114-.39 5.88 5.88 0 0 1 5.22 3.369 1.837 1.837 0 0 0 1.645 2.458 8.6 8.6 0 0 0-1.294 3.555 1.837 1.837 0 0 0 3.674 0 8.577 8.577 0 0 0 1.792-3.645z" />
      </svg>
      <span className="discord-tooltip">Join our Discord</span>
    </a>
  );
}

export default function App() {
  return <div className="site"><div className="glow glow-left" /><div className="glow glow-right" /><nav><a className="brand" href="#top"><img src="/aervyx-logo.png" alt="Aervyx" /><b>Aervyx</b></a><a className="nav-download" href={DOWNLOAD_URL}><ArrowDownToLine size={15} /> Download</a></nav><main id="top"><section className="hero"><div className="hero-copy"><div className="eyebrow"><i /> BUILT FOR MOMENTUM</div><h1>Aervyx</h1><h2>Fast <b>•</b> Keyless <b>•</b> Reliable Executor</h2><p>A sharp, streamlined Lua workspace for writing, discovering, and running scripts with confidence.</p><a className="download-button" href={DOWNLOAD_URL}><ArrowDownToLine size={18} /> Download Aervyx <span>→</span></a><small className="platform"><Check size={13} /> Windows 10/11　|　v1.0.0</small></div><div className="hero-logo"><div className="ring" /><div className="logo-frame"><img src="/aervyx-logo.png" alt="Aervyx logo" /></div></div></section><section className="preview-section"><div className="section-label"><span /> THE WORKSPACE <span /></div><h2>Everything you need.<br /><em>Nothing in the way.</em></h2><p>A precise executor interface that keeps your attention on the script.</p><Preview /></section><section className="features"><div className="section-label"><span /> WHY AERVYX <span /></div><h2>Made to feel <em>effortless.</em></h2><div className="feature-grid">{features.map(({ icon: Icon, title, text }) => <article key={title}><div><Icon size={18} /></div><h3>{title}</h3><p>{text}</p></article>)}</div></section><section className="providers">
          <div className="section-label"><span /> DOWNLOAD FROM <span /></div>
          <h2>Choose your provider.</h2>
          <p>Same Aervyx build. Different mirrors, depending on what works best for you.</p>
          <div className="provider-grid">
            {DOWNLOAD_PROVIDER_LIST.map((provider) => (
              <a key={provider.name} className="provider-card" href={provider.url} target="_blank" rel="noopener noreferrer">
                <div className="provider-name">{provider.name}</div>
                <div className="provider-meta">{provider.url.startsWith('PLACEHOLDER') ? 'Placeholder link' : 'Available'}</div>
              </a>
            ))}
          </div>
        </section>
<section className="cta"><div><div className="eyebrow"><i /> READY WHEN YOU ARE</div><h2>Start building with Aervyx.</h2><p>Download the cleanest way to run your scripts.</p></div><a className="download-button" href={DOWNLOAD_URL}><ArrowDownToLine size={18} /> Download for Windows <span>→</span></a></section></main><footer><b><Terminal size={15} /> Aervyx</b><span>© 2026 Aervyx. All rights reserved.</span></footer><DiscordLink /></div>;
}
