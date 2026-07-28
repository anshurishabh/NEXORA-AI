const express = require('express');
const router = express.Router();
const { readDB, writeDB } = require('../db');

// GET /api/memory — list saved facts/preferences
router.get('/', (req, res) => {
  const db = readDB();
  res.json({ memory: db.memory || [] });
});

// POST /api/memory — add a new note (e.g. "I prefer answers in Hinglish")
router.post('/', (req, res) => {
  const { note } = req.body || {};
  if (!note || !note.trim()) {
    return res.status(400).json({ error: 'note is required' });
  }
  const db = readDB();
  if (!db.memory) db.memory = [];
  db.memory.push({ id: 'mem_' + Date.now(), text: note.trim(), createdAt: new Date().toISOString() });
  writeDB(db);
  res.json({ memory: db.memory });
});

// DELETE /api/memory/:id — remove a note
router.delete('/:id', (req, res) => {
  const db = readDB();
  db.memory = (db.memory || []).filter((m) => m.id !== req.params.id);
  writeDB(db);
  res.json({ memory: db.memory });
});

module.exports = router;