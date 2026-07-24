const rateLimitBuckets = new Map();
let lastCleanupAt = 0;

function cleanupExpiredBuckets(now = Date.now()) {
  if (now - lastCleanupAt < 60000 && rateLimitBuckets.size < 10000) return;

  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
  lastCleanupAt = now;
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ].join('; ')
  );
  next();
}

function clientAddress(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function createRateLimiter(options) {
  const windowMs = Math.max(Number(options.windowMs) || 60000, 1000);
  const max = Math.max(Number(options.max) || 60, 1);
  const prefix = options.prefix || 'request';
  const methods = options.methods ? new Set(options.methods) : null;

  return (req, res, next) => {
    if (methods && !methods.has(req.method)) {
      next();
      return;
    }

    const now = Date.now();
    cleanupExpiredBuckets(now);
    const key = `${prefix}:${clientAddress(req)}`;
    let bucket = rateLimitBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      rateLimitBuckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(max - bucket.count, 0);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ message: '请求过于频繁，请稍后再试' });
      return;
    }

    next();
  };
}

function clearRateLimitBuckets() {
  rateLimitBuckets.clear();
  lastCleanupAt = 0;
}

module.exports = {
  clearRateLimitBuckets,
  createRateLimiter,
  securityHeaders
};
