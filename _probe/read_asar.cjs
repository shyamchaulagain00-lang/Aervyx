const asar = require('@electron/asar');
const path = require('path');
const fs = require('fs');

const asarFile = path.join(__dirname, '..', 'release2', 'win-unpacked', 'resources', 'app.asar');

async function readAsarFile(relativePath) {
  const fullPath = asarFile + '!' + path.sep + relativePath;
  const info = asar.statFile(fullPath);
  if (!info) {
    console.log(`NOT FOUND: ${relativePath}`);
    return;
  }
  const buf = await asar.readFile(fullPath);
  return buf;
}

async function main() {
  const targets = [
    'dist/index.html',
    'dist-electron/main.cjs',
    'dist-electron/preload.cjs',
    'package.json',
  ];

  for (const target of targets) {
    try {
      const buf = await readAsarFile(target);
      if (buf) {
        const outPath = path.join(__dirname, target.replace(/\//g, '_') + '.txt');
        fs.writeFileSync(outPath, buf);
        console.log(`=== ${target} (${buf.length} bytes) -> ${outPath} ===`);
      }
    } catch (e) {
      console.error(`Error reading ${target}: ${e.message}`);
    }
  }
}

main();
