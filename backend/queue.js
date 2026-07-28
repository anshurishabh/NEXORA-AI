/**
 * Simple concurrency-limited queue + retry-with-backoff for all Groq calls.
 * Prevents firing too many parallel requests at once (which trips free-tier
 * rate limits), and automatically retries if Groq responds with a rate-limit
 * error, waiting a bit longer each time.
 */

const MAX_CONCURRENT = 3;
let activeCount = 0;
const waiting = [];

function next() {
  if (activeCount >= MAX_CONCURRENT || waiting.length === 0) return;
  const job = waiting.shift();
  activeCount++;
  job.fn()
    .then(job.resolve, job.reject)
    .finally(() => {
      activeCount--;
      next();
    });
}

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    waiting.push({ fn, resolve, reject });
    next();
  });
}

async function withRetry(fn, retries, delayMs) {
  const maxRetries = retries === undefined ? 2 : retries;
  const baseDelay = delayMs === undefined ? 1200 : delayMs;
  try {
    return await fn();
  } catch (err) {
    const msg = ((err && err.message) || '').toLowerCase();
    const isRateLimit = msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests');
    if (maxRetries > 0 && isRateLimit) {
      await new Promise((r) => setTimeout(r, baseDelay));
      return withRetry(fn, maxRetries - 1, baseDelay * 2);
    }
    throw err;
  }
}

// Use for normal (non-streaming) calls — queued AND retried on rate limits.
function queuedCall(fn) {
  return enqueue(() => withRetry(fn));
}

// Use for streaming calls — queued only (no retry, since tokens may have
// already been sent to the client and re-running would duplicate them).
function queuedStream(fn) {
  return enqueue(fn);
}

function queueStatus() {
  return { active: activeCount, waiting: waiting.length, maxConcurrent: MAX_CONCURRENT };
}

module.exports = { queuedCall, queuedStream, queueStatus };