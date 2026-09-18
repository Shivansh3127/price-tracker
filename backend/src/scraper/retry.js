// backend/src/scraper/retry.js
// Exponential backoff retry utility.
//
// Usage:
//   const result = await withRetry(async () => { ... }, { maxAttempts: 3 });
//   result => { value, attempts, lastError }

'use strict';

const DEFAULT_OPTIONS = {
  maxAttempts : 3,
  baseDelayMs : 1000,   // 1 s on first retry
  maxDelayMs  : 8000,   // cap at 8 s
  factor      : 2,      // exponential multiplier
};

/**
 * Runs `fn` up to `maxAttempts` times, backing off exponentially between
 * retries.  Never throws — returns { value, attempts, lastError }.
 *
 * @param {Function} fn           - async function to retry
 * @param {object}   [options]
 * @param {Function} [onRetry]    - called with (attempt, error) on each retry
 * @returns {Promise<{ value: any, attempts: number, lastError: Error|null }>}
 */
async function withRetry(fn, options = {}, onRetry = null) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError = null;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const value = await fn(attempt);
      return { value, attempts: attempt, lastError: null };
    } catch (err) {
      lastError = err;

      const isLastAttempt = attempt === opts.maxAttempts;
      if (isLastAttempt) break;

      if (onRetry) {
        try { onRetry(attempt, err); } catch (_) { /* ignore */ }
      }

      const delay = Math.min(
        opts.baseDelayMs * Math.pow(opts.factor, attempt - 1),
        opts.maxDelayMs
      );

      console.warn(
        `[retry] attempt ${attempt}/${opts.maxAttempts} failed: ${err.message}. ` +
        `Waiting ${delay}ms before next attempt.`
      );

      await sleep(delay);
    }
  }

  return { value: null, attempts: opts.maxAttempts, lastError };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { withRetry, sleep };
