'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const frontend = path.resolve(__dirname, '..');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function fixture(file = 'pages/units.html', hiddenForm = false) {
  const dom = new JSDOM(fs.readFileSync(path.join(frontend, file), 'utf8'), { url: 'https://test.invalid/', runScripts: 'outside-only' });
  const { window } = dom;
  // DOM-only tests do not execute api.js, obtain real auth, call the network, or touch the shared database.
  const prototype = window.HTMLDialogElement.prototype;
  if (!prototype.showModal) prototype.showModal = function () { this.open = true; };
  if (!prototype.close) prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
  window.Orbia = {
    ready: Promise.resolve(),
    node(tag, className, text) { const element = window.document.createElement(tag); if (className) element.className = className; if (text != null) element.textContent = text; return element; },
    money(value) { return `R$ ${value}`; }, date(value) { return value; }
  };
  if (hiddenForm) window.document.getElementById('unit-form').hidden = true;
  window.eval(fs.readFileSync(path.join(frontend, 'js/flows.js'), 'utf8'));
  await tick();
  return dom;
}

function setupUnit(dom) {
  const doc = dom.window.document;
  const form = doc.getElementById('unit-form');
  const launch = doc.querySelector('[data-flow-open="unit-form"]');
  launch.click();
  return { doc, form, launch, dialog: doc.getElementById('dialog-unit-form'), next: doc.querySelector('#dialog-unit-form .flow-next') };
}

test('avançar e Enter não disparam submit de domínio antes da revisão final', async () => {
  const dom = await fixture();
  try {
    const { form, next, dialog } = setupUnit(dom);
    let writes = 0;
    form.addEventListener('submit', (event) => { event.preventDefault(); writes++; });
    next.click();
    assert.equal(writes, 0);
    assert.match(dialog.querySelector('.flow-feedback').textContent, /Confira/);
    form.elements.label.value = 'Casa teste DOM';
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(writes, 0);
    assert.match(dialog.querySelector('.flow-title').textContent, /contatar/);
    next.click();
    assert.equal(writes, 0);
    assert.match(dialog.querySelector('.flow-title').textContent, /Confira antes/);
    next.click();
    assert.equal(writes, 1);
  } finally { dom.window.close(); }
});

test('revisão permite editar e preserva campos de todas as etapas no FormData', async () => {
  const dom = await fixture();
  try {
    const { doc, form, next, dialog } = setupUnit(dom);
    form.elements.label.value = 'Apto DOM'; form.elements.block.value = 'A';
    next.click();
    form.elements.residentName.value = 'Contato DOM'; form.elements.email.value = 'dom@example.invalid';
    next.click();
    const row = [...dialog.querySelectorAll('.flow-review-row')].find((el) => el.textContent.includes('Identificação'));
    row.click();
    assert.equal(form.elements.label.value, 'Apto DOM');
    form.elements.label.value = 'Apto DOM editado';
    next.click(); next.click();
    const data = new dom.window.FormData(form);
    assert.equal(data.get('label'), 'Apto DOM editado');
    assert.equal(data.get('residentName'), 'Contato DOM');
    assert.equal(data.get('email'), 'dom@example.invalid');
    dialog.querySelector('.flow-close').click(); await tick();
    assert.equal(form.closest('dialog'), null);
    assert.equal(form.elements.label.value, 'Apto DOM editado');
    doc.querySelector('[data-flow-open="unit-form"]').click();
    assert.equal(form.closest('dialog').open, true);
  } finally { dom.window.close(); }
});

test('reset após salvamento gera sucesso e fechar restaura formulário e foco', async () => {
  const dom = await fixture();
  try {
    const { form, next, dialog, launch } = setupUnit(dom);
    form.elements.label.value = 'DOM'; next.click(); next.click();
    form.addEventListener('submit', (event) => { event.preventDefault(); form.reset(); });
    next.click(); await tick();
    assert.match(dialog.querySelector('.flow-title').textContent, /Registro salvo/);
    assert.equal(next.textContent, 'Voltar ao aplicativo');
    next.click(); await tick();
    assert.equal(dialog.open, false);
    assert.equal(dom.window.document.activeElement, launch);
    assert.equal(form.classList.contains('flow-park'), true);
  } finally { dom.window.close(); }
});

test('formulário hidden por permissão não pode ser aberto pelo CTA', async () => {
  const dom = await fixture('pages/units.html', true);
  try {
    const launch = dom.window.document.querySelector('[data-flow-open="unit-form"]');
    assert.equal(launch.hidden, true);
    launch.click();
    assert.equal(dom.window.document.getElementById('dialog-unit-form').open, false);
  } finally { dom.window.close(); }
});

test('erro de registro aparece dentro do modal sem apagar as informações', async () => {
  const dom = await fixture();
  try {
    const { form, dialog } = setupUnit(dom);
    form.elements.label.value = 'Mantido';
    dom.window.document.dispatchEvent(new dom.window.CustomEvent('orbia:feedback', { detail: { type: 'error', message: 'Falha transitória de registro' } }));
    assert.equal(dialog.querySelector('.flow-feedback').hidden, false);
    assert.equal(form.elements.label.value, 'Mantido');
    assert.match(dialog.querySelector('.flow-feedback').textContent, /Falha transitória/);
  } finally { dom.window.close(); }
});

test('pagamento exige rateio válido, mantém valor original e não usa float', async () => {
  const dom = await fixture('pages/financial.html');
  try {
    const { document: doc } = dom.window;
    const form = doc.getElementById('payment-form');
    const row = doc.createElement('div'); row.className = 'allocation-row';
    const fund = doc.createElement('select'); fund.className = 'allocation-fund';
    const option = doc.createElement('option'); option.value = 'fund-dom'; option.textContent = 'Fundo DOM'; fund.append(option);
    const month = doc.createElement('input'); month.className = 'allocation-month'; month.type = 'month'; month.value = '2026-11';
    const amount = doc.createElement('input'); amount.type = 'number'; amount.step = '0.01'; amount.className = 'allocation-amount'; amount.value = '100.11';
    row.append(fund, month, amount); doc.getElementById('allocation-list').append(row);
    doc.querySelector('[data-flow-open="payment-form"]').click();
    const dialog = doc.getElementById('dialog-payment-form'); const next = dialog.querySelector('.flow-next');
    form.elements.amount.value = '100.10'; form.elements.receivedAt.value = '2026-11-19'; next.click(); next.click(); next.click();
    assert.match(dialog.querySelector('.flow-feedback').textContent, /soma das alocações/);
    amount.value = '100.10'; next.click();
    assert.match(dialog.querySelector('.flow-title').textContent, /Confira antes/);
    assert.equal(new dom.window.FormData(form).get('amount'), '100.10');
  } finally { dom.window.close(); }
});

test('abas de operação mantêm apenas a lista selecionada e revelam seu CTA autorizado', async () => {
  const dom = await fixture('pages/operations.html');
  try {
    dom.window.Orbia.state = { tenant: { role: 'admin' } };
    dom.window.eval(fs.readFileSync(path.join(frontend, 'js/page-ui.js'), 'utf8'));
    await tick();
    const doc = dom.window.document;
    assert.equal(doc.querySelector('[data-module="occurrence-form"]').hidden, false);
    assert.equal(doc.querySelector('[data-module="supplier-form"]').hidden, true);
    doc.querySelector('[data-module-target="supplier-form"]').click(); await tick();
    assert.equal(doc.querySelector('[data-module="supplier-form"]').hidden, false);
    assert.equal(doc.querySelector('[data-flow-open="supplier-form"]').hidden, false);
    doc.querySelector('[data-flow-open="supplier-form"]').click();
    assert.equal(doc.getElementById('dialog-supplier-form').open, true);
  } finally { dom.window.close(); }
});

test('POST aceito seguido de erro no refresh mantém sucesso e orienta não reenviar', async () => {
  const dom = await fixture();
  try {
    const { window } = dom;
    let posts = 0;
    window.Headers = Headers;
    window.fetch = async (url, options = {}) => {
      const response = (payload) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => payload });
      if (url === '/api/auth/me') return response({ user: { name: 'Teste isolado' }, tenants: [{ id: 'tenant-dom', name: 'DOM', role: 'admin' }], csrfToken: 'test-only' });
      if (url === '/api/units' && options.method === 'POST') { posts++; return response({ item: { id: 'unit-dom' } }); }
      if (url === '/api/units' && posts) throw new Error('Refresh indisponível');
      if (url === '/api/units') return response({ items: [] });
      throw new Error(`Requisição não prevista no teste: ${url}`);
    };
    window.eval(fs.readFileSync(path.join(frontend, 'js/api.js'), 'utf8'));
    await window.Orbia.ready;
    window.eval(fs.readFileSync(path.join(frontend, 'js/units.js'), 'utf8'));
    await tick();
    const { form, next, dialog } = setupUnit(dom);
    form.elements.label.value = 'DOM não persistido'; next.click(); next.click(); next.click();
    await tick(); await tick();
    assert.equal(posts, 1);
    assert.match(dialog.querySelector('.flow-title').textContent, /Registro salvo/);
    assert.equal(dialog.querySelector('.flow-feedback').hidden, true);
    const info = window.document.querySelector('.toast--info');
    assert.match(info.textContent, /não repita o envio/);
  } finally { dom.window.close(); }
});

test('alocação aberta durante carregamento recebe fundos sem precisar recriar linha', async () => {
  const dom = await fixture('pages/financial.html');
  try {
    const { window } = dom;
    let releaseFunds;
    window.Orbia.state = { tenant: { id: 'tenant-dom', role: 'admin' } };
    window.Orbia.api = async (url) => url === '/api/funds'
      ? new Promise((resolve) => { releaseFunds = resolve; })
      : { items: [] };
    window.eval(fs.readFileSync(path.join(frontend, 'js/financial.js'), 'utf8'));
    await tick();
    const doc = window.document;
    doc.querySelector('[data-flow-open="payment-form"]').click();
    const form = doc.getElementById('payment-form');
    const next = doc.querySelector('#dialog-payment-form .flow-next');
    form.elements.amount.value = '25.00'; form.elements.receivedAt.value = '2026-11-19';
    next.click(); next.click(); doc.getElementById('add-allocation').click();
    const select = form.querySelector('.allocation-fund');
    assert.equal(select.options.length, 1);
    releaseFunds({ items: [{ id: 'fund-dom', name: 'Fundo DOM', code: 'DOM', balance: '0.00' }] });
    await tick();
    assert.equal(select.options.length, 2);
    assert.equal(select.options[1].value, 'fund-dom');
    assert.equal(form.querySelectorAll('.allocation-row').length, 1);
  } finally { dom.window.close(); }
});
