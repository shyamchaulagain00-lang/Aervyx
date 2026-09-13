const fs = require('fs');
const asar = require('@electron/asar');

const asarPath = 'release/win-unpacked/resources/app.asar';
const outPath = 'C:/Temp/aervyx-asar-list.txt';

try {
  if (!fs.existsSync(asarPath)) {
    fs.writeFileSync(outPath, 'NO_ASAR_PATH\n' + asarPath + '\n');
    process.exit(1);
  }
  const files = asar.listPackage(asarPath, {});
  const lines = files.map(f => f).sort();
  const text = lines.join('\n');
  fs.writeFileSync(outPath, text + '\n');
  console.log('ASAR_LINES', lines.length);
  console.log('FIRST_LINES');
  console.log(lines.slice(0, 120).join('\n'));
} catch (err) {
  fs.writeFileSync(outPath, 'ASAR_LIST_ERROR\n' + String(err) + '\n');
  console.error('ASAR_LIST_ERROR', String(err));
  process.exit(1);
}
