const mongoose = require('mongoose');

/**
 * READ-ONLY mirror of the ai-coach service's cross-user cache that resolves
 * free-text sport labels ("triathlon", "ninja") to canonical disciplines.
 * Written exclusively by ai-coach-service (interest_mix.py) — Node reads it
 * to interest-filter common session templates and must never write to it or
 * call an LLM to fill misses; an unresolved label simply contributes nothing.
 */
const sportInterestResolutionSchema = new mongoose.Schema({
  label: { type: String, index: true },
  disciplines: [String],
  source: String,
}, { collection: 'sportinterestresolutions', strict: false });

module.exports = mongoose.model('SportInterestResolution', sportInterestResolutionSchema);
