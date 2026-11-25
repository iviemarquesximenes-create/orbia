'use strict';

const { getPool } = require('../lib/db');
const { apiError, isUuid } = require('../lib/http');

const ROLE_PERMISSIONS = Object.freeze({
  admin: ['*'],
  syndic: ['tenant:read', 'units:read', 'units:write', 'finance:read', 'finance:write', 'finance:approve', 'operations:read', 'operations:write', 'occurrences:write', 'announcements:read', 'announcements:write', 'announcements:publish', 'integrations:read', 'integrations:manage', 'review:read', 'review:create', 'review:decide'],
  finance: ['tenant:read', 'units:read', 'finance:read', 'finance:write', 'finance:approve', 'operations:read', 'operations:write', 'announcements:read', 'review:read', 'review:create', 'review:decide'],
  council: ['tenant:read', 'units:read', 'finance:read', 'operations:read', 'announcements:read'],
  resident: ['tenant:read', 'units:self', 'finance:self', 'operations:read', 'occurrences:write', 'announcements:read'],
  employee: ['tenant:read', 'operations:read', 'operations:write', 'occurrences:write', 'announcements:read']
});

function hasPermission(role, permission) {
  const list = ROLE_PERMISSIONS[role] || [];
  return list.includes('*') || list.includes(permission);
}

function requireSyndicAccount(req, res, next) {
  if (req.user?.account_type !== 'sindico') {
    return apiError(res, 403, 'SYNDIC_ACCOUNT_REQUIRED', 'Somente uma conta do tipo Síndico pode cadastrar um condomínio.');
  }
  return next();
}

async function requireTenant(req, res, next) {
  const tenantId = req.get('x-orbia-tenant-id');
  if (!isUuid(tenantId)) return apiError(res, 400, 'TENANT_REQUIRED', 'Selecione um condomínio válido.');
  try {
    const { rows } = await getPool().query(
      `SELECT t.id, t.name, t.is_demo, m.role
       FROM memberships m JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = $1 AND m.tenant_id = $2 AND m.status = 'active' AND t.status = 'active'
       LIMIT 1`,
      [req.user.id, tenantId]
    );
    if (!rows.length) return apiError(res, 403, 'TENANT_FORBIDDEN', 'Você não tem acesso a este condomínio.');
    req.tenant = { id: rows[0].id, name: rows[0].name, isDemo: Boolean(rows[0].is_demo) };
    req.membership = { role: rows[0].role };
    return next();
  } catch (error) { return next(error); }
}

function authorize(permission) {
  return (req, res, next) => {
    if (!req.membership || !hasPermission(req.membership.role, permission)) return apiError(res, 403, 'PERMISSION_DENIED', 'Seu perfil não pode executar esta ação.');
    return next();
  };
}

module.exports = { ROLE_PERMISSIONS, hasPermission, requireSyndicAccount, requireTenant, authorize };
