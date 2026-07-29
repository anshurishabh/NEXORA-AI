/**
 * Simple in-memory response cache. Only used for context-free queries (no
 * chat history, no memory, no attachment) — safe to reuse verbatim, and
 * saves a full multi-agent run (which otherwise costs several Groq calls)
 * on repeated/common questions. Resets when the backend restarts.
 */

const store = new Map();
const TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES = 300;

function normalizeKey(query) {
  return (query || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getCached(query) {
  const key = normalizeKey(query);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(query, data) {
  const key = normalizeKey(query);
  store.set(key, { data, time: Date.now() });
  if (store.size > MAX_ENTRIES) {
    store.delete(store.keys().next().value);
  }
}

function cacheStats() {
  return { size: store.size, ttlMinutes: TTL_MS / 60000 };
}

module.exports = { getCached, setCached, cacheStats };