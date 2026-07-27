/**
 * Calls Groq's OpenAI-compatible /chat/completions endpoint.
 * Supports plain text, or text + an attached image (vision).
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

  const content =
    data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;

  if (!content) throw new Error('Provider returned an empty response');
  return content;
}

module.exports = callOpenAICompatible;