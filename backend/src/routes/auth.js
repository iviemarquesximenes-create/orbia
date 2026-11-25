'use strict';

const { Router } = require('express');
const { randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const { config } = require('../lib/config');
const { getPool } = require('../lib/db');
const { apiError, asyncRoute } = require('../lib/http');
const {
  readCookie,
  sessionCookie,
  signSessionToken,
  requireAuth,
  createCsrfToken,
  setSupabaseSessionCookies,
  clearSupabaseCookies,
  supabaseRequest,
  getSupabaseUser,
  refreshSupabaseSession,
  supabaseIdentity,
  CSRF_COOKIE,
  SUPABASE_ACCESS_COOKIE,
  SUPABASE_REFRESH_COOKIE
} = require('../middleware/auth');

const router = Router();
const NONCE_COOKIE = 'orbia_oauth_nonce';

function cookie(name, value, path, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
}

function clearCookie(name, path) {
  return `${name}=; Path=${path}; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseState(state) {
  try {
    const value = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    const callback = new URL(value.redirectUri);
    if (callback.pathname !== '/auth/callback' || callback.search || callback.hash) return null;
    if (callback.protocol !== 'https:' && callback.hostname !== 'localhost' && callback.hostname !== '127.0.0.1') return null;
    if (typeof value.nonce !== 'string' || value.nonce.length < 32) return null;
    return { redirectUri: callback.toString(), origin: callback.origin, nonce: value.nonce };
  } catch {
    return null;
  }
}

router.get('/api/auth/config', (_req, res) => {
  const configured = config.isSupabaseAuthConfigured();
  return res.json({
    provider: 'Supabase',
    configured,
    ...(configured ? {
      url: config.supabaseUrl,
      publishableKey: config.supabasePublishableKey
    } : {})
  });
});

router.post('/api/auth/session', asyncRoute(async (req, res) => {
  if (!config.isSupabaseAuthConfigured()) return apiError(res, 503, 'AUTH_NOT_CONFIGURED', 'O login Supabase ainda não está configurado.');
  const accessToken = req.body?.accessToken;
  const refreshToken = req.body?.refreshToken;
  if (typeof accessToken !== 'string' || !accessToken || accessToken.length > 8192 || typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 8192) {
    return apiError(res, 400, 'INVALID_AUTH_SESSION', 'A sessão recebida do Supabase é inválida.');
  }
  const accessUser = await getSupabaseUser(accessToken);
  if (!accessUser) return apiError(res, 401, 'INVALID_AUTH_SESSION', 'A sessão do Supabase expirou. Entre novamente.');
  const session = await refreshSupabaseSession(refreshToken);
  if (!session) return apiError(res, 401, 'INVALID_AUTH_SESSION', 'A sessão do Supabase expirou. Entre novamente.');
  const refreshUser = session.user || await getSupabaseUser(session.access_token);
  if (!refreshUser || refreshUser.id !== accessUser.id) {
    return apiError(res, 401, 'INVALID_AUTH_SESSION', 'Os tokens não pertencem à mesma conta. Entre novamente.');
  }
  const csrfToken = setSupabaseSessionCookies(res, session);
  return res.json({ user: { id: accessUser.id }, csrfToken });
}));

router.post('/api/auth/start', (req, res) => {
  if (!config.isAuthConfigured()) return apiError(res, 503, 'AUTH_NOT_CONFIGURED', 'O login do ambiente ainda não está disponível.');
  const origin = req.get('origin');
  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
    if (parsedOrigin.origin !== origin || parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash) throw new Error('invalid origin');
    if (parsedOrigin.protocol !== 'https:' && parsedOrigin.hostname !== 'localhost' && parsedOrigin.hostname !== '127.0.0.1') throw new Error('https required');
  } catch {
    return apiError(res, 400, 'INVALID_ORIGIN', 'Não foi possível validar a origem do login.');
  }

  const nonce = randomBytes(32).toString('base64url');
  const redirectUri = new URL('/auth/callback', parsedOrigin.origin).toString();
  const state = Buffer.from(JSON.stringify({ redirectUri, nonce })).toString('base64');
  const portal = config.oauthPortalUrl.replace(/\/+$/, '');
  const authorization = new URL(`${portal}/app-auth`);
  authorization.searchParams.set('appId', config.manusProjectId);
  authorization.searchParams.set('redirectUri', redirectUri);
  authorization.searchParams.set('state', state);
  authorization.searchParams.set('responseType', 'code');
  res.setHeader('Set-Cookie', cookie(NONCE_COOKIE, nonce, '/auth/callback', 600));
  return res.json({ authorizationUrl: authorization.toString() });
});

router.get('/auth/callback', asyncRoute(async (req, res) => {
  const state = parseState(typeof req.query.state === 'string' ? req.query.state : '');
  const cookieNonce = readCookie(req, NONCE_COOKIE);
  res.setHeader('Set-Cookie', clearCookie(NONCE_COOKIE, '/auth/callback'));
  if (!state || !safeEqual(state.nonce, cookieNonce)) return res.redirect('/login.html?error=invalid_state');
  if (typeof req.query.code !== 'string' || req.query.code.length > 4096) return res.redirect('/login.html?error=missing_code');

  try {
    const apiBase = config.oauthApiUrl.replace(/\/+$/, '');
    const tokenResponse = await fetch(`${apiBase}/webdev.v1.WebDevAuthPublicService/ExchangeToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: config.manusProjectId, grantType: 'authorization_code', code: req.query.code, redirectUri: state.redirectUri })
    });
    if (!tokenResponse.ok) throw new Error('OAUTH_EXCHANGE_FAILED');
    const tokens = await tokenResponse.json();
    if (typeof tokens.accessToken !== 'string' || !tokens.accessToken) throw new Error('OAUTH_TOKEN_MISSING');

    const identityResponse = await fetch(`${apiBase}/webdev.v1.WebDevAuthPublicService/GetUserInfo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: tokens.accessToken })
    });
    if (!identityResponse.ok) throw new Error('OAUTH_IDENTITY_FAILED');
    const identity = await identityResponse.json();
    if (typeof identity.openId !== 'string' || !identity.openId || identity.openId.length > 191) throw new Error('OAUTH_OPEN_ID_MISSING');

    await getPool().query(
      `INSERT INTO users (id, manus_open_id, display_name, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (manus_open_id) DO UPDATE
         SET display_name = EXCLUDED.display_name, email = EXCLUDED.email, updated_at = now()`,
      [randomUUID(), identity.openId, String(identity.name || 'Usuário ORBIA').slice(0, 180), identity.email ? String(identity.email).slice(0, 254) : null]
    );
    const signed = signSessionToken({ openId: identity.openId, name: identity.name || '', email: identity.email || '' });
    res.setHeader('Set-Cookie', [clearCookie(NONCE_COOKIE, '/auth/callback'), sessionCookie(signed, 60 * 60 * 24 * 7)]);
    return res.redirect(new URL('/', state.origin).toString());
  } catch {
    return res.redirect('/login.html?error=oauth_failed');
  }
}));

router.post('/api/auth/logout', requireAuth, asyncRoute(async (req, res) => {
  if (req.supabaseAuthenticated) {
    const refreshToken = readCookie(req, SUPABASE_REFRESH_COOKIE);
    if (refreshToken) {
      const { response } = await supabaseRequest('logout', {
        method: 'POST',
        token: req.supabaseAccessToken
      });
      if (!response.ok) return apiError(res, 503, 'AUTH_PROVIDER_UNAVAILABLE', 'Não foi possível encerrar a sessão no Supabase. Tente novamente.');
    }
    clearSupabaseCookies(res);
  }
  res.append('Set-Cookie', [clearCookie('webdev_app_session', '/'), clearCookie(NONCE_COOKIE, '/auth/callback')]);
  return res.json({ ok: true });
}));

router.get('/api/auth/me', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT t.id, t.name, t.is_demo, m.role
     FROM memberships m JOIN tenants t ON t.id = m.tenant_id
     WHERE m.user_id = $1 AND m.status = 'active' AND t.status = 'active'
     ORDER BY t.name`,
    [req.user.id]
  );
  const csrfToken = req.supabaseAuthenticated
    ? req.csrfToken || readCookie(req, CSRF_COOKIE)
    : createCsrfToken(req.identity.openId);
  return res.json({ user: { id: req.user.id, name: req.user.display_name, email: req.user.email }, csrfToken, tenants: rows.map((row) => ({ id: row.id, name: row.name, isDemo: Boolean(row.is_demo), role: row.role })) });
}));

module.exports = router;
