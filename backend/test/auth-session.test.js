'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const request = global.fetch.bind(global);
const supabaseCalls = [];
global.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  supabaseCalls.push({ url, options });
  if (url.pathname === '/auth/v1/user') {
    return new Response(JSON.stringify({ id: '1c7df082-51bb-459d-a958-5b61a4082ad0' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
    return new Response(JSON.stringify({
      access_token: 'rotated-access-token',
      refresh_token: 'rotated-refresh-token',
      expires_in: 3600,
      user: { id: '1c7df082-51bb-459d-a958-5b61a4082ad0' }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  throw new Error(`Unexpected Supabase request: ${url.pathname}`);
};

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

test('session validates access token and rotates the verified Supabase token pair', async () => {
  const response = await request(`${base}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: 'access-token-test', refreshToken: 'refresh-token-test' })
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, '1c7df082-51bb-459d-a958-5b61a4082ad0');
  const cookies = response.headers.get('set-cookie');
  assert.match(cookies, /orbia_supabase_access=rotated-access-token/);
  assert.match(cookies, /orbia_supabase_refresh=rotated-refresh-token/);
  assert.equal(supabaseCalls.length, 2);
  assert.equal(supabaseCalls[0].url.pathname, '/auth/v1/user');
  assert.equal(supabaseCalls[1].url.searchParams.get('grant_type'), 'refresh_token');
});
