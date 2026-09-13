const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx';
const asarCli = path.join(root, 'node_modules', '.bin', 'asar');
const asarFile = path.join(root, 'release2', 'win-unpacked', 'resources', 'app.asar');

// Extract specific files using asar CLI
const files = [
  'dist/index.html',
  'dist-electron/main.cjs',
  'dist-electron/preload.cjs',
  'package.json',
];

for (const f of files) {
  try {
    const output = execSync(`"${asarCli}" extract-file "${asarFile}" "${f}"`, { encoding: 'utf8' });
    const outPath = path.join(root, '_probe', f.replace(/\//g, '_') + '.txt');
    const outDir = path.dirname(outPath);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, output);
    console.log(`=== ${f} (${output.length} bytes) extracted to ${outPath} ===`);
  } catch (e) {
    console.error(`Failed to extract ${f}: ${e.message}`);
  }
}
