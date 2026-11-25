'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../../index');
const { config } = require('../src/lib/config');
let server;
let base;
before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => new Promise((resolve) => server.close(resolve)));

test('HTML, CSS, JS e manifesto são públicos sem expor dados', async () => {
  for (const path of ['/', '/login.html', '/pages/financial.html', '/assets/orbia-jade.webp', '/css/orbia.css', '/js/api.js']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
  }
  const response = await fetch(base + '/manus-routes.json');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  const body = await response.json();
  assert.ok(body.routes.some((r) => r.path === '/'));
  assert.ok(body.routes.some((r) => r.path === '/login.html'));
});

test('configuração pública de autenticação divulga somente a chave Supabase publicável', async () => {
  const response = await fetch(base + '/api/auth/config');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.provider, 'Supabase');
  assert.equal(body.configured, config.isSupabaseAuthConfigured());
  if (config.isSupabaseAuthConfigured()) {
    assert.equal(body.provider, 'Supabase');
    assert.equal(body.url, config.supabaseUrl);
    assert.equal(body.publishableKey, config.supabasePublishableKey);
    assert.equal(Object.keys(body).some((key) => /secret|service.role/i.test(key)), false);
  }
});

test('sessão de autenticação rejeita payload vazio ou configuração ausente sem criar sessão', async () => {
  const response = await fetch(base + '/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  assert.equal(response.status, config.isSupabaseAuthConfigured() ? 400 : 503);
  assert.equal((await response.json()).error.code, config.isSupabaseAuthConfigured() ? 'INVALID_AUTH_SESSION' : 'AUTH_NOT_CONFIGURED');
});

test('todos os módulos de domínio recusam sessão ausente', async () => {
  for (const path of ['/api/tenants', '/api/units', '/api/dashboard', '/api/funds', '/api/payments', '/api/expenses', '/api/suppliers', '/api/maintenance', '/api/quotes', '/api/occurrences', '/api/announcements', '/api/review', '/api/integrations']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 401, path);
    assert.equal((await response.json()).error.code, 'UNAUTHENTICATED', path);
  }
});

test('webhook não é bloqueado pelo login e falha fechado sem credencial', async () => {
  const wrongMethod = await fetch(base + '/api/integrations/evolution/events');
  assert.equal(wrongMethod.status, 405);
  const post = await fetch(base + '/api/integrations/evolution/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(post.status, config.isN8nInboundConfigured() ? 401 : 503);
});

test('callback sem state vinculado falha fechado e rota desconhecida retorna 404', async () => {
  const response = await fetch(base + '/auth/callback', { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/login.html?error=invalid_state');
  assert.equal((await fetch(base + '/pagina-inexistente')).status, 404);
  assert.equal((await fetch(base + '/api/inexistente')).status, 404);
});

test('recursos PWA públicos têm manifesto único, MIME e revalidação corretos', async () => {
  const manifest = await fetch(base + '/manifest.webmanifest');
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get('content-type'), /application\/manifest\+json/);
  assert.match(manifest.headers.get('cache-control'), /no-cache/);
  const data = await manifest.json();
  assert.equal(data.id, '/');
  assert.equal(data.start_url, '/');
  assert.equal(data.scope, '/');
  assert.equal(data.display, 'standalone');
  for (const icon of data.icons) {
    const response = await fetch(base + icon.src);
    assert.equal(response.status, 200, icon.src);
    assert.match(response.headers.get('content-type'), /image\/png/);
    const bytes = Buffer.from(await response.arrayBuffer());
    const [width, height] = icon.sizes.split('x').map(Number);
    assert.equal(bytes.readUInt32BE(16), width);
    assert.equal(bytes.readUInt32BE(20), height);
  }
  const worker = await fetch(base + '/sw.js');
  assert.equal(worker.status, 200);
  assert.match(worker.headers.get('content-type'), /javascript/);
  assert.equal(worker.headers.get('service-worker-allowed'), '/');
  assert.match(worker.headers.get('cache-control'), /no-cache/);
  const offline = await fetch(base + '/offline.html');
  assert.equal(offline.status, 200);
  assert.match(offline.headers.get('cache-control'), /no-cache/);
});
