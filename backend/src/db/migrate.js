'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { getPool, closePool } = require('../lib/db');

async function runMigrations() {
  const pool = getPool();
  const connection = await pool.connect();
  try {
    await connection.query('CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const { rows: appliedRows } = await connection.query('SELECT name FROM public.schema_migrations');
    const applied = new Set(appliedRows.map((row) => row.name));
    const directory = path.resolve(__dirname, '../../../database/supabase');
    const files = (await fs.readdir(directory)).filter((name) => name.endsWith('.sql')).sort();

    for (const name of files) {
      if (applied.has(name)) continue;
      const sql = await fs.readFile(path.join(directory, name), 'utf8');
      await connection.query('BEGIN');
      try {
        await connection.query(sql);
        await connection.query('INSERT INTO public.schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
        await connection.query('COMMIT');
        process.stdout.write(`Migration aplicada: ${name}\n`);
      } catch (error) {
        await connection.query('ROLLBACK');
        throw error;
      }
    }
    return { applied: files.filter((name) => !applied.has(name)).length, total: files.length };
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(async (result) => {
      process.stdout.write(`Migrations concluídas: ${result.applied} nova(s), ${result.total} no total.\n`);
      await closePool();
    })
    .catch(async (error) => {
      process.stderr.write(`Falha ao executar migrations: ${error.code || 'DATABASE_ERROR'}\n`);
      await closePool();
      process.exitCode = 1;
    });
}

module.exports = { runMigrations };
