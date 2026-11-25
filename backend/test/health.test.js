'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'https://invalid-database-url.example';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const app = require('../../index');
let server;
let base;

before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => new Promise((resolve) => server.close(resolve)));

test('health identifica DATABASE_URL inválida e reconhece Supabase Auth', async () => {
  const response = await fetch(base + '/api/health');
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.checks.database, 'invalid_configuration');
  assert.equal(body.checks.migrations, 'pending');
  assert.equal(body.checks.authentication, 'configured');
});
