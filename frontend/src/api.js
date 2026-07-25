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

export const api = {
  orchestrate: (body) => request('/api/orchestrate', { method: 'POST', body: JSON.stringify(body) }),

  listConversations: () => request('/api/conversations'),
  getConversation: (id) => request('/api/conversations/' + id),
  createConversation: (title) => request('/api/conversations', { method: 'POST', body: JSON.stringify({ title }) }),
  deleteConversation: (id) => request('/api/conversations/' + id, { method: 'DELETE' }),
  clearAllConversations: () => request('/api/conversations', { method: 'DELETE' }),

  extractDocument: (body) => request('/api/document/extract', { method: 'POST', body: JSON.stringify(body) }),
  summarizeDocument: (body) => request('/api/document/summarize', { method: 'POST', body: JSON.stringify(body) }),
  askDocument: (body) => request('/api/document/ask', { method: 'POST', body: JSON.stringify(body) }),

  getProviders: () => request('/api/providers'),
  getAnalytics: () => request('/api/analytics'),

  exportUrl: () => BASE + '/api/export'
};