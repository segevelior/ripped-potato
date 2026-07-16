const mongoose = require('mongoose');

/**
 * Cache of free-text sport queries resolved to ESPN league feeds, shared
 * across users so each distinct input pays for at most one LLM resolve.
 *
 * Successes are permanent. Failures are cached only when they are a fact
 * about the query (LLM said unmatched, or every candidate was a dead feed) —
 * with a TTL so ESPN catalog changes eventually get a fresh look. Network
 * failures and deadline aborts are never cached (see SportResolverService).
 */
const sportResolutionSchema = new mongoose.Schema({
  normalizedQuery: {
    type: String,
    required: true,
    unique: true
  },
  originalQuery: String,
  resolved: {
    type: Boolean,
    required: true
  },
  label: String,
  // Validated bare ESPN league slugs, e.g. "racing/irl"
  feeds: {
    type: [String],
    default: []
  },
  // 'llm' = resolved via the league-map endpoint; 'seed' = pre-v2 legacy
  // sport slugs seeded by the migration script.
  source: {
    type: String,
    enum: ['llm', 'seed'],
    default: 'llm'
  },
  attempts: Number,
  hitCount: {
    type: Number,
    default: 0
  },
  lastUsedAt: Date,
  // Set only on resolved:false docs so cached failures expire.
  expiresAt: Date
}, {
  timestamps: true
});

sportResolutionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SportResolution', sportResolutionSchema);
