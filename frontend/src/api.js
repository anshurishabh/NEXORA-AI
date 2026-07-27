const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

async function request(path, options) {
  let res;
  try {
    res = await fetch(BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
  } catch (networkErr) {
    throw new Error('Cannot reach the backend at ' + BASE + ' — is it running?');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Request failed (' + res.status + ')');
  }
  return data;
}

// Streams /api/orchestrate/stream — calls onEvent(obj) for every JSON line
// the backend sends as it plans, delegates, and generates the final answer.
async function streamOrchestrate(body, onEvent) {
  const res = await fetch(BASE + '/api/orchestrate/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok || !res.body) {
    throw new Error('Request failed (' + res.status + ')');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line));
      } catch (e) {
        // ignore a malformed/partial line
      }
    }
  }
}

export const api = {
  orchestrate: (body) => request('/api/orchestrate', { method: 'POST', body: JSON.stringify(body) }),
  streamOrchestrate,

  listConversations: () => request('/api/conversations'),
  getConversation: (id) => request('/api/conversations/' + id),
  createConversation: (title) => request('/api/conversations', { method: 'POST', body: JSON.stringify({ title }) }),
  deleteConversation: (id) => request('/api/conversations/' + id, { method: 'DELETE' }),
  clearAllConversations: () => request('/api/conversations', { method: 'DELETE' }),

  extractDocument: (body) => request('/api/document/extract', { method: 'POST', body: JSON.stringify(body) }),
  summarizeDocument: (body) => request('/api/document/summarize', { method: 'POST', body: JSON.stringify(body) }),
  askDocument: (body) => request('/api/document/ask', { method: 'POST', body: JSON.stringify(body) }),

  generateImage: (body) => request('/api/image/generate', { method: 'POST', body: JSON.stringify(body) }),
  executeCode: (body) => request('/api/code/execute', { method: 'POST', body: JSON.stringify(body) }),

  getProviders: () => request('/api/providers'),
  getAnalytics: () => request('/api/analytics'),

  exportUrl: () => BASE + '/api/export'
};