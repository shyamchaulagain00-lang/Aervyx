import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

function showFatal(message: string) {
  const root = document.getElementById('root');
  if (root && root.children.length === 0) {
    const safe = message.replace(/</g, '&lt;');
    root.innerHTML = '<div style="padding:32px;font-family:sans-serif;color:#e5e8f0;background:#08090d;height:100vh"><h2>Aervyx failed to start</h2><pre style="white-space:pre-wrap;color:#ff9d9d">' + safe + '</pre></div>';
  }
}

window.addEventListener('error', (event) => {
  console.error('[aervyx-fatal]', event.error ?? event.message);
  showFatal(String(event.error?.stack ?? event.message ?? event.error));
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[aervyx-unhandled-rejection]', event.reason);
});

try {
  const el = document.getElementById('root');
  if (!el) throw new Error('#root element missing');
  createRoot(el).render(<React.StrictMode><App /></React.StrictMode>);
} catch (error) {
  console.error('[aervyx-mount-failed]', error);
  showFatal(error instanceof Error ? error.stack ?? error.message : String(error));
}