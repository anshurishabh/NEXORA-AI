const { callOpenAICompatible, streamOpenAICompatible } = require('./openaiCompatible');

const PROVIDERS = {
  groq: {
    name: 'Groq',
    envKey: 'GROQ_API_KEY',
    levels: {
      fast: { model: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
      medium: { model: 'qwen/qwen3.6-27b', label: 'Qwen3.6 27B' },
      normal: { model: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' }
    }
  }
};

const VISION_MODEL = 'qwen/qwen3.6-27b';

const ORCH_SYSTEM_PROMPT =
  'You are the orchestrator for NEXORA AI, a multi-agent assistant platform. ' +
  'Given the user\u2019s goal, decide which specialist agents from this fixed set are genuinely needed: ' +
  'research, coding, data, document, websearch, content. ' +
  'Respond with ONLY valid JSON, no markdown code fences, no preamble. ' +
  'Format exactly: {"agents": ["key1","key2"], "response": "final answer text"}. ' +
  'Pick between 1 and 4 agents that are truly relevant \u2014 do not include planner or verifier, those run automatically. ' +
  'The response field should be a clear, well-structured, genuinely helpful answer, written as if produced collaboratively by those agents. ' +
  'Keep the response under 180 words. You may use **bold** sparingly.';

function isConfigured(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) return false;
  return !!process.env[provider.envKey];
}

function pickLevel(provider, levelKey) {
  return provider.levels[levelKey] || provider.levels.normal || Object.values(provider.levels)[0];
}

async function runProvider(providerId, levelKey, query, systemPrompt, options) {
  const opts = options || {};
  const provider = PROVIDERS[providerId];
  if (!provider) {
    const err = new Error('Unknown provider: ' + providerId);
    err.code = 'UNKNOWN_PROVIDER';
    throw err;
  }

  const apiKey = process.env[provider.envKey];
  if (!apiKey) {
    const err = new Error(provider.name + ' API key is not set in backend/.env');
    err.code = 'NO_KEY';
    throw err;
  }

  const levelCfg = pickLevel(provider, levelKey);
  const modelToUse = opts.imageBase64 ? VISION_MODEL : levelCfg.model;
  const prompt = systemPrompt || ORCH_SYSTEM_PROMPT;

  return callOpenAICompatible('https://api.groq.com/openai/v1/chat/completions', modelToUse, apiKey, query, prompt, opts);
}

async function streamProvider(providerId, levelKey, query, systemPrompt, onToken) {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    const err = new Error('Unknown provider: ' + providerId);
    err.code = 'UNKNOWN_PROVIDER';
    throw err;
  }

  const apiKey = process.env[provider.envKey];
  if (!apiKey) {
    const err = new Error(provider.name + ' API key is not set in backend/.env');
    err.code = 'NO_KEY';
    throw err;
  }

  const levelCfg = pickLevel(provider, levelKey);
  const prompt = systemPrompt || ORCH_SYSTEM_PROMPT;

  return streamOpenAICompatible('https://api.groq.com/openai/v1/chat/completions', levelCfg.model, apiKey, query, prompt, onToken);
}

module.exports = { PROVIDERS, ORCH_SYSTEM_PROMPT, isConfigured, runProvider, streamProvider };