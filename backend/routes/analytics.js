const express = require('express');
const router = express.Router();
const { readDB } = require('../db');

router.get('/', (req, res) => {
  const db = readDB();
  const agentUsage = {};
  let tasksRun = 0;
  const activity = [];

  db.conversations.forEach((c) => {
    c.messages.forEach((m, i) => {
      if (m.role !== 'assistant') return;
      tasksRun += 1;
      (m.agents || []).forEach((a) => {
        agentUsage[a] = (agentUsage[a] || 0) + 1;
      });
      agentUsage.planner = (agentUsage.planner || 0) + 1;
      agentUsage.verifier = (agentUsage.verifier || 0) + 1;

      const prevUserMsg = c.messages[i - 1];
      activity.push({
        query: (prevUserMsg && prevUserMsg.content) || c.title,
        agents: m.agents || [],
        time: m.time
      });
    });
  });

  activity.sort((a, b) => new Date(b.time) - new Date(a.time));

  res.json({
    tasksRun,
    agentUsage,
    activity: activity.slice(0, 20),
    conversationCount: db.conversations.length
  });
});

module.exports = router;
