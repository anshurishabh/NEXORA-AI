const express = require('express');
const router = express.Router();
const { runProvider } = require('../providers');

const PROVIDER = 'groq';
const LEVEL = 'normal';

const SUMMARY_PROMPT =
  'You are the Document Intelligence agent for NEXORA AI. Summarize the given document concisely ' +
  '(under 130 words) and list up to 3 key points. Respond in plain text only, no JSON, no markdown fences.';

const QA_PROMPT =
  'You are the Document Intelligence agent for NEXORA AI. Answer the question using only the provided ' +
  'document content. If the content is missing or insufficient, say so honestly rather than guessing. ' +
  'Keep the answer under 130 words. Respond in plain text only, no JSON, no markdown fences.';

router.post('/summarize', async (req, res) => {
  const { text, filename } = req.body || {};
  const content =
    'DOCUMENT NAME: ' + (filename || 'unknown') + '\n\nCONTENT:\n' +
    (text ? String(text).slice(0, 6000) : '[No extractable text was provided for this file type]');

  try {
    const raw = await runProvider(PROVIDER, LEVEL, content, SUMMARY_PROMPT);
    res.json({ summary: raw.trim() });
  } catch (err) {
    res.status(err.code === 'NO_KEY' ? 400 : 502).json({ error: err.message || 'Failed to summarize document' });
  }
});

router.post('/ask', async (req, res) => {
  const { text, filename, question } = req.body || {};
  if (!question || !String(question).trim()) {
    return res.status(400).json({ error: 'question is required' });
  }
  const content =
    'DOCUMENT NAME: ' + (filename || 'unknown') + '\n\nCONTENT:\n' +
    (text ? String(text).slice(0, 6000) : '[No extractable text was provided for this file type]') +
    '\n\nQUESTION: ' + question;

  try {
    const raw = await runProvider(PROVIDER, LEVEL, content, QA_PROMPT);
    res.json({ answer: raw.trim() });
  } catch (err) {
    res.status(err.code === 'NO_KEY' ? 400 : 502).json({ error: err.message || 'Failed to answer question' });
  }
});

module.exports = router;