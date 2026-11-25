'use strict';

// Proteção básica por processo. Para múltiplas réplicas, usar limitador compartilhado.
function rateLimit({ limit = 180, windowMs = 60000 } = {}) {
  const buckets = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of buckets) if (value.resetAt <= now) buckets.delete(key);
  }, windowMs);
  cleanup.unref();
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (buckets.size >= 10000) return res.status(503).json({ error: { code: 'RATE_LIMIT_CAPACITY', message: 'Tente novamente em instantes.' } });
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Muitas solicitações. Aguarde um instante e tente novamente.' } });
    }
    return next();
  };
}

module.exports = { rateLimit };
