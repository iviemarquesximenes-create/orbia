'use strict';

function optional(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function assertPort(port) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT precisa ser um inteiro entre 0 e 65535.');
  }
  return port;
}

const config = Object.freeze({
  port: Number(optional('PORT') || '3000'),
  databaseUrl: optional('DATABASE_URL'),
  supabaseUrl: optional('NEXT_PUBLIC_SUPABASE_URL'),
  supabasePublishableKey: optional('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  supabaseServiceRoleKey: optional('SUPABASE_SERVICE_ROLE_KEY'),
  supabaseStorageBucket: optional('SUPABASE_STORAGE_BUCKET') || 'orbia-private-documents',
  manusProjectId: optional('MANUS_PROJECT_ID'),
  oauthPortalUrl: optional('MANUS_OAUTH_PORTAL_URL'),
  oauthApiUrl: optional('MANUS_OAUTH_API_URL'),
  manusJwtSecret: optional('MANUS_JWT_SECRET'),
  n8nWebhookSecret: optional('N8N_ORBIA_WEBHOOK_SECRET'),
  n8nOutboundUrl: optional('N8N_ORBIA_OUTBOUND_URL'),
  isAuthConfigured() {
    return Boolean(this.manusProjectId && this.oauthPortalUrl && this.oauthApiUrl && this.manusJwtSecret);
  },
  isSupabaseAuthConfigured() {
    return Boolean(this.supabaseUrl && this.supabasePublishableKey);
  },
  isSupabaseStorageConfigured() {
    return Boolean(this.supabaseUrl && this.supabaseServiceRoleKey);
  },
  isDatabaseConfigured() {
    return Boolean(this.databaseUrl);
  },
  isN8nInboundConfigured() {
    return Boolean(this.n8nWebhookSecret);
  },
  isN8nOutboundConfigured() {
    return Boolean(this.n8nOutboundUrl && this.n8nWebhookSecret);
  }
});

module.exports = { config, optional, assertPort };
