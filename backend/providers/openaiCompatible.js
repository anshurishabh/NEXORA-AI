/**
 * Calls any OpenAI-compatible /chat/completions endpoint.
 * Groq, OpenRouter, and Mistral all speak this same request/response shape.
 */
async function callOpenAICompatible(endpoint, model, apiKey, query, systemPrompt, extraHeaders) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: Object.assign(
      { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      extraHeaders || {}
    ),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
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
