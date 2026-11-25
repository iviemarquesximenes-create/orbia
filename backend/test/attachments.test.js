'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MAX_ATTACHMENT_BYTES, normalizeAttachments } = require('../src/services/attachment-storage');

const tenantId = 'c63f1b6a-f278-4d34-a79f-cbd3e80c0001';
const validAttachment = {
  storage_path: `${tenantId}/whatsapp/${'a'.repeat(64)}`,
  file_name: 'comprovante.png',
  mime_type: 'image/png',
  size_bytes: 4096
};

test('normaliza referência de anexo privado vinculada ao condomínio', () => {
  assert.deepEqual(normalizeAttachments([validAttachment], tenantId), [{
    storagePath: validAttachment.storage_path,
    fileName: 'comprovante.png',
    mimeType: 'image/png',
    sizeBytes: 4096
  }]);
});

test('rejeita referências externas, MIME não permitido, tamanho inválido e quantidade excessiva', () => {
  assert.equal(normalizeAttachments([{ ...validAttachment, storage_path: 'https://example.com/receipt.png' }], tenantId), null);
  assert.equal(normalizeAttachments([{ ...validAttachment, storage_path: `other-tenant/whatsapp/${'a'.repeat(64)}` }], tenantId), null);
  assert.equal(normalizeAttachments([{ ...validAttachment, mime_type: 'text/html' }], tenantId), null);
  assert.equal(normalizeAttachments([{ ...validAttachment, size_bytes: MAX_ATTACHMENT_BYTES + 1 }], tenantId), null);
  assert.equal(normalizeAttachments(Array(6).fill(validAttachment), tenantId), null);
});
