const fs = require('fs');
const p = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\src\\Landing.tsx';
let s = fs.readFileSync(p, 'utf8');

// Ensure provider import exists
if (!s.includes('DOWNLOAD_PROVIDER_LIST')) {
  const oldImport =
    "import { Activity, BookOpen, Code2, Discord, FilePlus2, FolderOpen, Play, Search, Settings2, Zap } from 'lucide-react';";
  const newImport =
    oldImport +
    "\nimport { DOWNLOAD_PROVIDER_LIST } from './download-providers';";
  if (s.includes(oldImport)) {
    s = s.replace(oldImport, newImport);
    fs.writeFileSync(p, s, 'utf8');
    console.log('import added');
  } else {
    console.log('base import not found');
  }
} else {
  console.log('import already present');
}
