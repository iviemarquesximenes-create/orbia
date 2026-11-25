'use strict';

const { Router } = require('express');
const { randomUUID } = require('node:crypto');
const { getPool, withTransaction } = require('../lib/db');
const { apiError, asyncRoute, requiredText, parseAmountToCents, centsToDecimal, isUuid, isCalendarDate } = require('../lib/http');
const { requireAuth } = require('../middleware/auth');
const { requireTenant, authorize } = require('../middleware/tenant');
const { writeAudit } = require('../services/audit');

const router = Router();
router.use(['/api/suppliers', '/api/maintenance', '/api/quotes', '/api/occurrences', '/api/announcements'], requireAuth, requireTenant);

router.get('/api/suppliers', authorize('operations:read'), asyncRoute(async (req, res) => {
  const { rows } = await getPool().query('SELECT id, name, company, phone, category, service_description, recommended_by, status, created_at FROM suppliers WHERE tenant_id = $1 ORDER BY name LIMIT 200', [req.tenant.id]);
  return res.json({ items: rows });
}));

router.post('/api/suppliers', authorize('operations:write'), asyncRoute(async (req, res) => {
  const name = requiredText(req.body?.name, 180);
  const category = requiredText(req.body?.category, 100);
  const company = req.body?.company ? requiredText(req.body.company, 180) : null;
  const phone = req.body?.phone ? requiredText(req.body.phone, 40) : null;
  if (!name || !category || (req.body?.company && !company) || (req.body?.phone && !phone)) return apiError(res, 400, 'INVALID_SUPPLIER', 'Informe nome, categoria e dados válidos.');
  const id = randomUUID();
  await withTransaction(async (connection) => {
    const { rows: dupes } = await connection.query('SELECT id FROM suppliers WHERE tenant_id = $1 AND (($2::text IS NOT NULL AND phone = $3) OR (name = $4 AND company IS NOT DISTINCT FROM $5)) LIMIT 1', [req.tenant.id, phone, phone, name, company]);
    if (dupes.length) throw Object.assign(new Error('SUPPLIER_DUPLICATE'), { code: 'SUPPLIER_DUPLICATE' });
    await connection.query('INSERT INTO suppliers (id, tenant_id, name, company, phone, category, service_description, recommended_by, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [id, req.tenant.id, name, company, phone, category, req.body?.service ? requiredText(req.body.service, 1000) : null, req.body?.recommendedBy ? requiredText(req.body.recommendedBy, 180) : null, req.body?.notes ? requiredText(req.body.notes, 1000) : null]);
    await writeAudit(connection, { tenantId: req.tenant.id, userId: req.user.id, action: 'supplier.created', entityType: 'supplier', entityId: id, details: { category }, requestId: req.id });
  }).catch((error) => { if (error.code === 'SUPPLIER_DUPLICATE') throw error; throw error; });
  return res.status(201).json({ item: { id, name, company, phone, category, status: 'active' } });
}));

router.get('/api/maintenance', authorize('operations:read'), asyncRoute(async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT m.id, m.name, m.category, m.description, m.scheduled_for, m.completed_at, m.amount, m.status, m.periodicity, m.is_estimate,
            f.name AS fund_name, s.name AS supplier_name
     FROM maintenance_records m
     LEFT JOIN funds f ON f.tenant_id = m.tenant_id AND f.id = m.fund_id
     LEFT JOIN suppliers s ON s.tenant_id = m.tenant_id AND s.id = m.supplier_id
     WHERE m.tenant_id = $1 ORDER BY COALESCE(m.scheduled_for, m.created_at::date) DESC LIMIT 100`,
    [req.tenant.id]
  );
  return res.json({ items: rows });
}));

router.post('/api/maintenance', authorize('operations:write'), asyncRoute(async (req, res) => {
  const name = requiredText(req.body?.name, 180);
  const category = requiredText(req.body?.category, 100);
  const description = req.body?.description ? requiredText(req.body.description, 2000) : null;
  const scheduledFor = req.body?.scheduledFor && isCalendarDate(req.body.scheduledFor) ? req.body.scheduledFor : null;
  const amountCents = req.body?.amount ? parseAmountToCents(req.body.amount) : null;
  if (!name || !category || (req.body?.scheduledFor && !scheduledFor) || (req.body?.amount && (!amountCents || amountCents <= 0n))) return apiError(res, 400, 'INVALID_MAINTENANCE', 'Confira nome, categoria, data e valor.');
  const allowedStatuses = ['necessary','requested','quoting','awaiting_approval','scheduled','in_progress'];
  const status = allowedStatuses.includes(req.body?.status) ? req.body.status : 'requested';
  const id = randomUUID();
  await withTransaction(async (connection) => {
    if (req.body?.fundId) {
      const { rows: funds } = await connection.query('SELECT id FROM funds WHERE tenant_id = $1 AND id = $2 LIMIT 1', [req.tenant.id, req.body.fundId]);
      if (!funds.length) throw Object.assign(new Error('FUND_NOT_FOUND'), { code: 'FUND_NOT_FOUND' });
    }
    if (req.body?.supplierId) {
      const { rows: suppliers } = await connection.query('SELECT id FROM suppliers WHERE tenant_id = $1 AND id = $2 LIMIT 1', [req.tenant.id, req.body.supplierId]);
      if (!suppliers.length) throw Object.assign(new Error('SUPPLIER_NOT_FOUND'), { code: 'SUPPLIER_NOT_FOUND' });
    }
    await connection.query('INSERT INTO maintenance_records (id, tenant_id, name, category, description, scheduled_for, amount, fund_id, supplier_id, status, periodicity, is_estimate, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)', [id, req.tenant.id, name, category, description, scheduledFor, amountCents ? centsToDecimal(amountCents) : null, req.body?.fundId || null, req.body?.supplierId || null, status, req.body?.periodicity ? requiredText(req.body.periodicity, 100) : null, Boolean(req.body?.isEstimate), req.user.id]);
    await writeAudit(connection, { tenantId: req.tenant.id, userId: req.user.id, action: 'maintenance.created', entityType: 'maintenance', entityId: id, details: { category, status }, requestId: req.id });
  });
  return res.status(201).json({ item: { id, name, category, description, scheduledFor, amount: amountCents ? centsToDecimal(amountCents) : null, status, isEstimate: Boolean(req.body?.isEstimate) } });
}));

router.get('/api/quotes', authorize('operations:read'), asyncRoute(async (req, res) => {
  const { rows } = await getPool().query('SELECT q.id, q.service_name, q.description, q.amount, q.received_at, q.valid_until, q.conditions, q.status, s.name AS supplier_name FROM quotes q LEFT JOIN suppliers s ON s.tenant_id = q.tenant_id AND s.id = q.supplier_id WHERE q.tenant_id = $1 ORDER BY q.created_at DESC LIMIT 100', [req.tenant.id]);
  return res.json({ items: rows });
}));

router.post('/api/quotes', authorize('operations:write'), asyncRoute(async (req, res) => {
  const serviceName = requiredText(req.body?.serviceName, 180);
  if ((req.body?.receivedAt && !isCalendarDate(req.body.receivedAt)) || (req.body?.validUntil && !isCalendarDate(req.body.validUntil))) return apiError(res, 400, 'INVALID_QUOTE_DATE', 'Informe datas reais no formato AAAA-MM-DD.');
  const amountCents = req.body?.amount ? parseAmountToCents(req.body.amount) : null;
  if (!serviceName || (req.body?.amount && (!amountCents || amountCents <= 0n))) return apiError(res, 400, 'INVALID_QUOTE', 'Informe o serviço e um valor válido, se conhecido.');
  const id = randomUUID();
  await withTransaction(async (connection) => {
    if (req.body?.supplierId) {
      const { rows: suppliers } = await connection.query('SELECT id FROM suppliers WHERE tenant_id = $1 AND id = $2 LIMIT 1', [req.tenant.id, req.body.supplierId]);
      if (!suppliers.length) throw Object.assign(new Error('SUPPLIER_NOT_FOUND'), { code: 'SUPPLIER_NOT_FOUND' });
    }
    await connection.query('INSERT INTO quotes (id, tenant_id, supplier_id, service_name, description, amount, received_at, valid_until, conditions, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)', [id, req.tenant.id, req.body?.supplierId || null, serviceName, req.body?.description ? requiredText(req.body.description, 2000) : null, amountCents ? centsToDecimal(amountCents) : null, req.body?.receivedAt || null, req.body?.validUntil || null, req.body?.conditions ? requiredText(req.body.conditions, 1000) : null, 'received', req.user.id]);
    await writeAudit(connection, { tenantId: req.tenant.id, userId: req.user.id, action: 'quote.created', entityType: 'quote', entityId: id, requestId: req.id });
  });
  return res.status(201).json({ item: { id, serviceName, amount: amountCents ? centsToDecimal(amountCents) : null, status: 'received' } });
}));

router.get('/api/occurrences', authorize('operations:read'), asyncRoute(async (req, res) => {
  const { rows } = await getPool().query("SELECT id, title, description, category, location, urgency, status, created_at, updated_at FROM occurrences WHERE tenant_id = $1 ORDER BY CASE urgency WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, created_at DESC LIMIT 100", [req.tenant.id]);
  return res.json({ items: rows });
}));

router.post('/api/occurrences', authorize('occurrences:write'), asyncRoute(async (req, res) => {
  const title = requiredText(req.body?.title, 180);
  const description = req.body?.description ? requiredText(req.body.description, 2000) : null;
  const category = requiredText(req.body?.category, 100);
  if (!title || !category || (req.body?.description && !description)) return apiError(res, 400, 'INVALID_OCCURRENCE', 'Informe título e categoria.');
  const urgency = ['low','normal','high','urgent'].includes(req.body?.urgency) ? req.body.urgency : 'normal';
  const id = randomUUID();
  await withTransaction(async (connection) => {
    await connection.query('INSERT INTO occurrences (id, tenant_id, title, description, category, location, urgency, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, \'open\', $8)', [id, req.tenant.id, title, description, category, req.body?.location ? requiredText(req.body.location, 180) : null, urgency, req.user.id]);
    await writeAudit(connection, { tenantId: req.tenant.id, userId: req.user.id, action: 'occurrence.created', entityType: 'occurrence', entityId: id, details: { urgency, category }, requestId: req.id });
  });
  return res.status(201).json({ item: { id, title, category, urgency, status: 'open' } });
}));

router.get('/api/announcements', authorize('announcements:read'), asyncRoute(async (req, res) => {
  const privileged = ['admin', 'syndic'].includes(req.membership.role);
  const { rows } = await getPool().query(
    "SELECT id, title, body, category, status, scheduled_at, published_at, created_at FROM announcements WHERE tenant_id = $1 AND ($2::boolean OR status = 'published') ORDER BY created_at DESC LIMIT 100",
    [req.tenant.id, privileged]
  );
  return res.json({ items: rows });
}));

router.post('/api/announcements', authorize('announcements:write'), asyncRoute(async (req, res) => {
  const title = requiredText(req.body?.title, 180);
  const body = requiredText(req.body?.body, 8000);
  const category = requiredText(req.body?.category || 'Aviso geral', 100);
  if (!title || !body || !category) return apiError(res, 400, 'INVALID_ANNOUNCEMENT', 'Informe título, mensagem e categoria.');
  const id = randomUUID();
  const status = 'draft';
  await withTransaction(async (connection) => {
    await connection.query('INSERT INTO announcements (id, tenant_id, title, body, category, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)', [id, req.tenant.id, title, body, category, status, req.user.id]);
    await writeAudit(connection, { tenantId: req.tenant.id, userId: req.user.id, action: 'announcement.created', entityType: 'announcement', entityId: id, details: { status }, requestId: req.id });
  });
  return res.status(201).json({ item: { id, title, category, status } });
}));

router.post('/api/announcements/:announcementId/publish', authorize('announcements:publish'), asyncRoute(async (req, res) => {
  if (!isUuid(req.params.announcementId)) return apiError(res, 400, 'INVALID_ANNOUNCEMENT', 'Identificador inválido.');
  await withTransaction(async (connection) => {
    const { rows } = await connection.query('SELECT id, status FROM announcements WHERE tenant_id = $1 AND id = $2 FOR UPDATE', [req.tenant.id, req.params.announcementId]);
    if (!rows.length) throw Object.assign(new Error('ANNOUNCEMENT_NOT_FOUND'), { code: 'ANNOUNCEMENT_NOT_FOUND' });
    if (!['draft','pending_approval','scheduled'].includes(rows[0].status)) throw Object.assign(new Error('ANNOUNCEMENT_NOT_PUBLISHABLE'), { code: 'ANNOUNCEMENT_NOT_PUBLISHABLE' });
    await connection.query("UPDATE announcements SET status = 'published', published_at = now(), approved_by = $1 WHERE tenant_id = $2 AND id = $3", [req.user.id, req.tenant.id, req.params.announcementId]);
    await writeAudit(connection, { tenantId: req.tenant.id, userId: req.user.id, action: 'announcement.published', entityType: 'announcement', entityId: req.params.announcementId, requestId: req.id });
  });
  return res.json({ item: { id: req.params.announcementId, status: 'published' } });
}));

module.exports = router;
