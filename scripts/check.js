'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['node_modules', '.git']);
const jsFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.isFile() && fullPath.endsWith('.js')) jsFiles.push(fullPath);
  }
}
walk(path.join(root, 'backend'));
walk(path.join(root, 'frontend'));
for (const file of jsFiles) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
process.stdout.write(`Sintaxe JavaScript válida em ${jsFiles.length} arquivo(s).\n`);
