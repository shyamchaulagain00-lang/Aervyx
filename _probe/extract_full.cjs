const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

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
  const result = {
    exitCode: code,
    stdout: stdout.substring(0, 1000),
    stderr: stderr.substring(0, 1000),
    keyFiles: {}
  };
  
  const keyFiles = [
    'dist/index.html',
    'dist-electron/main.cjs',
    'dist-electron/preload.cjs',
  ];
  keyFiles.forEach(f => {
    const fullPath = path.join(outDir, f);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      result.keyFiles[f] = {
        exists: true,
        size: content.length,
        content: content
      };
    } else {
      result.keyFiles[f] = { exists: false };
    }
  });
  
  fs.writeFileSync(path.join(__dirname, 'extract_result.json'), JSON.stringify(result, null, 2));
  console.log('Done - result written to extract_result.json');
});

