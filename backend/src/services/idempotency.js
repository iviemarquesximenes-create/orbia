'use strict';

const { createHash } = require('node:crypto');

function requestHash(normalizedPayload) {
  return createHash('sha256').update(JSON.stringify(normalizedPayload)).digest('hex');
}

module.exports = { requestHash };
