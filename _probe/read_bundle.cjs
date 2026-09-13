// Use @electron/asar to get file info, then manually read from the archive
const asar = require('@electron/asar');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const asarFile = path.join(root, 'release2', 'win-unpacked', 'resources', 'app.asar');

async function main() {
  // List all entries
  const files = asar.listPackage(asarFile);
  console.log('Total entries:', files.length);
  
  // Find the JS bundle
  const jsBundle = files.find(f => f.includes('assets/index-') && f.endsWith('.js'));
  console.log('JS Bundle:', jsBundle);
  
  // Find all index.html files
  const indexHtmls = files.filter(f => f.endsWith('index.html'));
  console.log('index.html files:', JSON.stringify(indexHtmls));
  
  // Find all assets files
  const assets = files.filter(f => f.includes('assets/'));
  console.log('Assets:');
  assets.forEach(a => console.log(' ', a));
  
  // Try to stat the JS bundle
  try {
    const stat = asar.statFile(asarFile + '!' + jsBundle);
    console.log('Stat for JS bundle:', JSON.stringify(stat));
  } catch(e) {
    console.log('statFile error:', e.message);
  }
  
  // Try extractFile with the asarFile as base
  try {
    const result = await asar.extractFile(asarFile, jsBundle);
    console.log('extractFile result:', result);
    if (result && result.path) {
      const content = fs.readFileSync(result.path, 'utf8');
      console.log('Content length:', content.length);
      console.log('First 500 chars:', content.substring(0, 500));
      console.log('Last 500 chars:', content.substring(content.length - 500));
    }
  } catch(e) {
    console.log('extractFile error:', e.message);
  }
}

main().catch(e => console.error(e));
