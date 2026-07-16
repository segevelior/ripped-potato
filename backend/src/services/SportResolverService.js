const axios = require('axios');
const SportResolution = require('../models/SportResolution');
const SportsNewsService = require('./SportsNewsService');
const { ESPN_LEAGUES, isWhitelistedSlug, getLeagueBySlug } = require('../config/sportsNews');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

const MAX_ATTEMPTS = 5;
const DEADLINE_MS = 35000;
const MAX_NETWORK_ATTEMPTS = 2;
const FAILURE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_QUERY_LENGTH = 100;

class ResolutionError extends Error {
  constructor(message, { code = 'RESOLUTION_FAILED', httpStatus = 422, attempts = 0 } = {}) {
    super(message);
    this.name = 'ResolutionError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.attempts = attempts;
  }
}

/**
 * Resolves a user's free-text sport/league interest ("MotoGP", "Israeli
 * basketball") to validated ESPN league slugs.
 *
 * The LLM lives in ai-coach-service (league-map endpoint, fast model tier);
 * this service drives the loop: propose candidates → live-validate each
 * against ESPN → feed failures back → retry, up to MAX_ATTEMPTS under an
 * overall deadline. Only feeds whose endpoint is alive are returned.
 *
 * Resolutions are cached in the sportresolutions collection (shared across
 * users). Failures are cached only when they're a fact about the query —
 * LLM unmatched, or every proposed feed was dead. Network trouble and
 * deadline aborts are never cached.
 */
class SportResolverService {
  constructor(logger = console) {
    this.logger = logger;
    this.sportsNews = new SportsNewsService(logger);
  }

  normalize(query) {
    return String(query || '').toLowerCase().trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH);
  }

  /**
   * @param {string} query - raw user input
   * @param {string} authHeader - the user's Authorization header, forwarded
   *   to ai-coach-service (standard backend→python auth)
   * @returns {Promise<{label: string, feeds: string[], cached: boolean}>}
   * @throws {ResolutionError}
   */
  async resolve(query, authHeader) {
    const normalizedQuery = this.normalize(query);
    if (!normalizedQuery) {
      throw new ResolutionError('Empty query', { code: 'INVALID_QUERY', httpStatus: 400 });
    }

    const cached = await SportResolution.findOneAndUpdate(
      { normalizedQuery },
      { $inc: { hitCount: 1 }, $set: { lastUsedAt: new Date() } },
      { new: true }
    );
    // Mongo's TTL sweep is lazy — treat an expired failure doc as a miss.
    const cacheValid = cached && (cached.resolved || !cached.expiresAt || cached.expiresAt > new Date());
    if (cacheValid) {
      if (cached.resolved) {
        return { label: cached.label, feeds: cached.feeds, cached: true };
      }
      throw new ResolutionError(`No ESPN coverage found for "${query}"`, {
        attempts: cached.attempts || 0
      });
    }

    const deadline = Date.now() + DEADLINE_MS;
    const triedAndFailed = [];
    const validFeeds = [];
    let label = null;
    let attempts = 0;
    let llmSucceeded = false;
    let sawUnmatched = false;
    let hadNetworkTrouble = false;
    let deadlineHit = false;
    let consecutiveNetworkAttempts = 0;

    while (attempts < MAX_ATTEMPTS) {
      if (Date.now() >= deadline) {
        deadlineHit = true;
        break;
      }
      attempts++;

      let mapping;
      try {
        mapping = await this.callLeagueMap(normalizedQuery, triedAndFailed, authHeader, deadline);
      } catch (error) {
        this.logger.warn(`[SportResolver] league-map call failed (attempt ${attempts}): ${error.message}`);
        hadNetworkTrouble = true;
        consecutiveNetworkAttempts++;
        if (consecutiveNetworkAttempts >= MAX_NETWORK_ATTEMPTS) break;
        continue;
      }
      llmSucceeded = true;

      if (mapping.unmatched) {
        sawUnmatched = true;
        break;
      }
      if (!label && mapping.label) label = mapping.label;

      // Slugs ai-coach filtered out server-side (hallucinated / re-proposed):
      // record them so the next attempt's context changes instead of looping.
      for (const slug of mapping.rejected || []) {
        if (!triedAndFailed.some((t) => t.slug === slug)) {
          triedAndFailed.push({ slug, error: 'rejected: not in whitelist or already tried' });
        }
      }

      const candidates = (mapping.candidates || []).filter(
        (slug) =>
          isWhitelistedSlug(slug) &&
          !validFeeds.includes(slug) &&
          !triedAndFailed.some((t) => t.slug === slug)
      );

      if (candidates.length === 0) {
        if ((mapping.rejected || []).length === 0) {
          // Nothing proposed and nothing new to feed back — retrying with
          // identical context can't improve; treat as unmatched.
          sawUnmatched = true;
          break;
        }
        continue;
      }

      let attemptHadNetwork = false;
      for (const slug of candidates) {
        if (Date.now() >= deadline) {
          deadlineHit = true;
          break;
        }
        const { status, articles, error } = await this.sportsNews.fetchFeed(slug);
        if (status === 'ok') {
          validFeeds.push(slug);
          if (articles.length > 0) {
            // Free UX win: the validation fetch already has the articles, so
            // the user's dashboard shows news immediately instead of waiting
            // for the next job run.
            const league = getLeagueBySlug(slug);
            await this.sportsNews.upsertArticles(articles, {
              feedSlug: slug,
              label: league?.name || label || normalizedQuery
            });
          }
        } else if (status === 'invalid') {
          triedAndFailed.push({ slug, error });
        } else {
          attemptHadNetwork = true;
          hadNetworkTrouble = true;
        }
      }

      if (validFeeds.length > 0 || deadlineHit) break;

      if (attemptHadNetwork) {
        consecutiveNetworkAttempts++;
        if (consecutiveNetworkAttempts >= MAX_NETWORK_ATTEMPTS) break;
      } else {
        consecutiveNetworkAttempts = 0;
      }
    }

    if (validFeeds.length > 0) {
      const finalLabel = (label || query).trim();
      await this.saveResolution(normalizedQuery, query, {
        resolved: true,
        label: finalLabel,
        feeds: validFeeds,
        attempts
      });
      return { label: finalLabel, feeds: validFeeds, cached: false };
    }

    if (!llmSucceeded) {
      throw new ResolutionError('Sport resolution service unavailable', {
        code: 'AI_SERVICE_UNAVAILABLE',
        httpStatus: 502,
        attempts
      });
    }

    // Cache the failure only when it's a fact about the query, not about
    // tonight's network: LLM said unmatched, or every attempt ended in
    // dead feeds with no timeouts and no deadline abort.
    if (sawUnmatched || (!hadNetworkTrouble && !deadlineHit)) {
      await this.saveResolution(normalizedQuery, query, {
        resolved: false,
        attempts,
        expiresAt: new Date(Date.now() + FAILURE_CACHE_MS)
      });
    }
    throw new ResolutionError(`No ESPN coverage found for "${query}"`, { attempts });
  }

  async callLeagueMap(query, triedAndFailed, authHeader, deadline) {
    const timeout = Math.max(1000, Math.min(20000, deadline - Date.now()));
    const response = await axios.post(
      `${AI_SERVICE_URL}/api/v1/news/league-map`,
      {
        query,
        whitelist: ESPN_LEAGUES.map(({ slug, name, aliases }) => ({ slug, name, aliases })),
        tried_and_failed: triedAndFailed
      },
      {
        timeout,
        headers: { 'Content-Type': 'application/json', Authorization: authHeader }
      }
    );
    return response.data;
  }

  async saveResolution(normalizedQuery, originalQuery, fields) {
    try {
      await SportResolution.findOneAndUpdate(
        { normalizedQuery },
        {
          $set: {
            originalQuery,
            source: 'llm',
            ...fields,
            // Successful resolutions never expire; clear any old failure TTL.
            ...(fields.resolved ? { expiresAt: null } : {})
          }
        },
        { upsert: true }
      );
    } catch (error) {
      // E11000 = a concurrent resolve of the same query won the upsert race.
      // Their result is as good as ours — don't fail the user's request.
      if (error.code !== 11000) throw error;
    }
  }
}

module.exports = SportResolverService;
module.exports.ResolutionError = ResolutionError;
module.exports.MAX_ATTEMPTS = MAX_ATTEMPTS;
module.exports.DEADLINE_MS = DEADLINE_MS;
