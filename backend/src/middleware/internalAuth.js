const crypto = require('crypto');

/**
 * Auth for service-to-service internal endpoints (ai-coach → backend), per
 * the single-writer plan in development/mongodb-collections.md §8.
 *
 * X-Internal-Key shared secret, timing-safe compare. The same INTERNAL_API_KEY
 * secret already authenticates the cron → ai-coach direction (render.yaml);
 * reusing it for coach → backend is deliberate — one secret, both directions.
 * Unset key = internal endpoints disabled (403).
 */
const internalAuth = (req, res, next) => {
  const expected = process.env.INTERNAL_API_KEY;
  const provided = req.get('X-Internal-Key');

  if (!expected || !provided) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const expectedBuf = Buffer.from(String(expected));
  const providedBuf = Buffer.from(String(provided));
  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  next();
};

module.exports = { internalAuth };
