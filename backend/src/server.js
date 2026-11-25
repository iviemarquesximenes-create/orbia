'use strict';

const { app } = require('./app');
const { config, assertPort } = require('./lib/config');

const port = assertPort(config.port);
const server = app.listen(port, '0.0.0.0', () => {
  process.stdout.write(`ORBIA HTTP ativo na porta ${port}.\n`);
});

server.on('error', (error) => {
  process.stderr.write(`Falha ao iniciar ORBIA: ${error.code || 'SERVER_ERROR'}\n`);
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
