'use strict';

const { Router } = require('express');
const express = require('express');
const { createHash, randomUUID, timingSafeEqual } = require('node:crypto');
const { config } = require('../lib/config');
const { getPool, withTransaction } = require('../lib/db');
const { apiError, asyncRoute, requiredText, isUuid, sqlDateTime } = require('../lib/http');
const { requireAuth } = require('../middleware/auth');
const { requireTenant, authorize } = require('../middleware/tenant');
const { writeAudit } = require('../services/audit');
const {
  MAX_ATTACHMENT_BYTES,
  isAllowedAttachmentType,
  normalizeAttachments,
  uploadPrivateObject
} = require('../services/attachment-storage');

const router = Router();

function safeTokenMatch(received, expected) {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function authorizeWebhook(req, res) {
  if (!config.isN8nInboundConfigured()) {
    apiError(res, 503, 'INTEGRATION_NOT_CONFIGURED', 'O webhook do n8n ainda não está configurado.');
    return false;
  }
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!safeTokenMatch(token, config.n8nWebhookSecret)) {
    apiError(res, 401, 'INVALID_WEBHOOK_SECRET', 'Webhook não autorizado.');
    return false;
  }
  return true;
}

async function getActiveIntegration(integrationId) {
  if (!isUuid(integrationId)) return null;
  const { rows } = await getPool().query(
    "SELECT id, tenant_id, status, instance_name FROM integrations WHERE id = $1 AND provider = 'evolution_n8n' LIMIT 1",
    [integrationId]
  );
  return rows.length && rows[0].status === 'active' ? rows[0] : null;
}

router.post('/api/integrations/evolution/media', express.raw({ type: '*/*', limit: MAX_ATTACHMENT_BYTES }), asyncRoute(async (req, res) => {
  if (!authorizeWebhook(req, res)) return;
  if (!config.isSupabaseStorageConfigured()) return apiError(res, 503, 'DOCUMENT_STORAGE_NOT_CONFIGURED', 'Configure o armazenamento privado de documentos.');

  const contentType = (req.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!isAllowedAttachmentType(contentType)) return apiError(res, 415, 'UNSUPPORTED_ATTACHMENT_TYPE', 'Use somente imagens ou PDF.');
  if (!Buffer.isBuffer(req.body) || req.body.length < 1 || req.body.length > MAX_ATTACHMENT_BYTES) {
    return apiError(res, 400, 'INVALID_ATTACHMENT', 'O arquivo está vazio ou excede o limite de 15 MB.');
  }
  const integrationId = req.get('x-orbia-integration-id');
  const messageId = requiredText(req.get('x-orbia-message-id'), 191);
  const fileName = requiredText(req.get('x-orbia-file-name'), 180);
  if (!isUuid(integrationId) || !messageId || !fileName) {
    return apiError(res, 400, 'INVALID_ATTACHMENT_SOURCE', 'Informe a integração, a mensagem e o nome original do arquivo.');
  }
  const integration = await getActiveIntegration(integrationId);
  if (!integration) return apiError(res, 403, 'INTEGRATION_INACTIVE', 'A integração não está ativa.');

  const contentHash = createHash('sha256').update(req.body).digest('hex');
  const storageHash = createHash('sha256').update(`${integration.id}:${messageId}:${contentHash}`).digest('hex');
  const storagePath = `${integration.tenant_id}/whatsapp/${storageHash}`;
  await uploadPrivateObject(storagePath, contentType, req.body);
  return res.status(201).json({
    item: {
      storage_path: storagePath,
      file_name: fileName.replace(/[\u0000-\u001f\u007f/\\]/g, '_'),
      mime_type: contentType,
      size_bytes: req.body.length
    }
  });
}));

router.get('/api/integrations/evolution/events', (_req, res) => apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST para enviar eventos.'));
router.post('/api/integrations/evolution/events', asyncRoute(async (req, res) => {
  if (!authorizeWebhook(req, res)) return;

  const integrationId = req.get('x-orbia-integration-id');
  const deliveryId = requiredText(req.get('x-orbia-delivery-id') || req.body?.delivery_id, 191);
  const eventType = requiredText(req.body?.event_type, 80);
  if (!isUuid(integrationId) || !deliveryId || !eventType) return apiError(res, 400, 'INVALID_EVENT', 'O evento precisa de integração, identificador estável e tipo.');
  if (req.body?.schema_version !== 1 || !['message.received', 'connection.updated', 'message.status'].includes(eventType)) return apiError(res, 400, 'UNSUPPORTED_EVENT', 'Use schema_version 1 e um tipo de evento suportado.');
  const integration = await getActiveIntegration(integrationId);
  if (!integration) return apiError(res, 403, 'INTEGRATION_INACTIVE', 'A integração não está ativa.');
  const payload = req.body;
  const messageId = typeof payload.message_id === 'string' ? requiredText(payload.message_id, 191) : null;
  const senderId = typeof payload.sender_id === 'string' ? requiredText(payload.sender_id, 191) : null;
  const messageType = (typeof payload.message_type === 'string' && requiredText(payload.message_type, 80)) || 'mensagem';
  const text = typeof payload.text === 'string' ? payload.text.trim().slice(0, 4000) : '';
  const attachments = normalizeAttachments(payload.attachments, integration.tenant_id);
  if (!attachments || (attachments.length && eventType !== 'message.received')) {
    return apiError(res, 400, 'INVALID_ATTACHMENTS', 'Anexos precisam ser imagens ou PDF previamente armazenados no espaço privado deste condomínio.');
  }
  const hasMedia = payload.has_media === true || attachments.length > 0;
  const sourceTimestamp = requiredText(payload.occurred_at, 40);
  const chatId = requiredText(payload.chat_id, 191);
  const instance = requiredText(payload.instance, 180);
  const isGroup = payload.is_group === true;
  if (instance !== integration.instance_name || !sourceTimestamp || !sqlDateTime(sourceTimestamp)) return apiError(res, 400, 'INVALID_SOURCE', 'Confira instância e data original do evento.');
  if (eventType === 'message.received' && (!messageId || !senderId || !chatId)) return apiError(res, 400, 'MESSAGE_SOURCE_REQUIRED', 'Mensagens exigem identificadores originais de mensagem, remetente e chat.');
  const normalizedPayload = { schemaVersion: 1, eventType, deliveryId, messageId, senderId, messageType, text, hasMedia, attachments, sourceTimestamp, chatId, isGroup, instance };
  try {
    await withTransaction(async (connection) => {
      const eventId = randomUUID();
      await connection.query('INSERT INTO integration_events (id, tenant_id, integration_id, delivery_id, event_type, message_id, payload_json, status) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, \'received\')', [eventId, integration.tenant_id, integration.id, deliveryId, eventType, messageId, JSON.stringify(normalizedPayload)]);
      if (eventType === 'message.received') {
        const category = messageType.slice(0, 100);
        const summary = text ? `Mensagem recebida para revisão (${category})` : (hasMedia ? `Anexo recebido para revisão (${category})` : `Evento de mensagem sem texto extraído (${category})`);
        await connection.query('INSERT INTO ai_review_queue (id, tenant_id, category, summary, payload_json, source_channel, source_message_id, status) VALUES ($1, $2, $3, $4, $5::jsonb, \'evolution_n8n\', $6, \'pending\')', [randomUUID(), integration.tenant_id, category, summary, JSON.stringify({ integrationId, ...normalizedPayload }), messageId]);
      }
      await connection.query('UPDATE integrations SET last_event_at = now(), last_error_code = NULL WHERE id = $1 AND tenant_id = $2', [integration.id, integration.tenant_id]);
      await connection.query("UPDATE integration_events SET status = 'processed', processed_at = now() WHERE id = $1", [eventId]);
    });
  } catch (error) {
    if (error.code === '23505') return res.json({ ok: true, duplicate: true, deliveryId });
    throw error;
  }
  return res.status(202).json({ ok: true, accepted: true, deliveryId });
}));

router.use('/api/integrations', requireAuth, requireTenant);
router.get('/api/integrations', authorize('integrations:read'), asyncRoute(async (req, res) => {
  const { rows } = await getPool().query("SELECT id, provider, display_name, instance_name, status, last_event_at, last_error_code, created_at FROM integrations WHERE tenant_id = $1 ORDER BY created_at DESC", [req.tenant.id]);
  return res.json({ items: rows.map((row) => ({ ...row, outboundConfigured: false, outboundImplemented: false, inboundConfigured: config.isN8nInboundConfigured(), attachmentsConfigured: config.isSupabaseStorageConfigured() })) });
}));

router.post('/api/integrations', authorize('integrations:manage'), asyncRoute(async (req, res) => {
  const instanceName = requiredText(req.body?.instanceName, 180);
  const displayName = requiredText(req.body?.displayName || 'Evolution API + n8n', 180);
  if (!instanceName || !displayName) return apiError(res, 400, 'INVALID_INTEGRATION', 'Informe o nome da instância e um nome de exibição.');
  const id = randomUUID();
  await withTransaction(async (connection) => {
    await connection.query("INSERT INTO integrations (id, tenant_id, provider, display_name, instance_name, status) VALUES ($1, $2, 'evolution_n8n', $3, $4, 'pending')", [id, req.tenant.id, displayName, instanceName]);
    await writeAudit(connection, { tenantId: req.tenant.id, userId: req.user.id, action: 'integration.created', entityType: 'integration', entityId: id, details: { provider: 'evolution_n8n' }, requestId: req.id });
  });
  return res.status(201).json({ item: { id, provider: 'evolution_n8n', displayName, instanceName, status: 'pending', inboundConfigured: config.isN8nInboundConfigured(), attachmentsConfigured: config.isSupabaseStorageConfigured(), outboundConfigured: false, outboundImplemented: false } });
}));

router.post('/api/integrations/:integrationId/activate', authorize('integrations:manage'), asyncRoute(async (req, res) => {
  if (!isUuid(req.params.integrationId)) return apiError(res, 400, 'INVALID_INTEGRATION', 'Identificador de integração inválido.');
  if (!config.isN8nInboundConfigured()) return apiError(res, 503, 'INTEGRATION_NOT_CONFIGURED', 'Configure o segredo de webhook antes de ativar a integração.');
  let updated = false;
  await withTransaction(async (connection) => {
    const result = await connection.query("UPDATE integrations SET status = 'active' WHERE tenant_id = $1 AND id = $2 AND provider = 'evolution_n8n' AND status IN ('pending','error')", [req.tenant.id, req.params.integrationId]);
    updated = result.rowCount > 0;
    if (updated) await writeAudit(connection, { tenantId: req.tenant.id, userId: req.user.id, action: 'integration.inbound_enabled', entityType: 'integration', entityId: req.params.integrationId, requestId: req.id });
  });
  if (!updated) return apiError(res, 404, 'INTEGRATION_NOT_FOUND', 'Integração pendente não encontrada.');
  return res.json({ item: { id: req.params.integrationId, status: 'active' } });
}));

module.exports = router;
