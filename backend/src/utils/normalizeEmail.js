const validator = require('validator');

/**
 * Canonical email normalization used across EVERY auth path
 * (register, login, and Google OAuth) so the same human's address resolves to
 * one account no matter which path created it.
 *
 * It delegates to `validator.normalizeEmail` with the library defaults — the
 * SAME canonicalization express-validator's `.normalizeEmail()` applied before
 * this refactor. That means:
 *   - lowercases the address,
 *   - for Gmail/Googlemail: strips dots and `+subaddress` (foo.bar+x@gmail.com
 *     → foobar@gmail.com) — these are literally the same inbox, so this
 *     collapses same-inbox duplicates,
 *   - strips `+subaddress` for outlook/yahoo/icloud,
 *   - leaves other providers' local parts untouched (dots preserved).
 *
 * TRADEOFF (intentional): the stored/displayed email is the *canonical* form,
 * not necessarily the exact string the user typed (e.g. a Gmail user who typed
 * `John.Doe@gmail.com` is stored as `johndoe@gmail.com`). We accept this
 * because consistent canonicalization is what prevents duplicate accounts, and
 * because it also keeps `+tag` addresses valid against the User schema's email
 * regex (which rejects `+`). Using a lighter normalizer in only some paths is
 * exactly what caused Google and local sign-in to create two separate accounts.
 *
 * NOTE: `normalizeEmail` returns `false` for input it considers invalid; in
 * that case we fall back to a trimmed-lowercase value so downstream `isEmail`
 * validation / schema validation produces the real error message.
 *
 * @param {string} email
 * @returns {string}
 */
module.exports = (email) => {
  const raw = String(email || '').trim();
  const normalized = validator.normalizeEmail(raw);
  return normalized === false ? raw.toLowerCase() : normalized;
};
