'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WORKER_PATH = path.resolve(__dirname, '..', 'sw.js');
const ORIGIN = 'https://orbia.example';
const PUBLIC_PATHS = ['/offline.html', '/css/offline.css', '/assets/pwa/icon-192.png'];
const workerSource = fs.readFileSync(WORKER_PATH, 'utf8');
const CACHE_NAME = /const CACHE_NAME = '([^']+)';/.exec(workerSource)[1];

function response(status = 200, body = '') {
  return new Response(body, { status });
}

function request(url, { method = 'GET', mode = 'same-origin' } = {}) {
  const result = new Request(new URL(url, ORIGIN), { method });
  // Node's Request constructor intentionally rejects mode "navigate" even
  // though a browser supplies it to a service worker fetch event.
  Object.defineProperty(result, 'mode', { value: mode });
  return result;
}

class FakeCache {
  constructor(name, state) {
    this.name = name;
    this.state = state;
    this.entries = new Map();
    this.addAllCalls = [];
    this.matchCalls = [];
    this.putCalls = [];
  }

  async addAll(requests) {
    const list = [...requests];
    this.addAllCalls.push(list);
    const staged = [];
    for (const item of list) {
      const fetched = await this.state.fetch(item);
      if (!fetched || !fetched.ok) throw new Error(`precache failed for ${item.url}`);
      staged.push([item.url, fetched.clone()]);
    }
    for (const [key, value] of staged) this.entries.set(key, value);
  }

  async match(input, options = {}) {
    this.matchCalls.push({ input, options });
    const key = typeof input === 'string' ? new URL(input, ORIGIN).toString() : input.url;
    if (options.ignoreSearch) {
      const target = new URL(key);
      for (const [candidate, value] of this.entries) {
        const candidateUrl = new URL(candidate);
        if (candidateUrl.origin === target.origin && candidateUrl.pathname === target.pathname) {
          return value.clone();
        }
      }
      return undefined;
    }
    const value = this.entries.get(key);
    return value ? value.clone() : undefined;
  }

  async put(input, value) {
    this.putCalls.push({ input, value });
    this.entries.set(typeof input === 'string' ? new URL(input, ORIGIN).toString() : input.url, value);
  }
}

class FakeCaches {
  constructor(fetchImpl) {
    this.fetch = fetchImpl;
    this.byName = new Map();
    this.openCalls = [];
    this.deleteCalls = [];
    this.globalMatchCalls = [];
  }

  async open(name) {
    this.openCalls.push(name);
    if (!this.byName.has(name)) this.byName.set(name, new FakeCache(name, this));
    return this.byName.get(name);
  }

  async keys() {
    return [...this.byName.keys()];
  }

  async delete(name) {
    this.deleteCalls.push(name);
    return this.byName.delete(name);
  }

  async match(...args) {
    this.globalMatchCalls.push(args);
    throw new Error('global caches.match must not be used');
  }
}

function makeEvent() {
  const event = { promises: [], responsePromise: null };
  event.waitUntil = (promise) => event.promises.push(Promise.resolve(promise));
  event.respondWith = (promise) => {
    assert.equal(event.responsePromise, null, 'respondWith called more than once');
    event.responsePromise = Promise.resolve(promise);
  };
  return event;
}

function loadWorker(fetchImpl) {
  const caches = new FakeCaches(fetchImpl);
  const listeners = new Map();
  const self = {
    location: { origin: ORIGIN },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    }
  };
  const context = vm.createContext({
    self,
    caches,
    fetch: fetchImpl,
    Request,
    Response,
    URL,
    Promise,
    console
  });
  vm.runInContext(workerSource, context, { filename: WORKER_PATH });
  return {
    caches,
    dispatch(type, event) {
      listeners.get(type)(event);
      return event;
    }
  };
}

async function settle(event) {
  await Promise.all(event.promises);
}

test('install usa somente os três caminhos públicos com credentials omit e cache reload', async () => {
  const fetchCalls = [];
  const worker = loadWorker(async (input) => {
    fetchCalls.push(input);
    return response(200, input.url);
  });

  const install = worker.dispatch('install', makeEvent());
  await settle(install);

  const cache = worker.caches.byName.get(CACHE_NAME);
  assert.ok(cache);
  assert.equal(cache.addAllCalls.length, 1);
  assert.deepEqual(cache.addAllCalls[0].map((item) => new URL(item.url).pathname), PUBLIC_PATHS);
  assert.deepEqual(fetchCalls.map((item) => new URL(item.url).pathname), PUBLIC_PATHS);
  for (const item of fetchCalls) {
    assert.equal(item.credentials, 'omit');
    assert.equal(item.cache, 'reload');
  }
  assert.equal(cache.entries.size, PUBLIC_PATHS.length);
  assert.deepEqual([...cache.entries.keys()].map((key) => new URL(key).pathname), PUBLIC_PATHS);
});

test('navegação GET bem-sucedida retorna a resposta e nunca grava no cache', async () => {
  const navigationResponse = response(200, 'gestao online');
  const fetchCalls = [];
  const worker = loadWorker(async (input) => {
    fetchCalls.push(input);
    return navigationResponse.clone();
  });
  const navigation = request('/pages/financial.html', { mode: 'navigate' });
  const event = worker.dispatch('fetch', Object.assign(makeEvent(), { request: navigation }));
  const result = await event.responsePromise;

  assert.equal(result.status, 200);
  assert.equal(await result.text(), 'gestao online');
  assert.equal(fetchCalls.length, 1);
  assert.strictEqual(fetchCalls[0], navigation);
  const cache = worker.caches.byName.get(CACHE_NAME);
  assert.equal(cache, undefined);
  assert.equal(worker.caches.globalMatchCalls.length, 0);
});

test('falha de rede na navegação retorna somente a página offline do cache atual', async () => {
  const worker = loadWorker(async () => { throw new TypeError('offline'); });
  const cache = await worker.caches.open(CACHE_NAME);
  await cache.put(new URL('/offline.html', ORIGIN).toString(), response(200, 'reconecte-se'));
  const navigation = request('/', { mode: 'navigate' });
  const event = worker.dispatch('fetch', Object.assign(makeEvent(), { request: navigation }));
  const result = await event.responsePromise;

  assert.equal(result.status, 200);
  assert.equal(await result.text(), 'reconecte-se');
  assert.equal(cache.putCalls.length, 1);
  assert.equal(cache.matchCalls.length, 1);
  assert.equal(new URL(cache.matchCalls[0].input).pathname, '/offline.html');
});

test('respostas HTTP 401, 403 e 500 da navegação são preservadas', async () => {
  for (const status of [401, 403, 500]) {
    const worker = loadWorker(async () => response(status, `servidor-${status}`));
    const navigation = request('/pages/settings.html', { mode: 'navigate' });
    const event = worker.dispatch('fetch', Object.assign(makeEvent(), { request: navigation }));
    const result = await event.responsePromise;
    assert.equal(result.status, status);
    assert.equal(await result.text(), `servidor-${status}`);
  }
});

test('API, auth, storage, endpoints do Manus, origem externa e POST não recebem respondWith', () => {
  const worker = loadWorker(async () => response(200, 'não deveria ser chamado'));
  const cases = [
    request('/api/dashboard', { mode: 'navigate' }),
    request('/auth/callback', { mode: 'navigate' }),
    request('/manus-oauth/callback', { mode: 'navigate' }),
    request('/__manus/pwa/manifest.webmanifest', { mode: 'navigate' }),
    request('/__system__/health', { mode: 'navigate' }),
    request('/manus-storage/private/doc.pdf', { mode: 'navigate' }),
    request('https://other.example/page', { mode: 'navigate' }),
    request('https://other.example/submit', { method: 'POST', mode: 'cors' }),
    request('/pages/financial.html', { method: 'POST', mode: 'same-origin' })
  ];

  for (const current of cases) {
    const event = worker.dispatch('fetch', Object.assign(makeEvent(), { request: current }));
    assert.equal(event.responsePromise, null, `interceptou ${current.method} ${current.url}`);
  }
});

test('activation remove versões antigas do ORBIA e preserva caches de outros apps', async () => {
  const worker = loadWorker(async () => response(200));
  await worker.caches.open('orbia-public-v0');
  await worker.caches.open(CACHE_NAME);
  await worker.caches.open('orbia-public-v2-hash');
  await worker.caches.open('other-app-cache');

  const activation = worker.dispatch('activate', makeEvent());
  await settle(activation);

  assert.deepEqual(worker.caches.deleteCalls.sort(), ['orbia-public-v0', 'orbia-public-v2-hash']);
  assert.deepEqual((await worker.caches.keys()).sort(), [CACHE_NAME, 'other-app-cache'].sort());
});

test('assets allowlisted usam somente leitura cache-first do cache atual e ignoram query', async () => {
  const worker = loadWorker(async () => response(200, 'rede'));
  const cache = await worker.caches.open(CACHE_NAME);
  await cache.put(new URL('/css/offline.css', ORIGIN).toString(), response(200, 'css atual'));
  await cache.put(new URL('/assets/pwa/icon-192.png', ORIGIN).toString(), response(200, 'png atual'));

  for (const asset of ['/css/offline.css?hash=novo', '/assets/pwa/icon-192.png?cache=bust']) {
    const event = worker.dispatch('fetch', Object.assign(makeEvent(), { request: request(asset) }));
    const result = await event.responsePromise;
    assert.equal(await result.text(), asset.startsWith('/css/') ? 'css atual' : 'png atual');
  }

  assert.equal(cache.matchCalls.length, 2);
  assert.deepEqual(cache.matchCalls.map((call) => call.options.ignoreSearch), [true, true]);
  assert.equal(worker.caches.globalMatchCalls.length, 0);
  assert.equal(cache.putCalls.length, 2);
});

test('outros GETs de assets ou páginas não são adicionados ao cache em runtime', async () => {
  const worker = loadWorker(async () => response(200, 'conteudo'));
  const assets = ['/js/app.js', '/assets/pwa/icon-512.png', '/pages/units.html'];
  for (const pathname of assets) {
    const event = worker.dispatch('fetch', Object.assign(makeEvent(), { request: request(pathname) }));
    assert.equal(event.responsePromise, null, `interceptou asset não allowlisted ${pathname}`);
  }
  const cache = await worker.caches.open(CACHE_NAME);
  assert.equal(cache.putCalls.length, 0);
});

test('cache removido pelo sistema mantém aviso offline genérico sem dados ou reenvios', async () => {
  const worker = loadWorker(async () => { throw new TypeError('offline'); });
  const navigation = request('/', { mode: 'navigate' });
  const event = worker.dispatch('fetch', Object.assign(makeEvent(), { request: navigation }));
  const result = await event.responsePromise;
  assert.equal(result.status, 503);
  assert.match(result.headers.get('content-type'), /text\/plain/);
  assert.match(await result.text(), /Nenhum envio foi realizado/);
});
