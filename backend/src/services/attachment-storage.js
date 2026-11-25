'use strict';

const { config } = require('../lib/config');

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp'
]);
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_MESSAGE = 5;

function isAllowedAttachmentType(type) {
  return ALLOWED_ATTACHMENT_TYPES.has(type);
}

function isTenantStoragePath(storagePath, tenantId) {
  return typeof storagePath === 'string'
    && new RegExp(`^${tenantId}/whatsapp/[a-f0-9]{64}$`).test(storagePath);
}

function normalizeAttachments(value, tenantId) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS_PER_MESSAGE) return null;

  const attachments = [];
  for (const entry of value) {
    const storagePath = typeof entry?.storage_path === 'string' ? entry.storage_path.trim() : '';
    const fileName = typeof entry?.file_name === 'string'
      ? entry.file_name.trim().replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180)
      : '';
    const mimeType = typeof entry?.mime_type === 'string' ? entry.mime_type.trim().toLowerCase() : '';
    const sizeBytes = entry?.size_bytes;
    if (
      !isTenantStoragePath(storagePath, tenantId)
      || !fileName
      || !isAllowedAttachmentType(mimeType)
      || !Number.isSafeInteger(sizeBytes)
      || sizeBytes < 1
      || sizeBytes > MAX_ATTACHMENT_BYTES
    ) return null;
    attachments.push({ storagePath, fileName, mimeType, sizeBytes });
  }
  return attachments;
}

function storageError(code, message) {
  return Object.assign(new Error(message), { code });
}

function storageObjectUrl(storagePath, operation) {
  const baseUrl = config.supabaseUrl.replace(/\/+$/, '');
  const bucket = encodeURIComponent(config.supabaseStorageBucket);
  const objectPath = storagePath.split('/').map(encodeURIComponent).join('/');
  const operationPath = operation ? `/${operation}` : '';
  return `${baseUrl}/storage/v1/object${operationPath}/${bucket}/${objectPath}`;
}

async function uploadPrivateObject(storagePath, mimeType, bytes) {
  if (!config.isSupabaseStorageConfigured()) {
    throw storageError('SUPABASE_STORAGE_NOT_CONFIGURED', 'O armazenamento privado de anexos ainda não está configurado.');
  }
  let response;
  try {
    response = await fetch(storageObjectUrl(storagePath, ''), {
      method: 'POST',
      headers: {
        apikey: config.supabaseServiceRoleKey,
        Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
        'Content-Type': mimeType,
        'x-upsert': 'true'
      },
      body: bytes,
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw storageError('SUPABASE_STORAGE_UNAVAILABLE', 'O armazenamento de anexos está indisponível.');
  }
  if (!response.ok) throw storageError('SUPABASE_STORAGE_UNAVAILABLE', 'O armazenamento de anexos está indisponível.');
}

async function createSignedAttachmentUrl(storagePath) {
  if (!config.isSupabaseStorageConfigured()) {
    throw storageError('SUPABASE_STORAGE_NOT_CONFIGURED', 'O armazenamento privado de anexos ainda não está configurado.');
  }
  let response;
  try {
    response = await fetch(storageObjectUrl(storagePath, 'sign'), {
      method: 'POST',
      headers: {
        apikey: config.supabaseServiceRoleKey,
        Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ expiresIn: 300 }),
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw storageError('SUPABASE_STORAGE_UNAVAILABLE', 'O armazenamento de anexos está indisponível.');
  }
  if (!response.ok) throw storageError('SUPABASE_STORAGE_UNAVAILABLE', 'O armazenamento de anexos está indisponível.');

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw storageError('SUPABASE_STORAGE_UNAVAILABLE', 'O armazenamento de anexos está indisponível.');
  }
  if (typeof payload?.signedURL !== 'string') {
    throw storageError('SUPABASE_STORAGE_UNAVAILABLE', 'O armazenamento de anexos está indisponível.');
  }

  let supabaseBase;
  try {
    supabaseBase = new URL(config.supabaseUrl);
  } catch {
    throw storageError('SUPABASE_STORAGE_UNAVAILABLE', 'O armazenamento de anexos está indisponível.');
  }
  let signedUrl;
  try {
    if (/^https?:\/\//i.test(payload.signedURL)) {
      signedUrl = new URL(payload.signedURL);
    } else {
      const signedPath = payload.signedURL.replace(/^\/+/, '');
      signedUrl = new URL(
        signedPath.startsWith('storage/v1/')
          ? `/${signedPath}`
          : `/storage/v1/${signedPath}`,
        supabaseBase
      );
    }
  } catch {
    throw storageError('SUPABASE_STORAGE_UNAVAILABLE', 'O armazenamento de anexos está indisponível.');
  }
  const signedObjectPrefix = `/storage/v1/object/sign/${encodeURIComponent(config.supabaseStorageBucket)}/`;
  if (signedUrl.origin !== supabaseBase.origin || !signedUrl.pathname.startsWith(signedObjectPrefix)) {
    throw storageError('SUPABASE_STORAGE_UNAVAILABLE', 'O armazenamento de anexos está indisponível.');
  }
  return signedUrl.toString();
}

module.exports = {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  isAllowedAttachmentType,
  isTenantStoragePath,
  normalizeAttachments,
  uploadPrivateObject,
  createSignedAttachmentUrl
};
