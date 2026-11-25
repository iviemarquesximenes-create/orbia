'use strict';

const { randomUUID } = require('node:crypto');

async function writeAudit(connection, { tenantId, userId, action, entityType, entityId = null, details = null, requestId = null }) {
  await connection.query(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, details_json, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [randomUUID(), tenantId, userId || null, action, entityType, entityId, details ? JSON.stringify(details) : null, requestId]
  );
}

module.exports = { writeAudit };
