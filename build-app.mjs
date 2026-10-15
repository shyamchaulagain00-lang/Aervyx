import { writeFileSync } from 'fs';

const part1 = `import { useState } from 'react';
import './index.css';

const DOWNLOAD_URL = '/Aervyx-v1.0.0.zip';

const previewCode = [
  '-- Aervyx Showcase Script',
  '-- Fast • Keyless • Reliable',
  '',
  'local Aervyx = {',
  '    Version = "1.0.0",',
  '    Author = "wtzx",',
  '    Status = "Ready"',
  '}',
  '',
  'function Aervyx:Init()',
  '    print("AERVYX EXECUTOR")',
  '    print("Version: " .. self.Version)',
  '    print("Loaded successfully!")',
  'end',
];

const scriptHubCards = [
  { title: 'Infinite Yield', game: 'Universal', views: '2.4M', tag: 'Keyless', tagColor: 'rgba(103, 203, 155, 0.15)', tagTextColor: '#67cb9b' },
  { title: 'Dark Dex V4', game: 'Universal', views: '1.8M', tag: 'Verified', tagColor: 'rgba(155, 108, 255, 0.15)', tagTextColor: '#b99bff' },
  { title: 'Remote Spy', game: 'Universal', views: '1.2M', tag: 'Updated', tagColor: 'rgba(104, 157, 255, 0.15)', tagTextColor: '#689dff' },
];

function ExecutorPreview() {
  return (
    <div className="preview-window" aria-label="Aervyx Executor preview">
      <div className="preview-sidebar">
        <div className="preview-brand">
          <img src="/aervyx-logo.png" alt="Aervyx" />
          <strong>Aervyx</strong>
        </div>
        <div className="preview-nav-label">WORKSPACE</div>
        <div className="preview-nav active"><span>\\u2B21</span> Executor <i /></div>
        <div className="preview-nav"><span>\\uD83D\\uDCD6</span> ScriptHub</div>
        <div className="preview-nav"><span>\\u2699</span> Settings</div>
        <div className="preview-runtime">
          <span>\\u26A1</span>
          <span>Lua runtime<small>Embedded &amp; sandboxed</small></span>
        </div>
      </div>
      <div className="preview-main">
        <div className="preview-topbar">
          <div><small>AERVYX / EXECUTOR</small><strong>Script Executor</strong></div>
          <div className="preview-window-actions"><span>\\u2212</span><span>\\u25A1</span><span>\\u00D7</span></div>
        </div>
        <div className="preview-tabs">
          <span><i /> Script 1 <b>\\u00D7</b></span>
          <button>+</button>
        </div>
        <div className="preview-toolbar">
          <button className="preview-execute">\\u25B6 Execute</button>
          <span>\\u2298 Clear</span><span>\\u25A0 Stop</span><div />
          <span>\\uD83D\\uDCC2 Open</span><span>\\uD83D\\uDD0D Lua 5.3</span>
        </div>
        <div className="preview-editor">
          <div className="preview-lines">
            {previewCode.map((_, i) => <span key={i}>{i + 1}</span>)}
          </div>
          <pre>
            {previewCode.map((line, i) => (
              <code key={\\\`\\\${line}-\\\${i}\\\`} className={i < 2 ? 'comment' : i === 3 || i === 9 ? 'keyword' : ''}>
                {line || ' '}{'\\n'}
              </code>
            ))}
          </pre>
        </div>
        <div className="preview-console">
          <div className="preview-console-tabs">
            <strong>Output <em>1</em></strong>
            <span>Console</span>
            <span>Errors <em>0</em></span>
            <span>Warnings <em>0</em></span>
            <i>Clear Console \\u00B7 Copy Output</i>
          </div>
          <div className="preview-output"><b>\\u203A</b> Aervyx runtime ready.</div>
        </div>
      </div>
    </div>
  );
}

function ScriptHubCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[1180px] mx-auto">
      {scriptHubCards.map((card) => (
        <div className="scripthub-card" key={card.title}>
          <div className="scripthub-card-img">
            <span className="text-4xl relative z-10">\\uD83D\\uDCDC</span>
          </div>
          <div className="scripthub-card-body">
            <h4>{card.title}</h4>
            <p>{card.game}</p>
          </div>
          <div className="scripthub-card-footer">
            <span className="scripthub-tag" style={{ background: card.tagColor, color: card.tagTextColor }}>
              {card.tag}
            </span>
            <span className="scripthub-views">\\uD83D\\uDC41 {card.views}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

`;

writeFileSync('src/App.tsx', part1, 'utf8');
console.log('part1 written');
