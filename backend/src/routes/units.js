'use strict';

const { Router } = require('express');
const { randomUUID } = require('node:crypto');
const { getPool, withTransaction } = require('../lib/db');
const { apiError, asyncRoute, requiredText } = require('../lib/http');
const { requireAuth } = require('../middleware/auth');
const { requireTenant, authorize } = require('../middleware/tenant');
const { writeAudit } = require('../services/audit');

const router = Router();
router.use('/api/units', requireAuth, requireTenant);

router.get('/api/units', authorize('units:read'), asyncRoute(async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT u.id, u.label, u.block_name, u.unit_type, u.status, u.notes,
            COUNT(r.id) AS resident_count,
            STRING_AGG(r.full_name, ', ' ORDER BY r.full_name) AS resident_names
     FROM units u LEFT JOIN residents r ON r.tenant_id = u.tenant_id AND r.unit_id = u.id AND r.status = 'active'
     WHERE u.tenant_id = $1
     GROUP BY u.id, u.label, u.block_name, u.unit_type, u.status, u.notes
     ORDER BY u.block_name, u.label`,
    [req.tenant.id]
  );
  return res.json({ items: rows.map((row) => ({
    id: row.id,
    label: row.label,
    block: row.block_name,
    type: row.unit_type,
    status: row.status,
    notes: row.notes,
    residentCount: Number(row.resident_count),
    residents: row.resident_names ? row.resident_names.split(', ') : []
  })) });
}));

router.post('/api/units', authorize('units:write'), asyncRoute(async (req, res) => {
  const label = requiredText(req.body?.label, 100);
  const type = requiredText(req.body?.type || 'Casa', 80);
  const block = req.body?.block ? requiredText(req.body.block, 100) : null;
  const residentName = req.body?.residentName ? requiredText(req.body.residentName, 180) : null;
  if (!label || !type || (req.body?.block && !block) || (req.body?.residentName && !residentName)) {
    return apiError(res, 400, 'INVALID_UNIT', 'Confira a identificação, o tipo e os dados informados.');
  }
  const unitId = randomUUID();
  await withTransaction(async (connection) => {
    await connection.query(
      'INSERT INTO units (id, tenant_id, label, block_name, unit_type, notes) VALUES ($1, $2, $3, $4, $5, $6)',
      [unitId, req.tenant.id, label, block || '', type, req.body?.notes ? requiredText(req.body.notes, 1000) : null]
    );
    if (residentName) {
      await connection.query(
        "INSERT INTO residents (id, tenant_id, unit_id, full_name, phone, email, resident_type) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [randomUUID(), req.tenant.id, unitId, residentName, req.body?.phone ? requiredText(req.body.phone, 40) : null, req.body?.email ? requiredText(req.body.email, 254) : null, ['owner','tenant','temporary','other'].includes(req.body?.residentType) ? req.body.residentType : 'owner']
      );
    }
    await writeAudit(connection, { tenantId: req.tenant.id, userId: req.user.id, action: 'unit.created', entityType: 'unit', entityId: unitId, details: { label, type }, requestId: req.id });
  });
  return res.status(201).json({ item: { id: unitId, label, block, type, status: 'active', residentCount: residentName ? 1 : 0, residents: residentName ? [residentName] : [] } });
}));

module.exports = router;
