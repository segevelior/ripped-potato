/**
 * EmbeddingService — turns text into OpenAI embedding vectors.
 *
 * Used to embed exercises (on write, via the Exercise pre-save hook) and to
 * embed ad-hoc query text. Self-managed: we own the vector and store it on the
 * exercise document, then query it with Atlas $vectorSearch.
 *
 * Fail-soft by design: callers should treat a null return as "no embedding
 * available" and never block CRUD on an embedding failure.
 */

const OpenAI = require('openai');

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIMS = parseInt(process.env.EMBEDDING_DIMS || '1536', 10);

// Lazily construct the client so the module is importable without a key
// (e.g. in tests / local dev where embeddings are disabled).
let client = null;
function getClient() {
  if (client) return client;
  if (!process.env.OPENAI_API_KEY) return null;
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/**
 * Generate an embedding for a single string.
 * @param {string} text
 * @returns {Promise<number[]|null>} the vector, or null on empty input / failure
 */
async function generateEmbedding(text) {
  const input = (text || '').trim();
  if (!input) return null;

  const openai = getClient();
  if (!openai) {
    console.warn('[EmbeddingService] OPENAI_API_KEY not set — skipping embedding');
    return null;
  }

  try {
    const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input, dimensions: EMBEDDING_DIMS });
    return res.data[0].embedding;
  } catch (err) {
    // Fail-soft: log and return null so the caller can proceed without a vector.
    console.error('[EmbeddingService] embedding failed:', err.message);
    return null;
  }
}

/**
 * Generate embeddings for many strings in one request (used by the backfill).
 * Returns an array aligned with `texts`; individual entries are null on empty
 * input, and the whole call returns null on API failure.
 * @param {string[]} texts
 * @returns {Promise<(number[]|null)[]|null>}
 */
async function generateEmbeddings(texts) {
  const inputs = texts.map((t) => (t || '').trim());
  const nonEmpty = inputs.filter(Boolean);
  if (nonEmpty.length === 0) return inputs.map(() => null);

  const openai = getClient();
  if (!openai) {
    console.warn('[EmbeddingService] OPENAI_API_KEY not set — skipping embeddings');
    return null;
  }

  try {
    // OpenAI preserves input order in the response; map back onto the originals,
    // leaving null for the empty inputs we didn't send.
    const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: nonEmpty, dimensions: EMBEDDING_DIMS });
    let i = 0;
    return inputs.map((t) => (t ? res.data[i++].embedding : null));
  } catch (err) {
    console.error('[EmbeddingService] batch embedding failed:', err.message);
    return null;
  }
}

module.exports = {
  generateEmbedding,
  generateEmbeddings,
  EMBEDDING_MODEL,
  EMBEDDING_DIMS
};
