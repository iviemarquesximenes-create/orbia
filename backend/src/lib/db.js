'use strict';

const { Pool } = require('pg');
const { config } = require('./config');

let pool = null;

function databaseConfigurationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getPool() {
  if (!config.databaseUrl) {
    throw databaseConfigurationError('DATABASE_URL_NOT_CONFIGURED', 'DATABASE_URL não está configurada.');
  }
  if (pool) return pool;

  let uri;
  try {
    uri = new URL(config.databaseUrl);
  } catch {
    throw databaseConfigurationError('DATABASE_URL_INVALID', 'DATABASE_URL não é uma URL válida.');
  }
  if (!['postgres:', 'postgresql:'].includes(uri.protocol)) {
    throw databaseConfigurationError('DATABASE_URL_INVALID', 'DATABASE_URL precisa usar o protocolo PostgreSQL.');
  }
  const sslMode = uri.searchParams.get('sslmode')?.toLowerCase();
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (sslMode === 'disable' && !localHosts.has(uri.hostname)) {
    throw databaseConfigurationError('DATABASE_TLS_REQUIRED', 'Conexões PostgreSQL remotas precisam de TLS.');
  }
  uri.searchParams.delete('sslmode');
  pool = new Pool({
    connectionString: uri.toString(),
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
    ssl: sslMode === 'disable' ? false : { rejectUnauthorized: true }
  });
  return pool;
}

async function withTransaction(work) {
  const connection = await getPool().connect();
  try {
    await connection.query('BEGIN');
    const result = await work(connection);
    await connection.query('COMMIT');
    return result;
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
  }
}

async function closePool() {
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}

module.exports = { getPool, withTransaction, closePool };
