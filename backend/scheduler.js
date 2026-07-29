/**
 * Background loop — checks every 60s for scheduled tasks whose nextRun has
 * passed, runs them through the same multi-agent pipeline as the Console,
 * and saves the result as a normal conversation (prefixed "[Scheduled]").
 *
 * IMPORTANT: this only runs while the backend process (`npm start`) is
 * actively running — it is not a system-level cron job.
 */
const { readDB, writeDB } = require('./db');

function computeNextRun(frequency, from) {
  const base = from ? new Date(from) : new Date();
  if (frequency === 'hourly') base.setHours(base.getHours() + 1);
  else base.setDate(base.getDate() + 1);
  return base.toISOString();
}

function makeId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

async function runDueSchedules() {
  // Lazy-require to avoid a circular dependency with routes/orchestrate.js
  const { runOrchestration } = require('./routes/orchestrate');

  const db = readDB();
  const schedules = db.schedules || [];
  const now = new Date();
  let changed = false;

  for (const s of schedules) {
    if (!s.active) continue;
    if (new Date(s.nextRun) > now) continue;

    changed = true;
    try {
      const result = await runOrchestration(s.query, {});
      const convo = {
        id: makeId(),
        title: ('[Scheduled] ' + s.query).slice(0, 48),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [
          { role: 'user', content: s.query, time: new Date().toISOString() },
          {
            role: 'assistant',
            content: result.responseText,
            agents: result.agents,
            agentTraces: result.agentTraces.map((t) => ({ agent: t.agent, provider: t.provider, ok: t.ok, tokens: t.tokens || 0 })),
            ok: true,
            tokenUsage: result.usage,
            time: new Date().toISOString()
          }
        ]
      };
      db.conversations.unshift(convo);
      s.lastRun = new Date().toISOString();
    } catch (err) {
      console.error('[scheduler] Task "' + s.query + '" failed:', err.message);
      s.lastRun = new Date().toISOString();
    }
    s.nextRun = computeNextRun(s.frequency, now);
  }

  if (changed) writeDB(db);
}

function startScheduler() {
  // Check every 60 seconds
  setInterval(() => {
    runDueSchedules().catch((err) => console.error('[scheduler] loop error:', err.message));
  }, 60 * 1000);
  console.log('[scheduler] Background scheduler started (checks every 60s).');
}

module.exports = { startScheduler };