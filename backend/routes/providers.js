const express = require('express');
const router = express.Router();
const { PROVIDERS } = require('../providers');

router.get('/', (req, res) => {
  const data = Object.entries(PROVIDERS).map(([id, p]) => ({
    id,
    name: p.name,
    configured: !!process.env[p.envKey],
    levels: Object.fromEntries(
      Object.entries(p.levels).map(([lvl, cfg]) => [lvl, { model: cfg.model, label: cfg.label }])
    )
  }));
  res.json({ providers: data });
});

module.exports = router;
