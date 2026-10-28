import fs from 'fs';
import path from 'path';

/**
 * Reads backend/.env (KEY=value per line) into process.env. Real environment variables win.
 * Looks next to package.json whichever folder the app was started from, and tells you what it found.
 */
const here = typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..') : process.cwd();
const folders = [...new Set([process.cwd(), path.join(process.cwd(), 'backend'), here])];
const names = ['.env', '.env.txt']; // Windows Notepad likes to add .txt

let loaded = '';
for (const dir of folders) {
  for (const name of names) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); // Notepad may add a BOM
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.replace(/^export\s+/, '').match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
    loaded = file;
    break;
  }
  if (loaded) break;
}
console.log(loaded ? `Loaded settings from ${loaded}` : `No .env file found. Looked in: ${folders.join(' | ')}`);
