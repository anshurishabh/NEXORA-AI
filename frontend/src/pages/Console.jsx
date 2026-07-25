import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { AGENT_CONFIG, LEVEL_LABEL, LEVEL_ORDER } from '../constants.js';

const SUGGESTIONS = [
  { label: 'Research: EV market in India', prompt: 'Research the electric vehicle market in India and summarize the key trends' },
  { label: 'Code: dedupe a CSV in Python', prompt: 'Write a Python function to detect duplicate rows in a CSV file and explain how it works' },
  { label: 'Analyze: monthly sales data', prompt: 'I have a sales dataset with monthly revenue — what kind of analysis and charts should I run on it?' },
  { label: 'Draft: project report summary', prompt: 'Draft a short project report summary for a multi-agent AI assistant final year project' }
];

const STAGE_LABELS = ['Planning', 'Delegating', 'Verifying'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatText(str) {
  const esc = (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
}

export default function Console() {
  const { providers, refreshAnalytics } = useApp();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [stage, setStage] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [provider, setProvider] = useState('groq');
  const [level, setLevel] = useState('normal');
  const scrollRef = useRef(null);

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.listConversations();
      setConversations(data.conversations);
    } catch (err) {
      // sidebar just stays empty if the backend is unreachable
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  async function openConversation(id) {
    setActiveId(id);
    setDrawerOpen(false);
    setExpanded({});
    try {
      const data = await api.getConversation(id);
      setMessages(data.conversation.messages);
    } catch (err) {
      setMessages([]);
    }
  }

  function startNewChat() {
    setActiveId(null);
    setMessages([]);
    setExpanded({});
    setDrawerOpen(false);
  }

  async function handleDelete(id, e) {
    e.stopPropagation();
    if (!window.confirm('Delete this chat? This cannot be undone.')) return;
    try {
      await api.deleteConversation(id);
      if (id === activeId) startNewChat();
      loadConversations();
      refreshAnalytics();
    } catch (err) {
      alert('Could not delete: ' + err.message);
    }
  }

  const providerData = providers.find((p) => p.id === provider);
  const availableLevels = providerData ? LEVEL_ORDER.filter((l) => providerData.levels[l]) : [];

  function changeProvider(id) {
    setProvider(id);
    setLevel('normal');
  }

  function providerLabel(id) {
    return providers.find((p) => p.id === id)?.name || id;
  }

  function toggleExpanded(i) {
    setExpanded((prev) => ({ ...prev, [i]: !prev[i] }));
  }

  async function handleSend(promptOverride) {
    const text = (promptOverride || input).trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);
    setStage(0);
    setMessages((prev) => [...prev, { role: 'user', content: text, time: new Date().toISOString() }]);

    const requestPromise = api.orchestrate({ conversationId: activeId, query: text, provider, level });

    await sleep(500);
    setStage(1);

    let result;
    try {
      result = await requestPromise;
    } catch (err) {
      setSending(false);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Couldn't reach the backend — " + err.message, agents: [] }
      ]);
      return;
    }

    await sleep(400);
    setStage(2);
    await sleep(350);

    const agents = result.agents && result.agents.length ? result.agents : ['research', 'content'];
    const traces =
      result.agentTraces && result.agentTraces.length
        ? result.agentTraces
        : agents.map((a) => ({ agent: a, provider, ok: true }));

    setMessages((prev) => [...prev, { role: 'assistant', content: result.response, agents, agentTraces: traces }]);
    setActiveId(result.conversationId);
    setSending(false);
    loadConversations();
    refreshAnalytics();
  }

  return (
    <section className="page active console-page">
      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}

      <aside className={'history-drawer' + (drawerOpen ? ' open' : '')}>
        <div className="history-drawer-head">
          <span>CHAT HISTORY</span>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close">
            ×
          </button>
        </div>
        <button className="btn-primary new-chat-btn" onClick={startNewChat}>
          + New Chat
        </button>
        <div className="history-list">
          {conversations.length === 0 && <div className="empty-note">No chats yet</div>}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={'history-item' + (c.id === activeId ? ' active' : '')}
              onClick={() => openConversation(c.id)}
            >
              <span className="history-title">{c.title}</span>
              <button className="history-delete" onClick={(e) => handleDelete(c.id, e)} title="Delete chat">
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>

      <div className="chat chat-full">
        <div className="chat-topstrip">
          <button className="hamburger-btn" onClick={() => setDrawerOpen(true)} aria-label="Chat history">
            <span></span>
            <span></span>
            <span></span>
          </button>
          <span className="chat-topstrip-title">
            {activeId ? conversations.find((c) => c.id === activeId)?.title || 'Chat' : 'New chat'}
          </span>
          <button className="btn-secondary btn-tiny" onClick={startNewChat}>
            + New
          </button>
        </div>

        <div className="chat-scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="chat-empty">
              <div className="hero-glow"></div>
              <h2>
                One goal.
                <br />
                Many specialists.
                <br />
                <span className="grad-text">One verified answer.</span>
              </h2>
              <p>
                Describe what you need. NEXORA's orchestrator will plan the task, delegate it to the right
                specialist agents — each on its own AI provider — and verify the result before responding.
              </p>
              <div className="chips">
                {SUGGESTIONS.map((s) => (
                  <div key={s.label} className="chip" onClick={() => handleSend(s.prompt)}>
                    {s.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={'msg ' + m.role}>
              <div className={'avatar ' + m.role}>{m.role === 'user' ? 'Y' : '✦'}</div>
              <div className="msg-body">
                <div className="msg-role">{m.role === 'user' ? 'YOU' : 'NEXORA'}</div>
                <div className="msg-bubble" dangerouslySetInnerHTML={{ __html: formatText(m.content) }} />
                {m.role === 'assistant' && m.agents && m.agents.length > 0 && (
                  <div className="agent-trace">
                    <button className="agent-trace-toggle" onClick={() => toggleExpanded(i)}>
                      {expanded[i] ? '▾' : '▸'} {m.agents.length} agent{m.agents.length > 1 ? 's' : ''} used
                    </button>
                    {expanded[i] && (
                      <div className="agent-trace-chips">
                        {m.agents.map((a) => {
                          const trace = (m.agentTraces || []).find((t) => t.agent === a);
                          return (
                            <span className="trace-chip" key={a}>
                              <span className="trace-chip-icon">{AGENT_CONFIG[a]?.icon}</span>
                              {AGENT_CONFIG[a]?.label}
                              {trace && <span className="trace-chip-provider"> · {providerLabel(trace.provider)}</span>}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="msg assistant">
              <div className="avatar assistant">✦</div>
              <div className="msg-body">
                <div className="msg-role">NEXORA</div>
                <div className="processing-strip">
                  {STAGE_LABELS.map((label, i) => (
                    <span key={label} className={'stage-pill' + (i === stage ? ' active' : i < stage ? ' done' : '')}>
                      {i < stage ? '✓' : i === stage ? <span className="stage-dot" /> : ''} {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="model-bar">
          <span className="model-bar-label">MODEL</span>
          <select className="model-select" value={provider} onChange={(e) => changeProvider(e.target.value)}>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {availableLevels.length > 1 && (
            <select className="model-select" value={level} onChange={(e) => setLevel(e.target.value)}>
              {availableLevels.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]} · {providerData.levels[l].label}
                </option>
              ))}
            </select>
          )}
          <span className={'model-bar-status ' + (providerData?.configured ? 'ok' : 'warn')}>
            {providerData?.configured ? '● Ready' : '○ No key — add it to backend/.env'}
          </span>
        </div>

        <div className="chat-input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            placeholder="Describe your goal for NEXORA..."
            disabled={sending}
          />
          <button className="btn-primary" onClick={() => handleSend()} disabled={sending || !input.trim()}>
            SEND
          </button>
        </div>
      </div>
    </section>
  );
}