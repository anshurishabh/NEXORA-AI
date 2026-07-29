/**
 * Calls Groq's OpenAI-compatible /chat/completions endpoint.
 * Handles reasoning models (like gpt-oss) that can silently return empty
 * content if they spend their whole token budget "thinking" — fixed by
 * raising max_tokens and telling the model to keep reasoning brief.
 */
async function callOpenAICompatible(endpoint, model, apiKey, query, systemPrompt, options) {
  const opts = options || {};

  const userContent = opts.imageBase64
    ? [
        { type: 'text', text: query },
        {
          type: 'image_url',
          image_url: { url: 'data:' + (opts.imageMimeType || 'image/jpeg') + ';base64,' + opts.imageBase64 }
        }
      ]
    : query;

  const isReasoningModel = model.includes('gpt-oss');

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    max_tokens: 1400
  };
  if (isReasoningModel) {
    body.reasoning_effort = 'low';
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = (data && data.error && (data.error.message || data.error)) || ('Request failed with status ' + res.status);
    throw new Error(message);
  }

  let content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;

  // Reasoning models sometimes put the real answer in a separate
  // "reasoning" field if they run out of room before writing final content.
  if (!content) {
    const reasoning = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.reasoning;
    if (reasoning) content = reasoning;
  }

  if (!content) throw new Error('Provider returned an empty response (model likely ran out of token budget while reasoning)');

  const usage = data.usage || {};
  return {
    content,
    usage: {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0
    }
  };
}

async function streamOpenAICompatible(endpoint, model, apiKey, query, systemPrompt, onToken) {
  const isReasoningModel = model.includes('gpt-oss');
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ],
    max_tokens: 1400,
    stream: true
  };
  if (isReasoningModel) {
    body.reasoning_effort = 'low';
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const message = (data && data.error && (data.error.message || data.error)) || ('Request failed with status ' + res.status);
    throw new Error(message);
  }

  let buffer = '';
  for await (const chunk of res.body) {
    buffer += Buffer.from(chunk).toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload);
        const token = parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content;
        if (token) onToken(token);
      } catch (e) {
        // ignore malformed SSE fragments — normal near the end of a stream
      }
    }
  }
}

module.exports = { callOpenAICompatible, streamOpenAICompatible };