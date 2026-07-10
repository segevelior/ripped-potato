/**
 * Canonical email normalization used across EVERY auth path
 * (register, login, and Google OAuth) so the same human's address resolves to
 * one account no matter which path created it.
 *
 * It only **trims and lowercases** — deliberately NOT stripping Gmail dots or
 * `+subaddress`. This is the key property: the normalized value equals what
 * the schema stores (the User email field is `lowercase: true` + `trim`), so a
 * login lookup for `segev.elior@gmail.com` matches an account stored as
 * `segev.elior@gmail.com`.
 *
 * An earlier version delegated to `validator.normalizeEmail`, which canonicalizes
 * Gmail addresses by stripping dots (`segev.elior@gmail.com` → `segevelior@…`).
 * That broke sign-in: the lookup was canonicalized but the stored email was not,
 * so they never matched. Applying the SAME light rule everywhere still fixes the
 * original bug (Google vs. local creating two accounts), because both paths now
 * produce the identical stored/queried string.
 *
 * TRADEOFF (accepted): Gmail dot-variants (`foo.bar@gmail.com` vs
 * `foobar@gmail.com`) are treated as distinct addresses. In practice each user
 * types their address consistently, so this is a minor, defensible edge case —
 * and far less harmful than canonicalizing lookups away from stored data.
 *
 * @param {string} email
 * @returns {string}
 */
module.exports = (email) => String(email || '').trim().toLowerCase();
