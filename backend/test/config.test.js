'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');
const { assertPort } = require('../src/lib/config');

const root = path.resolve(__dirname, '../..');

test('aceita portas TCP válidas, inclusive as atribuídas pelo ambiente serverless', () => {
  for (const port of [0, 80, 443, 3000, 65535]) {
    assert.equal(assertPort(port), port);
  }
  for (const port of [-1, 65536, Number.NaN, 3000.5]) {
    assert.throws(() => assertPort(port), /PORT precisa ser um inteiro entre 0 e 65535/);
  }
});

test('importar a aplicação Express no Vercel não exige abrir um socket local', () => {
  const appType = execFileSync(process.execPath, ['-e', 'process.stdout.write(typeof require("./index"))'], {
    cwd: root,
    env: { ...process.env, PORT: '0' },
    encoding: 'utf8'
  });
  assert.equal(appType, 'function');
});

test('servidor tradicional informa PORT inválida ao iniciar, não durante migrations/imports', () => {
  const result = spawnSync(process.execPath, ['-e', 'require("./backend/src/server")'], {
    cwd: root,
    env: { ...process.env, PORT: '65536' },
    encoding: 'utf8'
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PORT precisa ser um inteiro entre 0 e 65535/);
});
