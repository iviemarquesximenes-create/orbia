'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function fixture({ ios = false, standalone = false } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'login.html'), 'utf8'), { url: 'https://orbia.test/login.html', runScripts: 'outside-only' });
  const { window } = dom;
  window.matchMedia = () => ({ matches: standalone, addEventListener() {} });
  Object.defineProperty(window, 'isSecureContext', { value: true });
  if (ios) Object.defineProperty(window.navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit Safari' });
  const calls = [];
  Object.defineProperty(window.navigator, 'serviceWorker', { value: { register: async (...args) => { calls.push(args); return {}; } } });
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
  if (window.document.readyState !== 'complete') await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
  window.eval(fs.readFileSync(path.join(root, 'js/pwa.js'), 'utf8'));
  await tick();
  return { dom, calls };
}

test('iPhone mostra guia de Compartilhar sem fingir prompt ou instalação', async () => {
  const { dom } = await fixture({ ios: true });
  try {
    const doc = dom.window.document;
    const button = doc.querySelector('[data-pwa-install]');
    button.click();
    assert.equal(doc.getElementById('pwa-install-dialog').open, true);
    assert.equal(doc.querySelector('[data-pwa-instructions="ios"]').hidden, false);
    assert.equal(doc.querySelector('[data-pwa-instructions="browser"]').hidden, true);
    assert.match(doc.querySelector('[data-pwa-instructions="ios"]').textContent, /Adicionar à Tela de Início/);
    assert.equal(button.hidden, false);
    doc.querySelector('[data-pwa-close]').click();
    assert.equal(doc.activeElement, button);
  } finally { dom.window.close(); }
});

test('modo standalone oculta instalação sem solicitar permissões extras', async () => {
  const { dom } = await fixture({ standalone: true });
  try {
    assert.equal(dom.window.document.querySelector('[data-pwa-install]').hidden, true);
    assert.equal(dom.window.document.querySelector('[data-pwa-install-card]').hidden, true);
    assert.equal(dom.window.document.documentElement.classList.contains('pwa-standalone'), true);
  } finally { dom.window.close(); }
});

test('prompt nativo somente ocorre após clique e recusa não é tratada como instalação', async () => {
  const { dom } = await fixture();
  try {
    const { window } = dom;
    const event = new window.Event('beforeinstallprompt', { cancelable: true });
    let prompts = 0;
    event.prompt = async () => { prompts++; };
    event.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(prompts, 0);
    const button = window.document.querySelector('[data-pwa-install]');
    button.click(); await tick();
    assert.equal(prompts, 1);
    assert.equal(button.hidden, false);
    assert.match(window.document.querySelector('[data-pwa-status]').textContent, /não concluída/);
    button.click();
    assert.equal(prompts, 1, 'evento de prompt é consumível somente uma vez');
  } finally { dom.window.close(); }
});

test('registro usa worker raiz, escopo raiz e atualização sem cache HTTP', async () => {
  const { dom, calls } = await fixture();
  try {
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '/sw.js');
    assert.equal(calls[0][1].scope, '/');
    assert.equal(calls[0][1].updateViaCache, 'none');
  } finally { dom.window.close(); }
});

test('appinstalled esconde a oferta sem instalar de novo ou recarregar formulários', async () => {
  const { dom } = await fixture();
  try {
    dom.window.dispatchEvent(new dom.window.Event('appinstalled'));
    assert.equal(dom.window.document.querySelector('[data-pwa-install]').hidden, true);
  } finally { dom.window.close(); }
});
