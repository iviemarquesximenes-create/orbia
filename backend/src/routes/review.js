'use strict';

const { Router } = require('express');
const { randomUUID } = require('node:crypto');
const { getPool, withTransaction } = require('../lib/db');
const { apiError, asyncRoute, requiredText, isUuid } = require('../lib/http');
const { requireAuth } = require('../middleware/auth');
const { requireTenant, authorize } = require('../middleware/tenant');
const { writeAudit } = require('../services/audit');

const router = Router();
router.use('/api/review', requireAuth, requireTenant);

router.get('/api/review', authorize('review:read'), asyncRoute(async (req, res) => {
  const { rows } = await getPool().query('SELECT id, category, summary, payload_json, confidence, source_channel, source_message_id, status, created_at FROM ai_review_queue WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100', [req.tenant.id]);
  return res.json({ items: rows.map((row) => ({ ...row, payload: typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json })) });
}));

router.post('/api/review', authorize('review:create'), asyncRoute(async (req, res) => {
  const category = requiredText(req.body?.category, 100);
  const summary = requiredText(req.body?.summary, 500);
  const payload = req.body?.payload && typeof req.body.payload === 'object' && !Array.isArray(req.body.payload) ? req.body.payload : null;
  if (!category || !summary || !payload) return apiError(res, 400, 'INVALID_REVIEW_ITEM', 'Informe categoria, resumo e origem/estrutura do registro.');
  const id = randomUUID();
  await withTransaction(async (connection) => {
    await connection.query('INSERT INTO ai_review_queue (id, tenant_id, category, summary, payload_json, source_channel, status) VALUES ($1, $2, $3, $4, $5::jsonb, \'manual\', \'pending\')', [id, req.tenant.id, category, summary, JSON.stringify(payload)]);
    await writeAudit(connection, { tenantId: req.tenant.id, userId: req.user.id, action: 'review_item.created', entityType: 'ai_review', entityId: id, details: { category }, requestId: req.id });
  });
  return res.status(201).json({ item: { id, category, summary, status: 'pending' } });
}));

router.post('/api/review/:itemId/action', authorize('review:decide'), asyncRoute(async (req, res) => {
  const itemId = req.params.itemId;
  const action = req.body?.action;
  const note = req.body?.note ? requiredText(req.body.note, 1000) : null;
  const map = { approve: 'approved', reject: 'rejected', ignore: 'ignored', clarify: 'clarification_requested' };
  if (!isUuid(itemId) || !map[action]) return apiError(res, 400, 'INVALID_REVIEW_ACTION', 'Ação de revisão inválida.');
  await withTransaction(async (connection) => {
    const { rows } = await connection.query('SELECT id, status FROM ai_review_queue WHERE tenant_id = $1 AND id = $2 FOR UPDATE', [req.tenant.id, itemId]);
    if (!rows.length) throw Object.assign(new Error('REVIEW_ITEM_NOT_FOUND'), { code: 'REVIEW_ITEM_NOT_FOUND' });
    if (rows[0].status !== 'pending') throw Object.assign(new Error('REVIEW_ITEM_ALREADY_HANDLED'), { code: 'REVIEW_ITEM_ALREADY_HANDLED' });
    await connection.query('UPDATE ai_review_queue SET status = $1, reviewed_by = $2, reviewed_at = now() WHERE tenant_id = $3 AND id = $4', [map[action], req.user.id, req.tenant.id, itemId]);
    await writeAudit(connection, { tenantId: req.tenant.id, userId: req.user.id, action: `review_item.${action}`, entityType: 'ai_review', entityId: itemId, details: { note }, requestId: req.id });
  });
  return res.json({ item: { id: itemId, status: map[action] } });
}));

module.exports = router;
