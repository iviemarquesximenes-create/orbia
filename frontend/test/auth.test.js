'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function fixture(supabaseResponse, authConfig = {
  provider: 'Supabase',
  configured: true,
  url: 'https://project.supabase.co',
  publishableKey: 'sb_publishable_test'
}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'login.html'), 'utf8'), {
    url: 'https://orbia.test/login.html',
    runScripts: 'outside-only'
  });
  const { window } = dom;
  const calls = [];
  window.fetch = async (input, options = {}) => {
    const url = String(input);
    calls.push({ url, options });
    if (url === '/api/auth/me') return { ok: false, status: 401, json: async () => ({}) };
    if (url === '/api/auth/config') return {
      ok: true,
      status: 200,
      json: async () => authConfig
    };
    return supabaseResponse(url, options);
  };
  window.eval(fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8'));
  await tick();
  await tick();
  return { dom, calls };
}

test('login Supabase apresenta formulário e alterna para criação de conta', async () => {
  const { dom } = await fixture(async () => ({ ok: false, status: 400, json: async () => ({ msg: 'Credenciais inválidas' }) }));
  try {
    const { document } = dom.window;
    assert.ok(document.querySelector('input[type="email"]'));
    assert.ok(document.querySelector('input[name="password"]'));
    assert.ok(document.getElementById('forgot-password'));
    assert.equal(document.querySelector('.login-app-symbol img').getAttribute('src'), '/assets/orbia-jade.webp');
    assert.doesNotMatch(document.body.textContent, /Manus/i);
    assert.equal(document.querySelector('input[name="password-confirmation"]').parentElement.hidden, true);
    document.querySelector('.login-auth-actions button').click();
    assert.equal(document.querySelector('input[name="password-confirmation"]').parentElement.hidden, false);
    assert.equal(document.querySelector('#login-button').textContent, 'Criar conta');
  } finally {
    dom.window.close();
  }
});

test('login por e-mail permanece visível sem configuração Supabase e não oferece Manus', async () => {
  const { dom, calls } = await fixture(
    async () => ({ ok: false, status: 400, json: async () => ({}) }),
    { provider: 'Supabase', configured: false }
  );
  try {
    const { document, Event } = dom.window;
    assert.ok(document.querySelector('form.login-form'));
    assert.ok(document.querySelector('input[type="email"]'));
    assert.ok(document.querySelector('input[name="password"]'));
    assert.match(document.getElementById('login-message').textContent, /não está configurado/);
    document.querySelector('form.login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    assert.equal(calls.some((call) => call.url.includes('/auth/v1/')), false);
    assert.doesNotMatch(document.body.textContent, /Manus/i);
  } finally {
    dom.window.close();
  }
});

test('login exibe erro retornado pelo Supabase sem criar sessão local', async () => {
  const { dom, calls } = await fixture(async () => ({
    ok: false,
    status: 400,
    json: async () => ({ msg: 'Credenciais inválidas' })
  }));
  try {
    const { document, Event } = dom.window;
    document.querySelector('input[type="email"]').value = 'morador@example.com';
    document.querySelector('input[name="password"]').value = 'senha-incorreta';
    document.querySelector('form.login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    await tick();
    assert.match(document.getElementById('login-message').textContent, /Credenciais inválidas/);
    assert.equal(calls.some((call) => call.url === '/api/auth/session'), false);
  } finally {
    dom.window.close();
  }
});

test('esqueci minha senha envia o e-mail ao fluxo de recuperação Supabase', async () => {
  const { dom, calls } = await fixture(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  try {
    const { document } = dom.window;
    document.querySelector('input[type="email"]').value = 'morador@example.com';
    document.getElementById('forgot-password').click();
    await tick();
    await tick();
    const recoveryCall = calls.find((call) => call.url.includes('/auth/v1/recover?'));
    assert.ok(recoveryCall);
    assert.deepEqual(JSON.parse(recoveryCall.options.body), { email: 'morador@example.com' });
    assert.match(document.getElementById('login-message').textContent, /receberá instruções/);
  } finally {
    dom.window.close();
  }
});
