const asar = require('@electron/asar');
const path = require('path');
const fs = require('fs');

const asarFile = path.join(__dirname, '..', 'release2', 'win-unpacked', 'resources', 'app.asar');

async function main() {
  const targets = [
    'dist/index.html',
    'dist-electron/main.cjs',
    'dist-electron/preload.cjs',
    'package.json',
  ];

  for (const target of targets) {
    try {
      // Use extractFile which returns a {path} object pointing to a temp file
      const info = await asar.extractFile(asarFile, target);
      console.log(`extractFile ${target} ->`, info);
      if (info && info.path) {
        const content = fs.readFileSync(info.path, 'utf8');
        const outName = target.replace(/\//g, '_') + '_extracted.txt';
        const outPath = path.join(__dirname, outName);
        fs.writeFileSync(outPath, content);
        console.log(`  wrote ${content.length} bytes to ${outPath}`);
      }
    } catch (e) {
      console.error(`Error extracting ${target}: ${e.message}`);
    }
  }
}

main();
