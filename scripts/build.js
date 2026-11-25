'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'frontend');
const { versionAssets } = require('./version-assets');
versionAssets();
const manifest = JSON.parse(fs.readFileSync(path.join(frontend, 'manus-routes.json'), 'utf8'));
if (!Array.isArray(manifest.routes) || !manifest.routes.some((route) => route.path === '/')) throw new Error('O manifesto precisa incluir / e uma lista routes válida.');
for (const route of manifest.routes) {
  if (!route.path.startsWith('/') || /[\s\0]/.test(route.path)) throw new Error(`Rota inválida: ${route.path}`);
  const file = path.join(frontend, route.path === '/' ? 'index.html' : route.path.replace(/^\//, ''));
  if (!fs.existsSync(file)) throw new Error(`Arquivo ausente para ${route.path}`);
  const html = fs.readFileSync(file, 'utf8');
  if (/<style\b|\sstyle\s*=|\son[a-z]+\s*=/i.test(html)) throw new Error(`CSS ou evento inline encontrado em ${route.path}`);
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(script[1]) || script[2].trim()) throw new Error(`Código inline encontrado em ${route.path}`);
  }
  for (const ref of html.matchAll(/(?:src|href)="(\/(?:css|js)\/[^"?#]+)(?:\?[^"#]*)?"/g)) {
    if (!fs.existsSync(path.join(frontend, ref[1].slice(1)))) throw new Error(`Dependência local ausente: ${ref[1]}`);
  }
}
const { preparePwa } = require('./build-pwa');
preparePwa(manifest.routes);
execFileSync(process.execPath, [path.join(__dirname, 'check.js')], { stdio: 'inherit' });
const vercelPublicDirectory = path.join(root, 'public');
fs.mkdirSync(vercelPublicDirectory, { recursive: true });
for (const entry of ['assets', 'css', 'js', 'pages', 'index.html', 'login.html', 'manifest.webmanifest', 'manus-routes.json', 'offline.html', 'sw.js']) {
  fs.cpSync(path.join(frontend, entry), path.join(vercelPublicDirectory, entry), { recursive: true, force: true });
}
process.stdout.write('Build concluído: rotas e dependências válidas; HTML, CSS, JavaScript e API separados.\n');
