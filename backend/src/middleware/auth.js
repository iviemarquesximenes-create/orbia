'use strict';

const { createHmac, randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const { config } = require('../lib/config');
const { getPool } = require('../lib/db');
const { apiError } = require('../lib/http');

const SESSION_COOKIE = 'webdev_app_session';
const SUPABASE_ACCESS_COOKIE = 'orbia_supabase_access';
const SUPABASE_REFRESH_COOKIE = 'orbia_supabase_refresh';
const CSRF_COOKIE = '__Host-orbia_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      try { return decodeURIComponent(part.slice(separator + 1).trim()); }
      catch { return null; }
    }
  }
  return null;
}

function decodeJwtPart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function verifySessionToken(token) {
  if (!config.manusJwtSecret || !config.manusProjectId || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = decodeJwtPart(parts[0]);
    const payload = decodeJwtPart(parts[1]);
    if (header.alg !== 'HS256' || payload.appId !== config.manusProjectId) return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (typeof payload.openId !== 'string' || payload.openId.length < 1 || payload.openId.length > 191) return null;
    const expected = createHmac('sha256', config.manusJwtSecret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
    if (!constantTimeEqual(parts[2], expected)) return null;
    return { openId: payload.openId, name: typeof payload.name === 'string' ? payload.name : '', email: typeof payload.email === 'string' ? payload.email : '' };
  } catch {
    return null;
  }
}

function createCsrfToken(openId) {
  if (!config.manusJwtSecret || typeof openId !== 'string') return '';
  return createHmac('sha256', config.manusJwtSecret).update(`orbia-csrf:${openId}`).digest('base64url');
}

function signSessionToken(identity) {
  if (!config.manusJwtSecret || !config.manusProjectId) throw new Error('AUTH_NOT_CONFIGURED');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    appId: config.manusProjectId,
    openId: identity.openId,
    name: identity.name || '',
    email: identity.email || '',
    iat: now,
    exp: now + 60 * 60 * 24 * 7
  })).toString('base64url');
  const signature = createHmac('sha256', config.manusJwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function sessionCookie(value, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAgeSeconds}`;
}

function appendCookies(res, cookies) {
  const current = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(current) ? current : current ? [current] : []), ...cookies]);
}

function supabaseCookie(name, value, maxAgeSeconds, httpOnly = true) {
  return `${name}=${encodeURIComponent(value)}; Path=/; ${httpOnly ? 'HttpOnly; ' : ''}Secure; SameSite=None; Max-Age=${maxAgeSeconds}`;
}

function clearSupabaseCookies(res) {
  appendCookies(res, [
    supabaseCookie(SUPABASE_ACCESS_COOKIE, '', 0),
    supabaseCookie(SUPABASE_REFRESH_COOKIE, '', 0),
    supabaseCookie(CSRF_COOKIE, '', 0, false)
  ]);
}

function setSupabaseSessionCookies(res, session, csrfToken = randomBytes(32).toString('base64url')) {
  const accessMaxAge = Number.isInteger(session.expires_in) && session.expires_in > 0 ? session.expires_in : 3600;
  const resolvedCsrfToken = csrfToken || randomBytes(32).toString('base64url');
  appendCookies(res, [
    supabaseCookie(SUPABASE_ACCESS_COOKIE, session.access_token, accessMaxAge),
    supabaseCookie(SUPABASE_REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 30),
    supabaseCookie(CSRF_COOKIE, resolvedCsrfToken, 60 * 60 * 24 * 30, false)
  ]);
  return resolvedCsrfToken;
}

async function supabaseRequest(path, { method = 'GET', token, body } = {}) {
  if (!config.isSupabaseAuthConfigured()) throw new Error('SUPABASE_AUTH_NOT_CONFIGURED');
  const headers = { apikey: config.supabasePublishableKey };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(`${config.supabaseUrl.replace(/\/+$/, '')}/auth/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'TypeError') throw new Error('SUPABASE_AUTH_UNAVAILABLE');
    throw error;
  }
  const raw = await response.text();
  let payload = {};
  if (raw) {
    try { payload = JSON.parse(raw); }
    catch (error) {
      if (error instanceof SyntaxError) throw new Error('SUPABASE_AUTH_UNAVAILABLE');
      throw error;
    }
  }
  return { response, payload };
}

async function getSupabaseUser(accessToken) {
  const { response, payload } = await supabaseRequest('user', { token: accessToken });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('SUPABASE_AUTH_UNAVAILABLE');
  if (!payload || typeof payload.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.id)) {
    throw new Error('SUPABASE_USER_INVALID');
  }
  return payload;
}

async function refreshSupabaseSession(refreshToken) {
  const { response, payload } = await supabaseRequest('token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: refreshToken }
  });
  if (response.status === 400 || response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('SUPABASE_AUTH_UNAVAILABLE');
  if (typeof payload?.access_token !== 'string' || typeof payload?.refresh_token !== 'string') {
    throw new Error('SUPABASE_SESSION_INVALID');
  }
  return payload;
}

function supabaseIdentity(user) {
  const metadataName = user.user_metadata?.full_name || user.user_metadata?.name;
  const name = typeof metadataName === 'string' ? metadataName : '';
  return {
    userId: user.id,
    openId: `supabase:${user.id}`,
    name: (name || user.email || 'Usuário ORBIA').slice(0, 180),
    email: typeof user.email === 'string' ? user.email.slice(0, 254) : ''
  };
}

async function ensureUser(identity) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO public.users (id, manus_open_id, display_name, email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (manus_open_id) DO UPDATE
       SET display_name = EXCLUDED.display_name, email = EXCLUDED.email, updated_at = now()
     RETURNING id, manus_open_id, display_name, email, account_type`,
    [identity.userId || randomUUID(), identity.openId, identity.name || 'Usuário ORBIA', identity.email || null]
  );
  if (!rows.length) throw new Error('AUTH_USER_NOT_FOUND');
  return rows[0];
}

async function requireAuth(req, res, next) {
  const supabaseAccess = readCookie(req, SUPABASE_ACCESS_COOKIE);
  const supabaseRefresh = readCookie(req, SUPABASE_REFRESH_COOKIE);
  const identityToken = readCookie(req, SESSION_COOKIE);
  let identity = verifySessionToken(identityToken);

  if (!identity && (supabaseAccess || supabaseRefresh)) {
    if (!config.isSupabaseAuthConfigured()) {
      return apiError(res, 503, 'AUTH_PROVIDER_UNAVAILABLE', 'O serviço de autenticação está indisponível.');
    }
    const csrf = readCookie(req, CSRF_COOKIE);
    if (!SAFE_METHODS.has(req.method) && !constantTimeEqual(req.get('x-orbia-csrf'), csrf)) {
      return apiError(res, 403, 'CSRF_VALIDATION_FAILED', 'Atualize a página e tente novamente.');
    }
    try {
      let user = supabaseAccess ? await getSupabaseUser(supabaseAccess) : null;
      let accessToken = supabaseAccess;
      if (!user && supabaseRefresh) {
        const session = await refreshSupabaseSession(supabaseRefresh);
        if (session) {
          req.csrfToken = setSupabaseSessionCookies(res, session, csrf);
          user = session.user || await getSupabaseUser(session.access_token);
          accessToken = session.access_token;
        }
      }
      if (!user) {
        clearSupabaseCookies(res);
        return apiError(res, 401, 'UNAUTHENTICATED', 'Entre na sua conta para continuar.');
      }
      identity = supabaseIdentity(user);
      req.supabaseAccessToken = accessToken;
      req.supabaseAuthenticated = true;
    } catch (error) {
      if (error.message === 'SUPABASE_AUTH_UNAVAILABLE' || error.name === 'TimeoutError') {
        return apiError(res, 503, 'AUTH_PROVIDER_UNAVAILABLE', 'O serviço de autenticação está indisponível. Tente novamente.');
      }
      return next(error);
    }
  }

  if (!identity) return apiError(res, 401, 'UNAUTHENTICATED', 'Entre na sua conta para continuar.');
  if (!req.supabaseAuthenticated && !SAFE_METHODS.has(req.method)) {
    const received = req.get('x-orbia-csrf');
    if (!constantTimeEqual(received, createCsrfToken(identity.openId))) {
      return apiError(res, 403, 'CSRF_VALIDATION_FAILED', 'Atualize a página e tente novamente.');
    }
  }
  req.identity = identity;
  try {
    req.user = await ensureUser(identity);
    return next();
  } catch (error) {
    if (error.message === 'DATABASE_URL não está configurada.') {
      return apiError(res, 503, 'DATABASE_NOT_CONFIGURED', 'O banco de dados ainda não está configurado.');
    }
    return next(error);
  }
}

module.exports = {
  SESSION_COOKIE,
  SUPABASE_ACCESS_COOKIE,
  SUPABASE_REFRESH_COOKIE,
  CSRF_COOKIE,
  readCookie,
  verifySessionToken,
  createCsrfToken,
  signSessionToken,
  sessionCookie,
  setSupabaseSessionCookies,
  clearSupabaseCookies,
  supabaseRequest,
  getSupabaseUser,
  refreshSupabaseSession,
  supabaseIdentity,
  requireAuth
};
