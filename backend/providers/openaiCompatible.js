/**
 * Calls Groq's OpenAI-compatible /chat/completions endpoint.
 * Supports plain text, text + image (vision), and streaming responses.
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

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      max_tokens: 700
    })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = (data && data.error && (data.error.message || data.error)) || ('Request failed with status ' + res.status);
    throw new Error(message);
  }

  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('Provider returned an empty response');
  return content;
}

/**
 * Same as above, but streams tokens as they're generated. Calls onToken(text)
 * for every small chunk of text Groq sends, so the UI can show a typing effect.
 */
async function streamOpenAICompatible(endpoint, model, apiKey, query, systemPrompt, onToken) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ],
      max_tokens: 700,
      stream: true
    })
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