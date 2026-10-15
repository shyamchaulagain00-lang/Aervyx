import { useEffect, useRef } from 'react';
import { ArrowDown, Check, FileDown } from 'lucide-react';
import './App.css';

// Root-relative so the same URL works on Vercel previews and aervyx.com.
const DOWNLOAD_URL = '/downloads/Aervyx.exe';
const DISCORD_URL = 'https://discord.gg/M7pD8FnSe';

const FILE_INFO = [
  { label: 'Product', value: 'Aervyx Executor' },
  { label: 'Version', value: '1.0.0' },
  { label: 'File', value: 'Aervyx.exe' },
  { label: 'Platform', value: 'Windows' },
  { label: 'Type', value: 'Windows application (.exe)' },
] as const;

const INSTALL_STEPS = [
  {
    title: 'Download Aervyx.exe',
    text: 'Download the Aervyx Windows application directly.',
  },
  {
    title: 'Run Aervyx.exe',
    text: 'Open the downloaded application to get started.',
  },
] as const;

function DiscordButton() {
  return (
    <a
      className="discord-button"
      href={DISCORD_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Join our Discord"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 127.14 96.36"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
      </svg>
      <span>Join Discord</span>
    </a>
  );
}

// Center-page showcase image. With a mouse the frame gently tilts and follows
// the cursor (rAF-throttled, smooth CSS transitions, eases back on leave).
// On touch devices (no hover) it floats instead.
function ShowcaseImage() {
  const frameRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  function handleMove(event: React.PointerEvent<HTMLDivElement>) {
    const frame = frameRef.current;
    if (!frame || event.pointerType === 'touch') return;
    const rect = frame.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      frame.style.setProperty('--tilt-x', `${(-py * 6).toFixed(2)}deg`);
      frame.style.setProperty('--tilt-y', `${(px * 8).toFixed(2)}deg`);
      frame.style.setProperty('--shift-x', `${(px * 8).toFixed(1)}px`);
      frame.style.setProperty('--shift-y', `${(py * 8).toFixed(1)}px`);
      frame.classList.add('is-live');
    });
  }

  function handleLeave() {
    const frame = frameRef.current;
    if (!frame) return;
    cancelAnimationFrame(rafRef.current);
    frame.classList.remove('is-live');
    frame.style.setProperty('--tilt-x', '0deg');
    frame.style.setProperty('--tilt-y', '0deg');
    frame.style.setProperty('--shift-x', '0px');
    frame.style.setProperty('--shift-y', '0px');
  }

  return (
    <section className="showcase" id="showcase">
      <div className="showcase-kicker">
        <span />
        AERVYX IN ACTION
        <span />
      </div>
      <h2 className="showcase-title">See the workspace.</h2>
      <div
        ref={frameRef}
        className="showcase-frame"
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        onPointerOut={handleLeave}
      >
        <img
          src="/aervyx-showcase.jpg"
          alt="Aervyx Executor workspace"
          draggable={false}
          loading="lazy"
          decoding="async"
        />
      </div>
      <p className="showcase-caption">Dark. Focused. Built for momentum.</p>
    </section>
  );
}

export default function App() {
  return (
    <div className="site">
      <div className="bg-grid" aria-hidden="true" />
      <div className="glow glow-hero" aria-hidden="true" />
      <div className="glow glow-accent" aria-hidden="true" />

      <header className="nav">
        <a className="brand" href="#top" aria-label="Aervyx home">
          <img src="/aervyx-logo.png" alt="Aervyx" />
          <span>Aervyx.com</span>
        </a>
        <div className="nav-actions">
          <DiscordButton />
          <a className="nav-button" href={DOWNLOAD_URL}>
            <ArrowDown size={15} />
            Download
          </a>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="dot" aria-hidden="true" />
              AERVYX EXECUTOR · v1.0.0
            </div>

            <h1>AERVYX</h1>
            <p className="subtitle">Your powerful desktop experience.</p>
            <p className="description">
              Aervyx is a polished desktop experience for Windows — download
              Aervyx.exe directly to get started.
            </p>

            <div className="download-cta">
              <a className="download-button" href={DOWNLOAD_URL}>
                <ArrowDown size={18} />
                Download Aervyx
              </a>
              <div className="button-meta">
                <span className="version">Executor Version: 1.0.0</span>
                <span className="platform">
                  <Check size={12} />
                  Windows • Aervyx.exe
                </span>
              </div>
            </div>

            <div className="info-card glass">
              {FILE_INFO.map((row) => (
                <div className="info-row" key={row.label}>
                  <span className="info-label">{row.label}</span>
                  <span className="info-value">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="visual-card glass">
              <div className="visual-chrome">
                <span />
                <span />
                <span />
              </div>
              <div className="visual-logo">
                <img src="/aervyx-logo.png" alt="" />
              </div>
              <div className="visual-name">Aervyx</div>
              <div className="visual-tag">Windows App</div>
              <div className="visual-file">
                <FileDown size={14} />
                <span>Aervyx.exe</span>
              </div>
              <div className="visual-bar">
                <span />
              </div>
            </div>
          </div>
        </section>

        <ShowcaseImage />

        <section className="install">
          <h2>Simple installation</h2>
          <p className="install-sub">
            Two steps from download to ready.
          </p>
          <ol className="install-steps">
            {INSTALL_STEPS.map((step, index) => (
              <li className="glass" key={step.title}>
                <span className="step-number">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="footer">
        <span>© 2026 Aervyx</span>
        <span className="owner">Developer Owner: wtzx</span>
      </footer>
    </div>
  );
}
