const express = require('express');
const router = express.Router();

// Free, no-key code execution via Piston's public API.
const LANGUAGE_MAP = {
  python: { language: 'python', version: '3.10.0' },
  javascript: { language: 'javascript', version: '18.15.0' },
  nodejs: { language: 'javascript', version: '18.15.0' },
  cpp: { language: 'cpp', version: '10.2.0' },
  c: { language: 'c', version: '10.2.0' },
  java: { language: 'java', version: '15.0.2' }
};

router.post('/execute', async (req, res) => {
  const { language, code } = req.body || {};
  if (!code || !code.trim()) {
    return res.status(400).json({ error: 'code is required' });
  }

  const key = (language || 'python').toLowerCase();
  const target = LANGUAGE_MAP[key];
  if (!target) {
    return res.status(400).json({ error: 'Unsupported language: ' + language + '. Try python, javascript, cpp, c, or java.' });
  }

  try {
    const pistonRes = await fetch('https://emkc.org/api/v2/piston/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: target.language,
        version: target.version,
        files: [{ content: code }]
      })
    });
    const data = await pistonRes.json();
    if (!pistonRes.ok) {
      return res.status(502).json({ error: data.message || 'Code execution service failed' });
    }
    res.json({
      stdout: (data.run && data.run.stdout) || '',
      stderr: (data.run && data.run.stderr) || '',
      exitCode: data.run && data.run.code,
      compileError: data.compile && data.compile.stderr ? data.compile.stderr : null
    });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach the code execution service: ' + err.message });
  }
});

module.exports = router;