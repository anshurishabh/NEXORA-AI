const express = require('express');
const router = express.Router();
const { runProvider, isConfigured, streamProvider } = require('../providers');
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

function memoryBlock(db) {
  const notes = (db.memory || []).map((m) => m.text);
  if (!notes.length) return '';
  return (
    '\n\n[PERSISTENT USER CONTEXT — facts/preferences the user asked to be remembered across all chats. ' +
    'Use these naturally where relevant; do not list them back verbatim unless asked.]\n' +
    notes.map((n) => '- ' + n).join('\n')
  );
}

function addUsage(totals, usage) {
  if (!usage) return;
  totals.promptTokens += usage.promptTokens || 0;
  totals.completionTokens += usage.completionTokens || 0;
  totals.totalTokens += usage.totalTokens || 0;
}

async function planAndDelegate(effectiveQuery, hasDocument, usageTotals) {
  const planPrompt =
    'You are the planning agent for NEXORA AI. Decide which specialist agents from this fixed set are genuinely ' +
    'needed: research, coding, data, document, websearch, content. For each agent you pick, write ONE short, ' +
    'specific subtask instruction for it. Respond with ONLY valid JSON, no markdown fences: ' +
    '{"agents": ["key1","key2"], "tasks": {"key1": "subtask text", "key2": "subtask text"}}. ' +
    'Pick between 1 and 4 truly relevant agents.' +
    (hasDocument ? ' A document was attached, so include the "document" agent.' : '');

  let planResult;
  try {
    planResult = await runProvider(PROVIDER, LEVEL, effectiveQuery, planPrompt);
  } catch (planErr) {
    console.error('[orchestrate] PLANNING STEP FAILED:', planErr.message);
    throw planErr;
  }
  addUsage(usageTotals, planResult.usage);

  let plan;
  try {
    plan = parseJSON(planResult.text);
  } catch (parseErr) {
    console.error('[orchestrate] PLAN JSON PARSE FAILED. Raw output was:', planResult.text);
    throw new Error('Groq responded, but not in the expected JSON format. Raw: ' + planResult.text.slice(0, 200));
  }

  let agents = (plan.agents || []).filter((a) => SELECTABLE_AGENTS.includes(a)).slice(0, 4);
  if (agents.length === 0) agents = hasDocument ? ['document', 'content'] : ['research', 'content'];
  const tasks = plan.tasks || {};

  const agentTraces = await Promise.all(
    agents.map(async (agentKey) => {
      const info = AGENT_INFO[agentKey];
      const subtask = tasks[agentKey] || effectiveQuery;
      const needsSearch = agentKey === 'research' || agentKey === 'websearch';
      const isCoding = agentKey === 'coding';

      let searchContext = '';
      let searchResultsUsed = [];
      if (needsSearch) {
        try {
          const results = await webSearch(subtask, 6);
          searchResultsUsed = results.map((r) => ({ title: r.title, link: r.link }));
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

      const formatLine = isCoding
        ? ' If your answer includes code, wrap ONLY the code in a fenced block with the language name, ' +
          'like ```python\ncode here\n```. Keep any explanation outside the fence in plain text.'
        : ' Respond in plain text only — no markdown fences.';

      const agentSystemPrompt =
        'You are the ' + info.label + ' agent for NEXORA AI. ' + info.desc +
        ' Complete this subtask as part of a larger collaborative answer. Be concise and concrete (under 150 words).' +
        todayLine + formatLine + ' Do not output JSON.';

      try {
        const result = await runProvider(PROVIDER, LEVEL, subtask + searchContext, agentSystemPrompt);
        addUsage(usageTotals, result.usage);
        return {
          agent: agentKey,
          provider: PROVIDER,
          subtask,
          output: result.text.trim(),
          ok: true,
          tokens: result.usage.totalTokens,
          sources: searchResultsUsed
        };
      } catch (err) {
        console.error('[orchestrate] AGENT "' + agentKey + '" FAILED:', err.message);
        return { agent: agentKey, provider: PROVIDER, subtask, output: null, ok: false, error: err.message, tokens: 0, sources: [] };
      }
    })
  );

  return { agents, agentTraces };
}

function buildSynthesisPrompt(originalGoal, successful) {
  const synthesisInput = successful
    .map((t) => '[' + AGENT_INFO[t.agent].label.toUpperCase() + ']\n' + t.output)
    .join('\n\n');
  return (
    'You are the Verifier agent for NEXORA AI. Specialist agents have each contributed a piece toward the ' +
    'user\u2019s original goal: "' + originalGoal.slice(0, 300) + '". Combine their contributions below into one clear, ' +
    'well-organized, non-redundant final answer. Keep it under 220 words. You may use **bold** sparingly. ' +
    'If any contribution contains a fenced code block (```), copy that code block into your answer EXACTLY as-is, ' +
    'including the ``` fences and language tag — do not retype, reformat, or paraphrase code. Keep everything else ' +
    'in plain text with no markdown fences.\n\n' + synthesisInput
  );
}

async function runOrchestration(query, options) {
  const opts = options || {};
  const usageTotals = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  if (!isConfigured(PROVIDER)) {
    const err = new Error('GROQ_API_KEY is missing from backend/.env');
    err.code = 'NO_KEY';
    throw err;
  }

  const effectiveQuery = query + (opts.memoryContext || '');

  const { agents, agentTraces } = await planAndDelegate(effectiveQuery, !!opts.hasDocument, usageTotals);

  const successful = agentTraces.filter((t) => t.ok && t.output);
  if (successful.length === 0) {
    const firstReason = (agentTraces.find((t) => !t.ok) || {}).error || 'unknown error';
    throw new Error('All specialist agents failed to respond. First error: ' + firstReason);
  }

  const synthesisPrompt = buildSynthesisPrompt(effectiveQuery, successful);
  const synthResult = await runProvider(PROVIDER, LEVEL, 'Synthesize the final answer now.', synthesisPrompt);
  addUsage(usageTotals, synthResult.usage);

  return { agents, agentTraces, responseText: synthResult.text.trim(), usage: usageTotals };
}

function toSavedTrace(t) {
  return {
    agent: t.agent,
    provider: t.provider,
    ok: t.ok,
    tokens: t.tokens || 0,
    subtask: t.subtask || null,
    output: t.output || null,
    sources: t.sources || []
  };
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
  const memCtx = memoryBlock(db);

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
  let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  try {
    if (!isConfigured(PROVIDER)) {
      const err = new Error('GROQ_API_KEY is missing from backend/.env');
      err.code = 'NO_KEY';
      throw err;
    }

    if (hasImage) {
      const visionPrompt =
        'You are the Vision agent for NEXORA AI. Look at the attached image carefully and respond helpfully ' +
        'to the user\u2019s request about it. Be specific about what you actually see. Respond in plain text only, ' +
        'under 180 words, no markdown fences.' + memCtx;
      const result = await runProvider(PROVIDER, LEVEL, trimmedQuery, visionPrompt, {
        imageBase64: attachment.base64,
        imageMimeType: attachment.mimeType
      });
      responseText = result.text.trim();
      tokenUsage = result.usage;
      agents = ['content'];
      agentTraces = [{ agent: 'content', provider: PROVIDER, ok: true, output: responseText, tokens: result.usage.totalTokens, subtask: trimmedQuery, sources: [] }];
    } else {
      const docQuery = hasDocument
        ? 'The user attached a document named "' + attachment.name + '". Document content:\n' +
          (attachment.text ? attachment.text.slice(0, 6000) : '[No extractable text was found in this file]') +
          '\n\nUser request: ' + (trimmedQuery || 'Summarize this document and highlight anything important.')
        : trimmedQuery;

      const result = await runOrchestration(docQuery, { memoryContext: memCtx, hasDocument });
      agents = result.agents;
      agentTraces = result.agentTraces;
      responseText = result.responseText;
      tokenUsage = result.usage;
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

  const savedTraces = agentTraces.map(toSavedTrace);

  convo.messages.push({
    role: 'assistant',
    content: responseText,
    agents,
    agentTraces: savedTraces,
    ok: !usedFallback,
    errorCode,
    tokenUsage,
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
    tokenUsage,
    conversation: convo
  });
});

router.post('/stream', async (req, res) => {
  const { conversationId, query } = req.body || {};

  if (!query || !query.trim()) {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  const trimmedQuery = query.trim();
  const db = readDB();
  const memCtx = memoryBlock(db);

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

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  function send(obj) {
    res.write(JSON.stringify(obj) + '\n');
  }

  let agents = [];
  let agentTraces = [];
  let fullText = '';
  const usageTotals = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  try {
    if (!isConfigured(PROVIDER)) {
      const err = new Error('GROQ_API_KEY is missing from backend/.env');
      err.code = 'NO_KEY';
      throw err;
    }

    send({ type: 'stage', stage: 'planning' });
    const planned = await planAndDelegate(trimmedQuery + memCtx, false, usageTotals);
    agents = planned.agents;
    agentTraces = planned.agentTraces;

    const savedTraces = agentTraces.map(toSavedTrace);
    send({ type: 'agents', agents, agentTraces: savedTraces });

    const successful = agentTraces.filter((t) => t.ok && t.output);
    if (successful.length === 0) {
      const firstReason = (agentTraces.find((t) => !t.ok) || {}).error || 'unknown error';
      throw new Error('All specialist agents failed to respond. First error: ' + firstReason);
    }

    const synthesisPrompt = buildSynthesisPrompt(trimmedQuery, successful);
    send({ type: 'stage', stage: 'verifying' });

    await streamProvider(PROVIDER, LEVEL, 'Synthesize the final answer now.', synthesisPrompt, (token) => {
      fullText += token;
      send({ type: 'token', text: token });
    });

    convo.messages.push({
      role: 'assistant',
      content: fullText.trim(),
      agents,
      agentTraces: savedTraces,
      ok: true,
      tokenUsage: usageTotals,
      time: new Date().toISOString()
    });
    convo.updatedAt = new Date().toISOString();
    writeDB(db);

    send({ type: 'done', conversationId: convo.id });
  } catch (err) {
    console.error('[orchestrate/stream] REQUEST FAILED:', err.message);
    const errorCode = err.code === 'NO_KEY' ? 'NO_KEY' : 'ERROR';
    const message =
      errorCode === 'NO_KEY'
        ? 'Groq needs an API key in backend/.env. Add GROQ_API_KEY, restart the server, and try again.'
        : "I couldn't complete this task right now (" + err.message + '). Please try again in a moment.';

    convo.messages.push({
      role: 'assistant',
      content: message,
      agents,
      agentTraces: agentTraces.map(toSavedTrace),
      ok: false,
      errorCode,
      time: new Date().toISOString()
    });
    convo.updatedAt = new Date().toISOString();
    writeDB(db);

    send({ type: 'error', message, errorCode, conversationId: convo.id });
  }

  res.end();
});

module.exports = router;
module.exports.runOrchestration = runOrchestration;