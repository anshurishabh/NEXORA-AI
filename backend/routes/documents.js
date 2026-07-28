const express = require('express');
const router = express.Router();
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { runProvider } = require('../providers');

const PROVIDER = 'groq';
const LEVEL = 'normal';

const SUMMARY_PROMPT =
  'You are the Document Intelligence agent for NEXORA AI. Summarize the given document concisely ' +
  '(under 130 words) and list up to 3 key points. Respond in plain text only, no JSON, no markdown fences.';

const QA_PROMPT =
  'You are the Document Intelligence agent for NEXORA AI. Answer the question using only the provided ' +
  'document content and, if given, the earlier Q&A on this same document (for follow-up context). ' +
  'If the content is missing or insufficient, say so honestly rather than guessing. ' +
  'Keep the answer under 130 words. Respond in plain text only, no JSON, no markdown fences.';

router.post('/extract', async (req, res) => {
  const { filename, fileBase64 } = req.body || {};
  if (!filename || !fileBase64) {
    return res.status(400).json({ error: 'filename and fileBase64 are required' });
  }

  try {
    const buffer = Buffer.from(fileBase64, 'base64');
    const lower = filename.toLowerCase();
    let text = '';

    if (lower.endsWith('.pdf')) {
      const data = await pdfParse(buffer);
      text = (data.text || '').trim();
    } else if (lower.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      text = (result.value || '').trim();
    } else {
      return res.status(400).json({ error: 'Unsupported file type for extraction' });
    }

    if (!text) {
      return res.json({
        text: '',
        warning: 'No selectable text was found in this file — it may be a scanned/image-only document.'
      });
    }

    res.json({ text: text.slice(0, 20000) });
  } catch (err) {
    console.error('[documents/extract] failed for "' + filename + '":', err.message);
    res.status(500).json({ error: 'Could not read that file: ' + err.message });
  }
});

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

// Multi-turn: accepts `history` (previous Q&A pairs on this same document) so
// follow-up questions like "what about the second point" work correctly.
router.post('/ask', async (req, res) => {
  const { text, filename, question, history } = req.body || {};
  if (!question || !String(question).trim()) {
    return res.status(400).json({ error: 'question is required' });
  }

  const historyBlock = (history || [])
    .slice(-6)
    .map((h) => 'Q: ' + h.question + '\nA: ' + h.answer)
    .join('\n\n');

  const content =
    'DOCUMENT NAME: ' + (filename || 'unknown') + '\n\nCONTENT:\n' +
    (text ? String(text).slice(0, 6000) : '[No extractable text was provided for this file type]') +
    (historyBlock ? '\n\nPREVIOUS Q&A ON THIS DOCUMENT:\n' + historyBlock : '') +
    '\n\nNEW QUESTION: ' + question;

  try {
    const raw = await runProvider(PROVIDER, LEVEL, content, QA_PROMPT);
    res.json({ answer: raw.trim() });
  } catch (err) {
    res.status(err.code === 'NO_KEY' ? 400 : 502).json({ error: err.message || 'Failed to answer question' });
  }
});

module.exports = router;