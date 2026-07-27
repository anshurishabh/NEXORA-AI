const express = require('express');
const router = express.Router();
const { readDB, writeDB } = require('../db');

function makeId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

// Free image generation via Pollinations AI — no API key needed.
// The image is generated on-demand the moment the URL is loaded by <img>.
router.post('/generate', async (req, res) => {
  const { conversationId, prompt } = req.body || {};
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'A prompt is required to generate an image' });
  }

  const trimmedPrompt = prompt.trim();
  const seed = Math.floor(Math.random() * 1000000);
  const imageUrl =
    'https://image.pollinations.ai/prompt/' +
    encodeURIComponent(trimmedPrompt) +
    '?width=1024&height=1024&nologo=true&seed=' + seed;

  const db = readDB();
  let convo = conversationId ? db.conversations.find((c) => c.id === conversationId) : null;
  if (!convo) {
    convo = {
      id: makeId(),
      title: ('Image: ' + trimmedPrompt).slice(0, 48),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };
    db.conversations.unshift(convo);
  }

  convo.messages.push({ role: 'user', content: '/imagine ' + trimmedPrompt, time: new Date().toISOString() });
  convo.messages.push({
    role: 'assistant',
    content: '',
    imageUrl,
    imagePrompt: trimmedPrompt,
    agents: ['content'],
    agentTraces: [{ agent: 'content', provider: 'pollinations', ok: true }],
    time: new Date().toISOString()
  });
  convo.updatedAt = new Date().toISOString();
  writeDB(db);

  res.json({ conversationId: convo.id, imageUrl, prompt: trimmedPrompt, conversation: convo });
});

module.exports = router;