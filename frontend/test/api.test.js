'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');

test('falha na inicialização substitui placeholders de carregamento por estado indisponível', async () => {
  const dom = new JSDOM(`
    <div id="global-error" hidden></div>
    <strong class="tenant-name">Carregando…</strong>
    <span class="role-label">carregando</span>
    <span class="current-user">Usuário</span>
    <select class="tenant-select"><option>Carregando…</option></select>
    <div class="empty-inline">Carregando fundos…</div>
    <div class="empty-state"><p>Carregando fila…</p></div>
    <table><tbody><tr><td class="table-empty">Carregando pagamentos…</td></tr></tbody></table>
  `, { url: 'https://orbia.test/', runScripts: 'outside-only' });

  try {
    const { window } = dom;
    window.Headers = Headers;
    window.fetch = async () => ({
      ok: false,
      status: 503,
      headers: { get: () => 'application/json' },
      json: async () => ({
        error: {
          code: 'DATABASE_CONFIGURATION_INVALID',
          message: 'A configuração DATABASE_URL é inválida.'
        }
      })
    });
    window.eval(fs.readFileSync(path.join(root, 'js/api.js'), 'utf8'));
    await window.Orbia.ready.catch(() => {});

    assert.equal(window.document.querySelector('.tenant-name').textContent, 'Condomínio indisponível');
    assert.equal(window.document.querySelector('.role-label').textContent, 'Perfil indisponível');
    assert.equal(window.document.querySelector('.current-user').textContent, 'Perfil indisponível');
    assert.equal(window.document.querySelector('.tenant-select').disabled, true);
    assert.equal(window.document.querySelector('.empty-inline').textContent, 'Não foi possível carregar os dados.');
    assert.equal(window.document.querySelector('.empty-state').textContent, 'Não foi possível carregar os dados.');
    assert.equal(window.document.querySelector('.table-empty').textContent, 'Não foi possível carregar os dados.');
    assert.match(window.document.getElementById('global-error').textContent, /DATABASE_URL/);
  } finally {
    dom.window.close();
  }
});
