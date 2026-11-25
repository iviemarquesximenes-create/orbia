'use strict';

const { Pool } = require('pg');
const { config } = require('./config');

let pool = null;

function getPool() {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL não está configurada.');
  }
  if (pool) return pool;

  const uri = new URL(config.databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(uri.protocol)) {
    throw new Error('DATABASE_URL precisa usar o protocolo PostgreSQL.');
  }
  const sslMode = uri.searchParams.get('sslmode')?.toLowerCase();
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (sslMode === 'disable' && !localHosts.has(uri.hostname)) {
    throw new Error('Conexões PostgreSQL remotas precisam de TLS.');
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
