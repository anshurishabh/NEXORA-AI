const express = require('express');
const router = express.Router();
const { runProvider } = require('../providers');

const PROVIDER = 'groq';
const LEVEL = 'normal';

const PROMPT =
  'You are the Data Analyst agent for NEXORA AI. Given a dataset (labels and numeric values), identify real ' +
  'trends, anomalies, and 2-3 specific, actionable insights — cite actual numbers from the data. ' +
  'Keep it under 170 words. Respond in plain text only, no JSON, no markdown fences.';

router.post('/analyze', async (req, res) => {
  const { title, valueLabel, labels, values } = req.body || {};
  if (!Array.isArray(labels) || !Array.isArray(values) || labels.length === 0) {
    return res.status(400).json({ error: 'labels and values arrays are required' });
  }

  const rows = labels.map((l, i) => l + ': ' + values[i]).join('\n');
  const content = 'DATASET: ' + (title || 'Untitled') + '\nMETRIC: ' + (valueLabel || 'Value') + '\n\n' + rows;

  try {
    const result = await runProvider(PROVIDER, LEVEL, content, PROMPT);
    res.json({ insights: result.text.trim(), tokens: result.usage.totalTokens });
  } catch (err) {
    res.status(err.code === 'NO_KEY' ? 400 : 502).json({ error: err.message || 'Analysis failed' });
  }
});

module.exports = router;