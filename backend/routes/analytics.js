const express = require('express');
const router = express.Router();
const { readDB } = require('../db');

router.get('/', (req, res) => {
  const db = readDB();
  const agentUsage = {};
  const agentTokens = {};
  let tasksRun = 0;
  let successCount = 0;
  let failCount = 0;
  let totalTokens = 0;
  const activity = [];
  const dayCounts = {};

  db.conversations.forEach((c) => {
    c.messages.forEach((m, i) => {
      if (m.role !== 'assistant') return;
      tasksRun += 1;
      if (m.ok === false) failCount += 1;
      else successCount += 1;

      if (m.tokenUsage && m.tokenUsage.totalTokens) totalTokens += m.tokenUsage.totalTokens;

      (m.agentTraces || []).forEach((t) => {
        agentTokens[t.agent] = (agentTokens[t.agent] || 0) + (t.tokens || 0);
      });

      (m.agents || []).forEach((a) => {
        agentUsage[a] = (agentUsage[a] || 0) + 1;
      });
      if ((m.agents || []).length) {
        agentUsage.planner = (agentUsage.planner || 0) + 1;
        agentUsage.verifier = (agentUsage.verifier || 0) + 1;
      }

      const day = (m.time || c.createdAt || '').slice(0, 10);
      if (day) dayCounts[day] = (dayCounts[day] || 0) + 1;

      const prevUserMsg = c.messages[i - 1];
      activity.push({
        query: (prevUserMsg && prevUserMsg.content) || c.title,
        agents: m.agents || [],
        ok: m.ok !== false,
        tokens: m.tokenUsage ? m.tokenUsage.totalTokens : 0,
        time: m.time
      });
    });
  });

  activity.sort((a, b) => new Date(b.time) - new Date(a.time));

  const today = new Date();
  const dailyActivity = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dailyActivity.push({ date: key, count: dayCounts[key] || 0 });
  }

  res.json({
    tasksRun,
    successCount,
    failCount,
    successRate: tasksRun ? Math.round((successCount / tasksRun) * 100) : 100,
    agentUsage,
    agentTokens,
    totalTokens,
    avgTokensPerTask: tasksRun ? Math.round(totalTokens / tasksRun) : 0,
    activity: activity.slice(0, 20),
    dailyActivity,
    conversationCount: db.conversations.length,
    memoryCount: (db.memory || []).length
  });
});

module.exports = router;