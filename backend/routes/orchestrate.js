const express = require('express');
const router = express.Router();
const { runProvider, isConfigured, PROVIDERS } = require('../providers');
const { readDB, writeDB } = require('../db');
const AGENT_INFO = require('../agentConfig');
const webSearch = require('../webSearch');

const SELECTABLE_AGENTS = ['research', 'coding', 'data', 'document', 'websearch', 'content'];
const ALL_PROVIDER_IDS = ['groq', 'cerebras', 'openrouter', 'mistral'];

function makeId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function parseJSON(text) {
  const clean = (text || '').replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(clean);
}

function providerName(id) {
  return (PROVIDERS[id] && PROVIDERS[id].name) || id;
}

// Tries the preferred provider first. If it fails (bad key, auth error, rate
// limit, provider outage — anything), it silently moves to the next
// configured provider and tries again, until one succeeds or all fail.
async function runWithFallback(preferredProviderId, levelKey, query, systemPrompt) {
  const order = [preferredProviderId, ...ALL_PROVIDER_IDS.filter((p) => p !== preferredProviderId)];
  const failed = [];
  let lastError = null;

  for (const providerId of order) {
    if (!isConfigured(providerId)) continue;
    try {
      const output = await runProvider(providerId, levelKey, query, systemPrompt);
      return { output, provider: providerId, failed };
    } catch (err) {
      failed.push({ provider: providerId, error: err.message });
      lastError = err;
    }
  }

  const err = new Error(lastError ? lastError.message : 'No provider is configured with an API key.');
  err.code = lastError ? lastError.code : 'NO_KEY';
  err.failed = failed;
  throw err;
}

router.post('/', async (req, res) => {
  const { conversationId, query, provider, level } = req.body || {};

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }

  const primaryProvider = provider || 'groq';
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
  const fallbackPairs = new Set();

  function recordFallback(failedList, actualProvider) {
    (failedList || []).forEach((f) => {
      fallbackPairs.add(providerName(f.provider) + '>' + providerName(actualProvider));
    });
  }

  try {
    const planPrompt =
      'You are the planning agent for NEXORA AI. Decide which specialist agents from this fixed set are genuinely ' +
      'needed: research, coding, data, document, websearch, content. For each agent you pick, write ONE short, ' +
      'specific subtask instruction for it. Respond with ONLY valid JSON, no markdown fences: ' +
      '{"agents": ["key1","key2"], "tasks": {"key1": "subtask text", "key2": "subtask text"}}. ' +
      'Pick between 1 and 4 truly relevant agents.';

    const planResult = await runWithFallback(primaryProvider, levelKey, trimmedQuery, planPrompt);
    recordFallback(planResult.failed, planResult.provider);
    const plan = parseJSON(planResult.output);

    agents = (plan.agents || []).filter((a) => SELECTABLE_AGENTS.includes(a)).slice(0, 4);
    if (agents.length === 0) agents = ['research', 'content'];
    const tasks = plan.tasks || {};

    agentTraces = await Promise.all(
      agents.map(async (agentKey) => {
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
            // all search sources failed — agent falls back to its own knowledge below
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
          const result = await runWithFallback(primaryProvider, levelKey, subtask + searchContext, agentSystemPrompt);
          recordFallback(result.failed, result.provider);
          return { agent: agentKey, provider: result.provider, output: result.output.trim(), ok: true };
        } catch (err) {
          recordFallback(err.failed, 'none — all providers failed');
          return { agent: agentKey, provider: primaryProvider, output: null, ok: false, error: err.message };
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

    const synthResult = await runWithFallback(primaryProvider, levelKey, 'Synthesize the final answer now.', synthesisPrompt);
    recordFallback(synthResult.failed, synthResult.provider);
    responseText = synthResult.output.trim();

    if (fallbackPairs.size > 0) {
      const notes = Array.from(fallbackPairs).map((pair) => {
        const [failedName, usedName] = pair.split('>');
        return failedName + ' didn\u2019t respond, so ' + usedName + ' was used instead';
      });
      responseText += '\n\n_Note: ' + notes.join('; ') + '._';
    }
  } catch (err) {
    usedFallback = true;
    errorCode = err.code === 'NO_KEY' ? 'NO_KEY' : 'ERROR';
    if (agents.length === 0) agents = ['research', 'content'];
    responseText =
      errorCode === 'NO_KEY'
        ? 'None of your configured providers could handle this request right now. Please check your API keys in backend/.env and restart the server.'
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