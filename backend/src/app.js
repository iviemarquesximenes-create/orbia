'use strict';

const express = require('express');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { getPool } = require('./lib/db');
const { config } = require('./lib/config');
const authRoutes = require('./routes/auth');
const tenantRoutes = require('./routes/tenants');
const unitRoutes = require('./routes/units');
const financeRoutes = require('./routes/finance');
const operationsRoutes = require('./routes/operations');
const reviewRoutes = require('./routes/review');
const integrationRoutes = require('./routes/integrations');
const { rateLimit } = require('./middleware/rate-limit');

const app = express();
const frontendDirectory = path.resolve(__dirname, '../../frontend');
const databaseConnectionErrorCodes = new Set([
  '28P01', '3D000', '57P01',
  'ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH',
  'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID'
]);
const requiredMigrations = ['001_orbia_schema.sql', '002_syndic_account_type.sql'];

function isDatabaseConnectionError(error) {
  const code = String(error?.code || '');
  return code.startsWith('08') || databaseConnectionErrorCodes.has(code);
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  next();
});
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});
app.use('/api', rateLimit());
app.use('/api/auth/start', rateLimit({ limit: 20, windowMs: 60000 }));
app.use(express.json({ limit: '512kb', strict: true }));

app.get('/api/health', async (_req, res) => {
  let databaseReady = false;
  let migrationsReady = false;
  let databaseStatus = config.isDatabaseConfigured() ? 'unavailable' : 'not_configured';
  if (config.isDatabaseConfigured()) {
    try {
      const pool = getPool();
      await pool.query('SELECT 1');
      databaseReady = true;
      databaseStatus = 'connected';
    } catch (error) {
      if (error.code === 'DATABASE_URL_INVALID' || error.code === 'DATABASE_TLS_REQUIRED') {
        databaseStatus = 'invalid_configuration';
      }
    }
    if (databaseReady) {
      try {
        const pool = getPool();
        const { rows } = await pool.query(
          'SELECT COUNT(DISTINCT name) AS total FROM public.schema_migrations WHERE name = ANY($1::text[])',
          [requiredMigrations]
        );
        migrationsReady = Number(rows[0].total) === requiredMigrations.length;
      } catch {
        migrationsReady = false;
      }
    }
  }
  const authenticationReady = config.isSupabaseAuthConfigured() || config.isAuthConfigured();
  const ready = databaseReady && migrationsReady && authenticationReady;
  return res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    checks: {
      database: databaseStatus,
      migrations: migrationsReady ? 'current' : 'pending',
      authentication: authenticationReady ? 'configured' : 'not_configured',
      documents: config.isSupabaseStorageConfigured() ? 'configured' : 'pending_configuration',
      evolutionN8n: config.isN8nInboundConfigured() ? 'secret_configured' : 'pending_configuration'
    }
  });
});

app.use(authRoutes);
app.use(tenantRoutes);
app.use(unitRoutes);
app.use(financeRoutes);
app.use(operationsRoutes);
app.use(reviewRoutes);
app.use(integrationRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'API_ROUTE_NOT_FOUND', message: 'Rota da API não encontrada.' } }));
app.get('/manifest.webmanifest', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
  res.type('application/manifest+json');
  res.sendFile(path.join(frontendDirectory, 'manifest.webmanifest'), { cacheControl: false });
});
app.get('/sw.js', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
  res.setHeader('Service-Worker-Allowed', '/');
  res.type('application/javascript');
  res.sendFile(path.join(frontendDirectory, 'sw.js'), { cacheControl: false });
});
app.use(['/offline.html', '/css/offline.css', '/assets/pwa'], (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
  next();
});
app.get('/', (_req, res) => res.sendFile(path.join(frontendDirectory, 'index.html')));
app.use(express.static(frontendDirectory, { fallthrough: true, index: false, maxAge: config.port === 3000 ? 0 : 0 }));
app.use((_req, res) => res.status(404).send('Página não encontrada.'));

app.use((error, req, res, _next) => {
  if (res.headersSent) return;
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Envie um objeto JSON válido.' } });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'O envio excede o limite permitido.' } });
  }
  if (error.code === '23503') {
    return res.status(400).json({ error: { code: 'INVALID_RELATION', message: 'Um dos registros relacionados não pertence a este condomínio.' } });
  }
  if (error.code === '23505') {
    return res.status(409).json({ error: { code: 'DUPLICATE_RECORD', message: 'Este registro já existe.' } });
  }
  if (error.code === 'EXPENSE_NOT_FOUND' || error.code === 'ANNOUNCEMENT_NOT_FOUND' || error.code === 'REVIEW_ITEM_NOT_FOUND') {
    return res.status(404).json({ error: { code: error.code, message: 'O registro solicitado não foi encontrado.' } });
  }
  if (error.code === 'EXPENSE_ALREADY_REVIEWED' || error.code === 'ANNOUNCEMENT_NOT_PUBLISHABLE' || error.code === 'REVIEW_ITEM_ALREADY_HANDLED') {
    return res.status(409).json({ error: { code: error.code, message: 'O registro já foi processado ou não permite esta ação.' } });
  }
  if (error.code === 'SUPPLIER_DUPLICATE') {
    return res.status(409).json({ error: { code: error.code, message: 'Já existe um prestador semelhante por nome, empresa ou telefone.' } });
  }
  if (error.code === 'FUND_NOT_FOUND' || error.code === 'SUPPLIER_NOT_FOUND') {
    return res.status(404).json({ error: { code: error.code, message: 'O registro relacionado não pertence a este condomínio.' } });
  }
  if (error.code === 'DATABASE_URL_NOT_CONFIGURED' || error.message === 'DATABASE_URL não está configurada.') {
    return res.status(503).json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'O banco de dados ainda não está configurado.' } });
  }
  if (error.code === 'DATABASE_URL_INVALID' || error.code === 'DATABASE_TLS_REQUIRED') {
    return res.status(503).json({ error: { code: 'DATABASE_CONFIGURATION_INVALID', message: 'A configuração DATABASE_URL precisa ser uma connection string PostgreSQL válida do Supabase com TLS habilitado.' } });
  }
  if (error.code === '42P01') {
    return res.status(503).json({ error: { code: 'DATABASE_SCHEMA_NOT_READY', message: 'O schema do banco ainda não foi aplicado. Execute as migrations e tente novamente.' } });
  }
  if (error.code === 'SUPABASE_STORAGE_NOT_CONFIGURED') {
    return res.status(503).json({ error: { code: 'DOCUMENT_STORAGE_NOT_CONFIGURED', message: 'O armazenamento privado de anexos ainda não está configurado.' } });
  }
  if (error.code === 'SUPABASE_STORAGE_UNAVAILABLE') {
    return res.status(503).json({ error: { code: 'DOCUMENT_STORAGE_UNAVAILABLE', message: 'Não foi possível acessar o anexo. Tente novamente.' } });
  }
  if (isDatabaseConnectionError(error)) {
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Não foi possível conectar ao banco de dados. Verifique a DATABASE_URL e tente novamente.' } });
  }
  if (error.message === 'SUPABASE_AUTH_UNAVAILABLE' || error.message === 'SUPABASE_AUTH_NOT_CONFIGURED') {
    return res.status(503).json({ error: { code: 'AUTH_PROVIDER_UNAVAILABLE', message: 'O serviço de autenticação está indisponível. Tente novamente.' } });
  }
  process.stderr.write(`Erro interno ${req.id}: ${error.code || 'UNEXPECTED_ERROR'}\n`);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a solicitação.' }, requestId: req.id });
});

module.exports = { app };
