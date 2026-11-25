'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const frontend = path.resolve(__dirname, '../frontend');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function resourceHash(resource) {
  const target = path.join(frontend, resource.slice(1));
  if (!fs.existsSync(target)) throw new Error(`Asset ausente: ${resource}`);
  return createHash('sha256').update(fs.readFileSync(target)).digest('hex').slice(0, 12);
}

function versionAssets() {
  let count = 0;
  const sprite = '/assets/orbia-icons.svg';
  const spriteVersion = resourceHash(sprite);
  // Injected SVG uses need the same content version as static HTML uses.
  const shell = path.join(frontend, 'js/app-shell.js');
  const shellOriginal = fs.readFileSync(shell, 'utf8');
  const shellUpdated = shellOriginal.replace(/\/assets\/orbia-icons\.svg(?:\?v=[a-f0-9]+)?#/g, `${sprite}?v=${spriteVersion}#`);
  if (shellOriginal !== shellUpdated) fs.writeFileSync(shell, shellUpdated);
  for (const file of walk(frontend).filter((name) => name.endsWith('.html'))) {
    const original = fs.readFileSync(file, 'utf8');
    const updated = original.replace(/(\b(?:src|href)=")((?:\/css\/|\/js\/|\/assets\/pwa\/)[^"?#]+|\/assets\/orbia-icons\.svg)(?:\?v=[a-f0-9]+)?(#[^"\s]*)?(")/g, (match, prefix, resource, fragment = '', suffix) => {
      count++;
      return `${prefix}${resource}?v=${resourceHash(resource)}${fragment}${suffix}`;
    });
    if (updated !== original) fs.writeFileSync(file, updated);
  }
  return count;
}

if (require.main === module) console.log(`URLs versionadas por conteúdo: ${versionAssets()}`);
module.exports = { versionAssets };
