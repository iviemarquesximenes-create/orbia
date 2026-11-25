'use strict';

const { Router } = require('express');
const { randomUUID } = require('node:crypto');
const { getPool, withTransaction } = require('../lib/db');
const { apiError, asyncRoute, requiredText } = require('../lib/http');
const { requireAuth } = require('../middleware/auth');
const { requireSyndicAccount } = require('../middleware/tenant');
const { writeAudit } = require('../services/audit');

const router = Router();
router.use('/api/tenants', requireAuth);

router.get('/api/tenants', asyncRoute(async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT t.id, t.name, t.address, t.is_demo, m.role
     FROM memberships m JOIN tenants t ON t.id = m.tenant_id
     WHERE m.user_id = $1 AND m.status = 'active' AND t.status = 'active'
     ORDER BY t.name`,
    [req.user.id]
  );
  return res.json({ items: rows.map((row) => ({ id: row.id, name: row.name, address: row.address, isDemo: Boolean(row.is_demo), role: row.role })) });
}));

router.post('/api/tenants', requireSyndicAccount, asyncRoute(async (req, res) => {
  const name = requiredText(req.body?.name, 180);
  const address = req.body?.address ? requiredText(req.body.address, 500) : null;
  if (!name) return apiError(res, 400, 'INVALID_TENANT_NAME', 'Informe o nome do condomínio.');
  if (req.body?.address && !address) return apiError(res, 400, 'INVALID_ADDRESS', 'O endereço excede o limite permitido.');
  const tenantId = randomUUID();
  const condominiumFundId = randomUUID();
  const reserveFundId = randomUUID();
  await withTransaction(async (connection) => {
    await connection.query(
      'INSERT INTO tenants (id, name, address, is_demo, created_by) VALUES ($1, $2, $3, FALSE, $4)',
      [tenantId, name, address, req.user.id]
    );
    await connection.query(
      "INSERT INTO memberships (id, tenant_id, user_id, role, status) VALUES ($1, $2, $3, 'syndic', 'active')",
      [randomUUID(), tenantId, req.user.id]
    );
    await connection.query(
      'INSERT INTO funds (id, tenant_id, code, name, purpose) VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)',
      [condominiumFundId, tenantId, 'CONDOMINIO', 'Condomínio', 'Despesas ordinárias e recorrentes', reserveFundId, tenantId, 'CAIXINHA', 'Caixinha', 'Fundo de reserva coletiva']
    );
    await writeAudit(connection, { tenantId, userId: req.user.id, action: 'tenant.created', entityType: 'tenant', entityId: tenantId, requestId: req.id });
  });
  return res.status(201).json({ item: { id: tenantId, name, address, isDemo: false, role: 'syndic' } });
}));

module.exports = router;
