'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/orbia?sslmode=disable';
const { getPool, closePool } = require('../src/lib/db');
const { requireSyndicAccount, requireTenant, authorize } = require('../src/middleware/tenant');

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
after(closePool);

test('somente contas globais do tipo sindico podem iniciar cadastro de condomínio', () => {
  const residentResponse = response();
  requireSyndicAccount({ user: { account_type: 'resident' } }, residentResponse, () => assert.fail('Morador não pode cadastrar condomínio'));
  assert.equal(residentResponse.statusCode, 403);
  assert.equal(residentResponse.body.error.code, 'SYNDIC_ACCOUNT_REQUIRED');

  const syndicResponse = response();
  let passed = false;
  requireSyndicAccount({ user: { account_type: 'sindico' } }, syndicResponse, () => { passed = true; });
  assert.equal(passed, true);
});

test('tenant alheio é recusado mesmo com UUID válido no header', async (t) => {
  const tenant = 'b3d32b12-53f0-4a3f-89da-941d8f8b9a54';
  const pool = getPool();
  t.mock.method(pool, 'query', async (sql, args) => {
    assert.match(sql, /m\.user_id = \$1 AND m\.tenant_id = \$2/);
    assert.deepEqual(args, ['user-authorized-elsewhere', tenant]);
    return { rows: [] };
  });
  const req = { user: { id: 'user-authorized-elsewhere' }, get: () => tenant };
  const res = response();
  await requireTenant(req, res, () => assert.fail('Não deve permitir outro condomínio'));
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'TENANT_FORBIDDEN');
});

test('papel é derivado da membership SQL, nunca do payload do cliente', async (t) => {
  const tenant = 'b3d32b12-53f0-4a3f-89da-941d8f8b9a54';
  t.mock.method(getPool(), 'query', async () => ({ rows: [{ id: tenant, name: 'Tenant do teste unitário', is_demo: false, role: 'resident' }] }));
  const req = { user: { id: 'user-unit-test' }, body: { role: 'admin' }, get: () => tenant };
  const res = response(); let passed = false;
  await requireTenant(req, res, () => { passed = true; });
  assert.equal(passed, true);
  assert.equal(req.membership.role, 'resident');
  authorize('finance:approve')(req, res, () => assert.fail('Morador não aprova despesas'));
  assert.equal(res.statusCode, 403);
});

test('tenant ausente é recusado antes de consultar SQL', async () => {
  const res = response();
  await requireTenant({ get: () => undefined }, res, () => assert.fail('Tenant obrigatório'));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'TENANT_REQUIRED');
});
