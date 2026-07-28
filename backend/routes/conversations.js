const express = require('express');
const router = express.Router();
const { readDB, writeDB } = require('../db');

function makeId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

router.get('/', (req, res) => {
  const db = readDB();
  const list = db.conversations
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c.messages.length
    }));
  res.json({ conversations: list });
});

router.delete('/', (req, res) => {
  const db = readDB();
  db.conversations = [];
  writeDB(db);
  res.json({ ok: true });
});

// GET /api/conversations/:id/export?format=txt|md — download one chat
router.get('/:id/export', (req, res) => {
  const db = readDB();
  const convo = db.conversations.find((c) => c.id === req.params.id);
  if (!convo) return res.status(404).json({ error: 'Conversation not found' });

  const safeName = (convo.title || 'chat').replace(/[^a-z0-9]/gi, '_').slice(0, 40) || 'chat';
  const format = req.query.format === 'md' ? 'md' : 'txt';

  let out = '';
  if (format === 'md') {
    out += '# ' + convo.title + '\n\n_Exported from NEXORA AI on ' + new Date().toLocaleString() + '_\n\n---\n\n';
    convo.messages.forEach((m) => {
      out += '**' + (m.role === 'user' ? 'You' : 'NEXORA') + ':**\n\n' + (m.content || '') + '\n\n';
    });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + safeName + '.md"');
  } else {
    out += convo.title + '\n' + '='.repeat(convo.title.length) + '\n';
    out += 'Exported from NEXORA AI on ' + new Date().toLocaleString() + '\n\n';
    convo.messages.forEach((m) => {
      out += (m.role === 'user' ? 'You' : 'NEXORA') + ':\n' + (m.content || '') + '\n\n';
    });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + safeName + '.txt"');
  }
  res.send(out);
});

router.get('/:id', (req, res) => {
  const db = readDB();
  const convo = db.conversations.find((c) => c.id === req.params.id);
  if (!convo) return res.status(404).json({ error: 'Conversation not found' });
  res.json({ conversation: convo });
});

router.post('/', (req, res) => {
  const db = readDB();
  const convo = {
    id: makeId(),
    title: (req.body && req.body.title) || 'New chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: []
  };
  db.conversations.unshift(convo);
  writeDB(db);
  res.json({ conversation: convo });
});

router.delete('/:id', (req, res) => {
  const db = readDB();
  const idx = db.conversations.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Conversation not found' });
  db.conversations.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;