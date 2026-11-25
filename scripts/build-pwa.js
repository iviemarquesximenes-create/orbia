'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const frontend = path.resolve(__dirname, '../frontend');

function preparePwa(routes) {
  const manifest = JSON.parse(fs.readFileSync(path.join(frontend, 'manifest.webmanifest'), 'utf8'));
  if (manifest.id !== '/' || manifest.scope !== '/' || manifest.start_url !== '/' || manifest.display !== 'standalone') throw new Error('Contrato de identidade/escopo PWA inválido.');
  for (const expected of ['192x192', '512x512']) {
    if (!manifest.icons.some((icon) => icon.sizes === expected && icon.purpose === 'any')) throw new Error(`Ícone PWA ausente: ${expected}`);
  }
  if (!manifest.icons.some((icon) => icon.purpose === 'maskable')) throw new Error('Ícone maskable ausente.');
  for (const icon of manifest.icons) {
    const target = path.resolve(frontend, `.${icon.src}`);
    if (!target.startsWith(frontend + path.sep)) throw new Error('Ícone fora do frontend.');
    const bytes = fs.readFileSync(target);
    const [width, height] = icon.sizes.split('x').map(Number);
    if (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height) throw new Error(`Tamanho PNG incorreto: ${icon.src}`);
  }
  for (const route of routes) {
    const html = fs.readFileSync(path.join(frontend, route.path === '/' ? 'index.html' : route.path.slice(1)), 'utf8');
    const declarations = [...html.matchAll(/<link\b[^>]*>/gi)].filter(([tag]) => /\brel="manifest"/.test(tag));
    if (declarations.length !== 1 || !/\bhref="\/manifest.webmanifest"/.test(declarations[0][0])) throw new Error(`Manifesto inconsistente: ${route.path}`);
    if (!html.includes('apple-mobile-web-app-capable') || !html.includes('apple-touch-icon')) throw new Error(`Metadados Apple ausentes: ${route.path}`);
  }
  const workerPath = path.join(frontend, 'sw.js');
  const worker = fs.readFileSync(workerPath, 'utf8');
  const versionPattern = /const CACHE_NAME = 'orbia-public-[a-z0-9]+';/;
  if (!versionPattern.test(worker)) throw new Error('Marcador de versão do worker ausente.');
  const hash = createHash('sha256').update(worker.replace(versionPattern, "const CACHE_NAME = 'orbia-public-version';"));
  for (const resource of ['offline.html', 'css/offline.css', 'assets/pwa/icon-192.png']) {
    hash.update(resource).update(fs.readFileSync(path.join(frontend, resource)));
  }
  const version = hash.digest('hex').slice(0, 16);
  const versioned = worker.replace(versionPattern, `const CACHE_NAME = 'orbia-public-${version}';`);
  if (versioned !== worker) fs.writeFileSync(workerPath, versioned);
  return version;
}

module.exports = { preparePwa };
