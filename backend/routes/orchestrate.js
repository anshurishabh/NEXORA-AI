const express = require('express');
const router = express.Router();
const { runProvider, isConfigured } = require('../providers');
const { readDB, writeDB } = require('../db');
const AGENT_INFO = require('../agentConfig');
const webSearch = require('../webSearch');

const SELECTABLE_AGENTS = ['research', 'coding', 'data', 'document', 'websearch', 'content'];
const ALL_PROVIDER_IDS = ['gemini', 'groq', 'cerebras', 'openrouter', 'mistral'];

function makeId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function parseJSON(text) {
  const clean = (text || '').replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(clean);
}

// Every agent now runs on the single provider selected in the Console — no
// more per-agent Settings routing map. Falls back to any configured provider
// only if the Console-selected one has no key set.
function resolveProvider(primaryProvider) {
  if (isConfigured(primaryProvider)) return primaryProvider;
  const anyConfigured = ALL_PROVIDER_IDS.find((p) => isConfigured(p));
  return anyConfigured || primaryProvider;
}

router.post('/', async (req, res) => {
  const { conversationId, query, provider, level } = req.body || {};

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }

  const primaryProvider = provider || 'gemini';
  const levelKey = level || 'normal';
  const trimmedQuery = query.trim();

  const db = readDB();

  let convo = conversationId ? db.conversations.find((c) => c.id === conversationId) : null;
  if (!convo) {
    convo = {
      id: makeId(),
      title: trimmedQuery.slice(0, 48),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };
    db.conversations.unshift(convo);
  }
  convo.messages.push({ role: 'user', content: trimmedQuery, time: new Date().toISOString() });

  let agents = [];
  let agentTraces = [];
  let responseText = '';
  let usedFallback = false;
  let errorCode = null;

  try {
    const planPrompt =
      'You are the planning agent for NEXORA AI. Decide which specialist agents from this fixed set are genuinely ' +
      'needed: research, coding, data, document, websearch, content. For each agent you pick, write ONE short, ' +
      'specific subtask instruction for it. Respond with ONLY valid JSON, no markdown fences: ' +
      '{"agents": ["key1","key2"], "tasks": {"key1": "subtask text", "key2": "subtask text"}}. ' +
      'Pick between 1 and 4 truly relevant agents.';

    const planProvider = resolveProvider(primaryProvider);
    const planRaw = await runProvider(planProvider, levelKey, trimmedQuery, planPrompt);
    const plan = parseJSON(planRaw);

    agents = (plan.agents || []).filter((a) => SELECTABLE_AGENTS.includes(a)).slice(0, 4);
    if (agents.length === 0) agents = ['research', 'content'];
    const tasks = plan.tasks || {};

    // Every agent runs on the SAME Console-selected provider. Research / Web Search
    // agents additionally get live DuckDuckGo results injected as context — works
    // for every provider, not just Gemini.
    agentTraces = await Promise.all(
      agents.map(async (agentKey) => {
        const providerId = resolveProvider(primaryProvider);
        const info = AGENT_INFO[agentKey];
        const subtask = tasks[agentKey] || trimmedQuery;
        const needsSearch = agentKey === 'research' || agentKey === 'websearch';

        let searchContext = '';
        if (needsSearch) {
          try {
            const results = await webSearch(subtask, 5);
            if (results.length) {
              searchContext =
                '\n\nLIVE WEB SEARCH RESULTS (use these for current facts, news, and dates):\n' +
                results.map((r, i) => (i + 1) + '. ' + r.title + ' — ' + r.snippet + ' (' + r.link + ')').join('\n');
            }
          } catch (e) {
            // Search failed silently — agent falls back to its own knowledge below.
          }
        }

        const todayLine = needsSearch
          ? ' Today\u2019s date is ' +
            new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) +
            '. Use the live web search results provided below for current, up-to-date information — do not say your knowledge has a cutoff.'
          : '';
        const agentSystemPrompt =
          'You are the ' + info.label + ' agent for NEXORA AI. ' + info.desc +
          ' Complete this subtask as part of a larger collaborative answer. Be concise and concrete (under 120 words).' +
          todayLine +
          ' Respond in plain text only — no JSON, no markdown fences.';
        try {
          const output = await runProvider(providerId, levelKey, subtask + searchContext, agentSystemPrompt, {
            useSearch: needsSearch
          });
          return { agent: agentKey, provider: providerId, output: output.trim(), ok: true };
        } catch (err) {
          return { agent: agentKey, provider: providerId, output: null, ok: false, error: err.message };
        }
      })
    );

    const successful = agentTraces.filter((t) => t.ok && t.output);
    if (successful.length === 0) {
      throw new Error('All specialist agents failed to respond — check provider keys in Settings.');
    }

    const synthesisInput = successful
      .map((t) => '[' + AGENT_INFO[t.agent].label.toUpperCase() + ' via ' + t.provider + ']\n' + t.output)
      .join('\n\n');

    const synthesisPrompt =
      'You are the Verifier agent for NEXORA AI. Specialist agents have each contributed a piece toward the ' +
      'user\u2019s original goal: "' + trimmedQuery + '". Combine their contributions below into one clear, ' +
      'well-organized, non-redundant final answer. Keep it under 200 words. You may use **bold** sparingly. ' +
      'Respond in plain text only — no JSON, no markdown fences.\n\n' + synthesisInput;

    responseText = (
      await runProvider(resolveProvider(primaryProvider), levelKey, 'Synthesize the final answer now.', synthesisPrompt)
    ).trim();
  } catch (err) {
    usedFallback = true;
    errorCode = err.code === 'NO_KEY' ? 'NO_KEY' : 'ERROR';
    if (agents.length === 0) agents = ['research', 'content'];
    responseText =
      errorCode === 'NO_KEY'
        ? 'The "' + primaryProvider + '" provider needs an API key in backend/.env. Add it, restart the server, and try again — or switch providers in the model bar.'
        : "I couldn't complete this task right now (" + err.message + '). Please try again in a moment.';
  }

  const savedTraces = agentTraces.map((t) => ({ agent: t.agent, provider: t.provider, ok: t.ok }));

  convo.messages.push({
    role: 'assistant',
    content: responseText,
    agents,
    agentTraces: savedTraces,
    time: new Date().toISOString()
  });
  convo.updatedAt = new Date().toISOString();
  writeDB(db);

  res.json({
    conversationId: convo.id,
    agents,
    agentTraces: savedTraces,
    response: responseText,
    usedFallback,
    errorCode,
    conversation: convo
  });
});

module.exports = router;