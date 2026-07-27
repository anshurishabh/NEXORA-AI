const express = require('express');
const router = express.Router();
const { runProvider, isConfigured } = require('../providers');
const { readDB, writeDB } = require('../db');
const AGENT_INFO = require('../agentConfig');
const webSearch = require('../webSearch');

const SELECTABLE_AGENTS = ['research', 'coding', 'data', 'document', 'websearch', 'content'];
const PROVIDER = 'groq';
const LEVEL = 'normal';

function makeId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function parseJSON(text) {
  const clean = (text || '').replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(clean);
}

router.post('/', async (req, res) => {
  const { conversationId, query, attachment } = req.body || {};

  const hasImage = attachment && attachment.type === 'image' && attachment.base64;
  const hasDocument = attachment && attachment.type === 'document';

  if ((!query || !query.trim()) && !hasImage && !hasDocument) {
    return res.status(400).json({ error: 'query is required' });
  }

  const trimmedQuery = (query || '').trim() || (hasImage ? 'Describe this image and anything useful about it.' : '');
  const db = readDB();

  let convo = conversationId ? db.conversations.find((c) => c.id === conversationId) : null;
  if (!convo) {
    convo = {
      id: makeId(),
      title: (trimmedQuery || (attachment && attachment.name) || 'New chat').slice(0, 48),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };
    db.conversations.unshift(convo);
  }
  convo.messages.push({
    role: 'user',
    content: trimmedQuery,
    attachment: attachment ? { name: attachment.name, type: attachment.type } : undefined,
    time: new Date().toISOString()
  });

  let agents = [];
  let agentTraces = [];
  let responseText = '';
  let usedFallback = false;
  let errorCode = null;

  try {
    if (!isConfigured(PROVIDER)) {
      const err = new Error('GROQ_API_KEY is missing from backend/.env');
      err.code = 'NO_KEY';
      throw err;
    }

    // IMAGE ATTACHED — single vision call, skip the multi-agent planning
    // (planning/JSON-mode doesn't apply well to "look at this picture").
    if (hasImage) {
      const visionPrompt =
        'You are the Vision agent for NEXORA AI. Look at the attached image carefully and respond helpfully ' +
        'to the user\u2019s request about it. Be specific about what you actually see. Respond in plain text only, ' +
        'under 180 words, no markdown fences.';
      const output = await runProvider(PROVIDER, LEVEL, trimmedQuery, visionPrompt, {
        imageBase64: attachment.base64,
        imageMimeType: attachment.mimeType
      });
      responseText = output.trim();
      agents = ['content'];
      agentTraces = [{ agent: 'content', provider: PROVIDER, ok: true, output: responseText }];
    } else {
      // DOCUMENT ATTACHED (or no attachment) — normal multi-agent flow.
      // If a document was attached, its extracted text is folded into the
      // query so every agent (planner, research, etc.) can see it.
      const effectiveQuery = hasDocument
        ? 'The user attached a document named "' + attachment.name + '". Document content:\n' +
          (attachment.text ? attachment.text.slice(0, 6000) : '[No extractable text was found in this file]') +
          '\n\nUser request: ' + (trimmedQuery || 'Summarize this document and highlight anything important.')
        : trimmedQuery;

      const planPrompt =
        'You are the planning agent for NEXORA AI. Decide which specialist agents from this fixed set are genuinely ' +
        'needed: research, coding, data, document, websearch, content. For each agent you pick, write ONE short, ' +
        'specific subtask instruction for it. Respond with ONLY valid JSON, no markdown fences: ' +
        '{"agents": ["key1","key2"], "tasks": {"key1": "subtask text", "key2": "subtask text"}}. ' +
        'Pick between 1 and 4 truly relevant agents.' +
        (hasDocument ? ' A document was attached, so include the "document" agent.' : '');

      let planRaw;
      try {
        planRaw = await runProvider(PROVIDER, LEVEL, effectiveQuery, planPrompt);
      } catch (planErr) {
        console.error('[orchestrate] PLANNING STEP FAILED:', planErr.message);
        throw planErr;
      }

      let plan;
      try {
        plan = parseJSON(planRaw);
      } catch (parseErr) {
        console.error('[orchestrate] PLAN JSON PARSE FAILED. Raw output was:', planRaw);
        throw new Error('Groq responded, but not in the expected JSON format. Raw: ' + planRaw.slice(0, 200));
      }

      agents = (plan.agents || []).filter((a) => SELECTABLE_AGENTS.includes(a)).slice(0, 4);
      if (agents.length === 0) agents = hasDocument ? ['document', 'content'] : ['research', 'content'];
      const tasks = plan.tasks || {};

      agentTraces = await Promise.all(
        agents.map(async (agentKey) => {
          const info = AGENT_INFO[agentKey];
          const subtask = tasks[agentKey] || effectiveQuery;
          const needsSearch = agentKey === 'research' || agentKey === 'websearch';

          let searchContext = '';
          if (needsSearch) {
            try {
              const results = await webSearch(subtask, 6);
              if (results.length) {
                searchContext =
                  '\n\nLIVE WEB SEARCH RESULTS (use these for current facts, news, and dates):\n' +
                  results.map((r, i) => (i + 1) + '. ' + r.title + ' — ' + r.snippet + ' (' + r.link + ')').join('\n');
              }
            } catch (e) {
              console.error('[orchestrate] web search failed for "' + subtask + '":', e.message);
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
            const output = await runProvider(PROVIDER, LEVEL, subtask + searchContext, agentSystemPrompt);
            return { agent: agentKey, provider: PROVIDER, output: output.trim(), ok: true };
          } catch (err) {
            console.error('[orchestrate] AGENT "' + agentKey + '" FAILED:', err.message);
            return { agent: agentKey, provider: PROVIDER, output: null, ok: false, error: err.message };
          }
        })
      );

      const successful = agentTraces.filter((t) => t.ok && t.output);
      if (successful.length === 0) {
        const firstReason = (agentTraces.find((t) => !t.ok) || {}).error || 'unknown error';
        throw new Error('All specialist agents failed to respond. First error: ' + firstReason);
      }

      const synthesisInput = successful
        .map((t) => '[' + AGENT_INFO[t.agent].label.toUpperCase() + ']\n' + t.output)
        .join('\n\n');

      const synthesisPrompt =
        'You are the Verifier agent for NEXORA AI. Specialist agents have each contributed a piece toward the ' +
        'user\u2019s original goal: "' + effectiveQuery.slice(0, 300) + '". Combine their contributions below into one clear, ' +
        'well-organized, non-redundant final answer. Keep it under 200 words. You may use **bold** sparingly. ' +
        'Respond in plain text only — no JSON, no markdown fences.\n\n' + synthesisInput;

      responseText = (await runProvider(PROVIDER, LEVEL, 'Synthesize the final answer now.', synthesisPrompt)).trim();
    }
  } catch (err) {
    console.error('[orchestrate] REQUEST FAILED:', err.message);
    usedFallback = true;
    errorCode = err.code === 'NO_KEY' ? 'NO_KEY' : 'ERROR';
    if (agents.length === 0) agents = ['research', 'content'];
    responseText =
      errorCode === 'NO_KEY'
        ? 'Groq needs an API key in backend/.env. Add GROQ_API_KEY, restart the server, and try again.'
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