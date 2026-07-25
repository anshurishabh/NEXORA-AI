const callOpenAICompatible = require('./openaiCompatible');

// Verified against each provider's docs as of Jul 2026. All are free-tier.
// Free-tier lineups (especially OpenRouter's) rotate — if a model 404s, check
// the provider's current model list and update the id below.
const PROVIDERS = {
  groq: {
    name: 'Groq',
    envKey: 'GROQ_API_KEY',
    levels: {
      fast: { model: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
      medium: { model: 'qwen/qwen3.6-27b', label: 'Qwen3.6 27B' },
      normal: { model: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' }
    }
  },
  cerebras: {
    name: 'Cerebras',
    envKey: 'CEREBRAS_API_KEY',
    levels: {
      fast: { model: 'llama3.1-8b', label: 'Llama 3.1 8B' },
      medium: { model: 'llama-4-scout', label: 'Llama 4 Scout' },
      normal: { model: 'gpt-oss-120b', label: 'GPT-OSS 120B' }
    }
  },
  openrouter: {
    name: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    levels: {
      fast: { model: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B' },
      medium: { model: 'meta-llama/llama-4-maverick:free', label: 'Llama 4 Maverick' },
      normal: { model: 'openrouter/free', label: 'Auto (best free match)' }
    }
  },
  mistral: {
    name: 'Mistral AI',
    envKey: 'MISTRAL_API_KEY',
    levels: {
      fast: { model: 'mistral-small-latest', label: 'Small' },
      medium: { model: 'mistral-medium-latest', label: 'Medium' },
      normal: { model: 'mistral-large-latest', label: 'Large' }
    }
  }
};

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

  if (providerId === 'groq') {
    return callOpenAICompatible('https://api.groq.com/openai/v1/chat/completions', levelCfg.model, apiKey, query, prompt);
  }

  if (providerId === 'cerebras') {
    return callOpenAICompatible('https://api.cerebras.ai/v1/chat/completions', levelCfg.model, apiKey, query, prompt);
  }

  if (providerId === 'openrouter') {
    return callOpenAICompatible(
      'https://openrouter.ai/api/v1/chat/completions',
      levelCfg.model,
      apiKey,
      query,
      prompt,
      { 'HTTP-Referer': process.env.PUBLIC_APP_URL || 'https://nexora.ai', 'X-Title': 'NEXORA AI' }
    );
  }

  if (providerId === 'mistral') {
    return callOpenAICompatible('https://api.mistral.ai/v1/chat/completions', levelCfg.model, apiKey, query, prompt);
  }

  const err = new Error('Provider not implemented: ' + providerId);
  err.code = 'UNKNOWN_PROVIDER';
  throw err;
}

module.exports = { PROVIDERS, ORCH_SYSTEM_PROMPT, isConfigured, runProvider };