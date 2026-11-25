'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAmountToCents, centsToDecimal, isUuid } = require('../src/lib/http');
const { hasPermission } = require('../src/middleware/tenant');

test('valida e converte dinheiro para centavos sem float', () => {
  assert.equal(parseAmountToCents('1.234,56'), 123456n);
  assert.equal(parseAmountToCents('98.70'), 9870n);
  assert.equal(parseAmountToCents('0,01'), 1n);
  assert.equal(parseAmountToCents('1.234,567'), null);
  assert.equal(centsToDecimal(-5405n), '-54.05');
});

test('valida UUIDs para IDs de tenant e relacionamentos', () => {
  assert.equal(isUuid('b3d32b12-53f0-4a3f-89da-941d8f8b9a54'), true);
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid(null), false);
});

test('papéis não administrativos não recebem permissão universal', () => {
  assert.equal(hasPermission('admin', 'finance:approve'), true);
  assert.equal(hasPermission('finance', 'finance:write'), true);
  assert.equal(hasPermission('resident', 'finance:write'), false);
  assert.equal(hasPermission('resident', 'integrations:manage'), false);
});

const { isCalendarDate, sqlDateTime, sqlMonth } = require('../src/lib/http');
const { requestHash } = require('../src/services/idempotency');
const { readCookie, verifySessionToken, supabaseIdentity, setSupabaseSessionCookies } = require('../src/middleware/auth');

test('datas inexistentes e campos ausentes não são inventados', () => {
  assert.equal(isCalendarDate('2024-02-29'), true);
  assert.equal(isCalendarDate('2026-02-29'), false);
  assert.equal(isCalendarDate('2026-04-31'), false);
  assert.equal(sqlMonth('2026-13'), null);
  assert.equal(sqlMonth('2026-00'), null);
  assert.equal(sqlMonth('2026-11'), '2026-11-01');
  assert.equal(sqlDateTime(undefined), null);
  assert.equal(sqlDateTime('2026-02-30'), null);
  assert.equal(sqlDateTime('2026-11-19'), '2026-11-19 00:00:00');
});

test('revisão sensível não usa permissões genéricas de operação', () => {
  for (const role of ['resident', 'employee', 'council']) {
    assert.equal(hasPermission(role, 'review:read'), false);
    assert.equal(hasPermission(role, 'review:decide'), false);
  }
  assert.equal(hasPermission('syndic', 'review:decide'), true);
  assert.equal(hasPermission('finance', 'review:decide'), true);
  assert.equal(hasPermission('syndic', 'occurrences:write'), true);
});

test('impressão digital distingue conteúdos de uma tentativa financeira', () => {
  assert.equal(requestHash({ amount: '10.00' }), requestHash({ amount: '10.00' }));
  assert.notEqual(requestHash({ amount: '10.00' }), requestHash({ amount: '20.00' }));
});

test('cookie corrompido ou token sem assinatura não concede sessão', () => {
  assert.equal(readCookie({ headers: { cookie: 'webdev_app_session=%bad%' } }, 'webdev_app_session'), null);
  assert.equal(verifySessionToken('eyJhbGciOiJIUzI1NiJ9.e30.invalid'), null);
});

test('identidade Supabase é vinculada ao UUID do Auth e sessão usa cookies HttpOnly', () => {
  const user = supabaseIdentity({
    id: 'b3d32b12-53f0-4a3f-89da-941d8f8b9a54',
    email: 'morador@example.com',
    user_metadata: { full_name: 'Morador ORBIA' }
  });
  assert.deepEqual(user, {
    userId: 'b3d32b12-53f0-4a3f-89da-941d8f8b9a54',
    openId: 'supabase:b3d32b12-53f0-4a3f-89da-941d8f8b9a54',
    name: 'Morador ORBIA',
    email: 'morador@example.com'
  });

  const headers = {};
  const response = {
    getHeader(name) { return headers[name]; },
    setHeader(name, value) { headers[name] = value; }
  };
  const csrfToken = setSupabaseSessionCookies(response, {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600
  });
  assert.equal(typeof csrfToken, 'string');
  assert.equal(headers['Set-Cookie'].length, 3);
  assert.match(headers['Set-Cookie'][0], /HttpOnly; Secure; SameSite=None/);
  assert.match(headers['Set-Cookie'][2], /orbia_csrf=.*Secure; SameSite=None/);
});
