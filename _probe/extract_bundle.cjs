const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const asarCli = path.join(root, 'node_modules', '.bin', 'asar');
const asarFile = path.join(root, 'release2', 'win-unpacked', 'resources', 'app.asar');
const outFile = path.join(__dirname, 'bundle_extract.js');

try {
  const output = execFileSync(asarCli, ['extract-file', asarFile, 'dist/assets/index-WKE99xiI.js'], { encoding: null });
  fs.writeFileSync(outFile, output);
  console.log('Extracted', output.length, 'bytes to', outFile);
  // Show first 2000 chars
  console.log('=== First 2000 chars ===');
  console.log(output.toString('utf8', 0, Math.min(2000, output.length)));
  console.log('=== Last 1000 chars ===');
  console.log(output.toString('utf8', Math.max(0, output.length - 1000)));
} catch (e) {
  console.error('Error:', e.message);
}
