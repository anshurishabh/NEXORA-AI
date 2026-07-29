const express = require('express');
const router = express.Router();
const { readDB, writeDB } = require('../db');

function makeId() {
  return 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function computeNextRun(frequency, from) {
  const base = from ? new Date(from) : new Date();
  if (frequency === 'hourly') base.setHours(base.getHours() + 1);
  else base.setDate(base.getDate() + 1); // daily default
  return base.toISOString();
}

router.get('/', (req, res) => {
  const db = readDB();
  res.json({ schedules: db.schedules || [] });
});

router.post('/', (req, res) => {
  const { query, frequency } = req.body || {};
  if (!query || !query.trim()) return res.status(400).json({ error: 'query is required' });
  const freq = frequency === 'hourly' ? 'hourly' : 'daily';

  const db = readDB();
  if (!db.schedules) db.schedules = [];
  const schedule = {
    id: makeId(),
    query: query.trim(),
    frequency: freq,
    active: true,
    createdAt: new Date().toISOString(),
    lastRun: null,
    nextRun: computeNextRun(freq)
  };
  db.schedules.push(schedule);
  writeDB(db);
  res.json({ schedule });
});

router.patch('/:id', (req, res) => {
  const db = readDB();
  const s = (db.schedules || []).find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Schedule not found' });
  if (typeof req.body.active === 'boolean') s.active = req.body.active;
  writeDB(db);
  res.json({ schedule: s });
});

router.delete('/:id', (req, res) => {
  const db = readDB();
  db.schedules = (db.schedules || []).filter((s) => s.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;