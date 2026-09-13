const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const asarCli = path.join(root, 'node_modules', '.bin', 'asar');
const asarFile = path.join(root, 'release2', 'win-unpacked', 'resources', 'app.asar');
const outDir = path.join(root, '_probe_extract');

const child = spawn(asarCli, ['extract', asarFile, outDir], { stdio: 'pipe' });

let stdout = '';
let stderr = '';
child.stdout.on('data', d => stdout += d.toString());
child.stderr.on('data', d => stderr += d.toString());
child.on('close', code => {
  console.log('Exit code:', code);
  console.log('STDOUT:', stdout.substring(0, 500));
  console.log('STDERR:', stderr.substring(0, 500));
  
  // Check if key files exist
  const fs = require('fs');
  const keyFiles = [
    path.join(outDir, 'dist', 'index.html'),
    path.join(outDir, 'dist-electron', 'main.cjs'),
    path.join(outDir, 'dist-electron', 'preload.cjs'),
  ];
  keyFiles.forEach(f => {
    if (fs.existsSync(f)) {
      const content = fs.readFileSync(f, 'utf8');
      console.log(`\n=== ${f} (${content.length} bytes) ===`);
      if (f.endsWith('.html') || f.endsWith('.cjs')) {
        console.log(content);
      }
    } else {
      console.log(`MISSING: ${f}`);
    }
  });
});
