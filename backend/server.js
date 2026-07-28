require('dotenv').config();

const express = require('express');
const cors = require('cors');

const orchestrateRoute = require('./routes/orchestrate');
const conversationsRoute = require('./routes/conversations');
const documentsRoute = require('./routes/documents');
const providersRoute = require('./routes/providers');
const analyticsRoute = require('./routes/analytics');
const imageRoute = require('./routes/image');
const codeRoute = require('./routes/code');
const memoryRoute = require('./routes/memory');
const { readDB } = require('./db');

const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/', (req, res) => {
  res.json({ ok: true, name: 'NEXORA AI backend', status: 'running' });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/orchestrate', orchestrateRoute);
app.use('/api/conversations', conversationsRoute);
app.use('/api/document', documentsRoute);
app.use('/api/providers', providersRoute);
app.use('/api/analytics', analyticsRoute);
app.use('/api/image', imageRoute);
app.use('/api/code', codeRoute);
app.use('/api/memory', memoryRoute);

app.get('/api/export', (req, res) => {
  const db = readDB();
  res.setHeader('Content-Disposition', 'attachment; filename="nexora-export.json"');
  res.json({ exportedAt: new Date().toISOString(), conversations: db.conversations });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('NEXORA AI backend running on http://localhost:' + PORT);
});