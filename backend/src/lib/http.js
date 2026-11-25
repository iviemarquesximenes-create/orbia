'use strict';

function apiError(res, status, code, message, details) {
  const body = { error: { code, message } };
  if (details && process.env.NODE_ENV !== 'production') body.error.details = details;
  return res.status(status).json(body);
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requiredText(value, maxLength = 180) {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean && clean.length <= maxLength ? clean : null;
}

function parseAmountToCents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  let text = String(value).trim().replace(/^R\$\s*/i, '');
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
}

function centsToDecimal(cents) {
  const value = BigInt(cents);
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
  const maximum = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= maximum;
}

function sqlDateTime(value) {
  if (typeof value !== 'string' || !isCalendarDate(value.slice(0, 10))) return null;
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function sqlMonth(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}(?:-01)?$/.test(value)) return null;
  const date = `${value.slice(0, 7)}-01`;
  return isCalendarDate(date) ? date : null;
}

module.exports = { apiError, asyncRoute, requiredText, parseAmountToCents, centsToDecimal, isUuid, isCalendarDate, sqlDateTime, sqlMonth };
