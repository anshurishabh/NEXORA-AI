import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { AGENT_CONFIG } from '../constants.js';

const SUGGESTIONS = [
  { label: 'Research: EV market in India', prompt: 'Research the electric vehicle market in India and summarize the key trends' },
  { label: 'Code: dedupe a CSV in Python', prompt: 'Write a Python function to detect duplicate rows in a CSV file and explain how it works' },
  { label: 'Imagine: a cyberpunk city at night', prompt: '/imagine a cyberpunk city skyline at night, neon lights, rain, cinematic' },
  { label: 'Draft: project report summary', prompt: 'Draft a short project report summary for a multi-agent AI assistant final year project' }
];

const STAGE_LABELS = ['Planning', 'Delegating', 'Verifying'];
const IMAGE_STAGE_LABELS = ['Prompting', 'Rendering'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatText(str) {
  const esc = (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

const CODE_LANGUAGES = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'cpp', label: 'C++' },
  { id: 'c', label: 'C' },
  { id: 'java', label: 'Java' }
];

export default function Console() {
  const { providers, refreshAnalytics } = useApp();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [imagining, setImagining] = useState(false);
  const [stage, setStage] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [pendingFile, setPendingFile] = useState(null);
  const [attaching, setAttaching] = useState(false);

  // Voice
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const recognitionRef = useRef(null);

  // Code runner
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [codeLang, setCodeLang] = useState('python');
  const [codeInput, setCodeInput] = useState('');
  const [codeRunning, setCodeRunning] = useState(false);
  const [codeOutput, setCodeOutput] = useState(null);

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  const groq = providers.find((p) => p.id === 'groq');

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
  }, [messages, sending, imagining]);

  function speak(text) {
    if (!voiceOn || !text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.replace(/\*\*/g, ''));
    utter.lang = 'en-IN';
    window.speechSynthesis.speak(utter);
  }

  function toggleListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput((prev) => (prev ? prev + ' ' + transcript : transcript));
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

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
    setPendingFile(null);
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

  function toggleExpanded(i) {
    setExpanded((prev) => ({ ...prev, [i]: !prev[i] }));
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    setAttaching(true);
    try {
      if (file.type.startsWith('image/')) {
        const dataUrl = await readAsDataURL(file);
        const base64 = dataUrl.split(',')[1];
        setPendingFile({ kind: 'image', name: file.name, base64, mimeType: file.type, previewUrl: dataUrl });
      } else if (/\.(txt|md|csv)$/i.test(file.name)) {
        const text = await readAsText(file);
        setPendingFile({ kind: 'document', name: file.name, text });
      } else if (/\.(pdf|docx)$/i.test(file.name)) {
        const dataUrl = await readAsDataURL(file);
        const base64 = dataUrl.split(',')[1];
        const extracted = await api.extractDocument({ filename: file.name, fileBase64: base64 });
        setPendingFile({ kind: 'document', name: file.name, text: extracted.text, warning: extracted.warning });
      } else {
        alert('Unsupported file type. Please attach an image, .txt, .md, .csv, .pdf, or .docx file.');
      }
    } catch (err) {
      alert("Couldn't read that file — " + err.message);
    }
    setAttaching(false);
  }

  function removePendingFile() {
    setPendingFile(null);
  }

  async function runCode() {
    if (!codeInput.trim()) return;
    setCodeRunning(true);
    setCodeOutput(null);
    try {
      const result = await api.executeCode({ language: codeLang, code: codeInput });
      setCodeOutput(result);
    } catch (err) {
      setCodeOutput({ error: err.message });
    }
    setCodeRunning(false);
  }

  async function handleSend(promptOverride) {
    const raw = (promptOverride || input).trim();
    if ((!raw && !pendingFile) || sending || imagining) return;

    // /imagine <prompt> — routes to image generation
    const imagineMatch = raw.match(/^\/imagine\s+(.+)/i);
    if (imagineMatch) {
      const imgPrompt = imagineMatch[1].trim();
      setInput('');
      setImagining(true);
      setMessages((prev) => [...prev, { role: 'user', content: raw, time: new Date().toISOString() }]);
      try {
        const result = await api.generateImage({ conversationId: activeId, prompt: imgPrompt });
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '',
            imageUrl: result.imageUrl,
            imagePrompt: result.prompt,
            agents: ['content'],
            agentTraces: [{ agent: 'content', provider: 'pollinations', ok: true }]
          }
        ]);
        setActiveId(result.conversationId);
        loadConversations();
        refreshAnalytics();
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: "Couldn't generate that image — " + err.message, agents: [] }
        ]);
      }
      setImagining(false);
      return;
    }

    const text = raw;
    const attachmentForSend = pendingFile;
    setInput('');
    setPendingFile(null);

    // Attachments (image/document) use the normal, non-streaming path.
    if (attachmentForSend) {
      setSending(true);
      setStage(0);
      setMessages((prev) => [
        ...prev,
        {
          role: 'user',
          content: text,
          attachment: { name: attachmentForSend.name, type: attachmentForSend.kind },
          time: new Date().toISOString()
        }
      ]);

      const attachmentPayload =
        attachmentForSend.kind === 'image'
          ? { type: 'image', name: attachmentForSend.name, base64: attachmentForSend.base64, mimeType: attachmentForSend.mimeType }
          : { type: 'document', name: attachmentForSend.name, text: attachmentForSend.text };

      const requestPromise = api.orchestrate({ conversationId: activeId, query: text, attachment: attachmentPayload });
      await sleep(400);
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
      await sleep(300);
      setStage(2);
      await sleep(250);

      const agents = result.agents && result.agents.length ? result.agents : ['research', 'content'];
      const traces =
        result.agentTraces && result.agentTraces.length
          ? result.agentTraces
          : agents.map((a) => ({ agent: a, provider: 'groq', ok: true }));

      setMessages((prev) => [...prev, { role: 'assistant', content: result.response, agents, agentTraces: traces }]);
      setActiveId(result.conversationId);
      setSending(false);
      speak(result.response);
      loadConversations();
      refreshAnalytics();
      return;
    }

    // Plain text — streams the response with a live typing effect.
    setSending(true);
    setStage(0);
    setMessages((prev) => [...prev, { role: 'user', content: text, time: new Date().toISOString() }]);

    let assistantIndex = -1;
    setMessages((prev) => {
      assistantIndex = prev.length;
      return [...prev, { role: 'assistant', content: '', agents: [], agentTraces: [], streaming: true }];
    });

    let accumulated = '';

    try {
      await api.streamOrchestrate({ conversationId: activeId, query: text }, (evt) => {
        if (evt.type === 'stage') {
          setStage(evt.stage === 'planning' ? 0 : evt.stage === 'delegating' ? 1 : 2);
        } else if (evt.type === 'agents') {
          setMessages((prev) => {
            const copy = [...prev];
            copy[assistantIndex] = { ...copy[assistantIndex], agents: evt.agents, agentTraces: evt.agentTraces };
            return copy;
          });
        } else if (evt.type === 'token') {
          accumulated += evt.text;
          setMessages((prev) => {
            const copy = [...prev];
            copy[assistantIndex] = { ...copy[assistantIndex], content: accumulated };
            return copy;
          });
        } else if (evt.type === 'done') {
          setActiveId(evt.conversationId);
        } else if (evt.type === 'error') {
          accumulated = evt.message;
          setMessages((prev) => {
            const copy = [...prev];
            copy[assistantIndex] = { ...copy[assistantIndex], content: accumulated };
            return copy;
          });
          setActiveId(evt.conversationId);
        }
      });
    } catch (err) {
      accumulated = "Couldn't reach the backend — " + err.message;
      setMessages((prev) => {
        const copy = [...prev];
        copy[assistantIndex] = { ...copy[assistantIndex], content: accumulated };
        return copy;
      });
    }

    setMessages((prev) => {
      const copy = [...prev];
      copy[assistantIndex] = { ...copy[assistantIndex], streaming: false };
      return copy;
    });
    setSending(false);
    speak(accumulated);
    loadConversations();
    refreshAnalytics();
  }

  const busy = sending || imagining;

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

      {codeModalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
          }}
          onClick={() => setCodeModalOpen(false)}
        >
          <div
            style={{
              background: '#14141c', border: '1px solid #2a2a36', borderRadius: 12,
              width: 'min(640px, 92vw)', maxHeight: '85vh', overflowY: 'auto', padding: 20
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>🖥️ Code Runner</h4>
              <button
                onClick={() => setCodeModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 20, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <select
              value={codeLang}
              onChange={(e) => setCodeLang(e.target.value)}
              style={{ marginBottom: 10, padding: '6px 10px', borderRadius: 6, background: '#1c1c26', color: '#eee', border: '1px solid #333' }}
            >
              {CODE_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>

            <textarea
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder={'Write your ' + codeLang + ' code here...'}
              rows={10}
              style={{
                width: '100%', background: '#0e0e14', color: '#e6e6e6', border: '1px solid #333',
                borderRadius: 8, padding: 10, fontFamily: 'monospace', fontSize: 13, marginBottom: 10, resize: 'vertical'
              }}
            />

            <button className="btn-primary" onClick={runCode} disabled={codeRunning || !codeInput.trim()}>
              {codeRunning ? 'Running...' : '▶ Run'}
            </button>

            {codeOutput && (
              <div style={{ marginTop: 14, fontFamily: 'monospace', fontSize: 13 }}>
                {codeOutput.error && <div style={{ color: '#ff6b6b' }}>Error: {codeOutput.error}</div>}
                {codeOutput.compileError && (
                  <div style={{ color: '#ff6b6b', whiteSpace: 'pre-wrap' }}>Compile error:\n{codeOutput.compileError}</div>
                )}
                {codeOutput.stdout && (
                  <div style={{ whiteSpace: 'pre-wrap', color: '#9be89b' }}>
                    <div style={{ opacity: 0.6, marginBottom: 4 }}>stdout:</div>
                    {codeOutput.stdout}
                  </div>
                )}
                {codeOutput.stderr && (
                  <div style={{ whiteSpace: 'pre-wrap', color: '#e0a458', marginTop: 8 }}>
                    <div style={{ opacity: 0.6, marginBottom: 4 }}>stderr:</div>
                    {codeOutput.stderr}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
                Type, speak, attach a file, or generate an image with <code>/imagine</code>. NEXORA's orchestrator
                handles the rest.
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
                {m.attachment && (
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                    {m.attachment.type === 'image' ? '🖼️' : '📎'} {m.attachment.name}
                  </div>
                )}
                {m.imageUrl && (
                  <div style={{ marginBottom: 6 }}>
                    <img
                      src={m.imageUrl}
                      alt={m.imagePrompt || 'Generated image'}
                      style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }}
                    />
                    {m.imagePrompt && (
                      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Prompt: {m.imagePrompt}</div>
                    )}
                  </div>
                )}
                {m.content && (
                  <div className="msg-bubble" dangerouslySetInnerHTML={{ __html: formatText(m.content) + (m.streaming ? ' ▌' : '') }} />
                )}
                {m.role === 'assistant' && m.agents && m.agents.length > 0 && (
                  <div className="agent-trace">
                    <button className="agent-trace-toggle" onClick={() => toggleExpanded(i)}>
                      {expanded[i] ? '▾' : '▸'} {m.agents.length} agent{m.agents.length > 1 ? 's' : ''} used
                    </button>
                    {expanded[i] && (
                      <div className="agent-trace-chips">
                        {m.agents.map((a) => (
                          <span className="trace-chip" key={a}>
                            <span className="trace-chip-icon">{AGENT_CONFIG[a]?.icon}</span>
                            {AGENT_CONFIG[a]?.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {imagining && (
            <div className="msg assistant">
              <div className="avatar assistant">✦</div>
              <div className="msg-body">
                <div className="msg-role">NEXORA</div>
                <div className="processing-strip">
                  {IMAGE_STAGE_LABELS.map((label) => (
                    <span key={label} className="stage-pill active">
                      <span className="stage-dot" /> {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="model-bar">
          <span className="model-bar-label">MODEL</span>
          <span className="model-bar-fixed">Groq</span>
          <span className={'model-bar-status ' + (groq?.configured ? 'ok' : 'warn')}>
            {groq?.configured ? '● Ready' : '○ No key — add GROQ_API_KEY to backend/.env'}
          </span>
          <button
            className="btn-secondary btn-tiny"
            onClick={() => setVoiceOn((v) => !v)}
            style={{ marginLeft: 'auto' }}
            title="Toggle voice replies"
          >
            {voiceOn ? '🔊 Voice: ON' : '🔇 Voice: OFF'}
          </button>
        </div>

        {pendingFile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', fontSize: 13, opacity: 0.85 }}>
            {pendingFile.kind === 'image' ? '🖼️' : '📎'} {pendingFile.name}
            {pendingFile.warning && <span style={{ color: '#e0a458' }}> — {pendingFile.warning}</span>}
            <button
              onClick={removePendingFile}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7 }}
              title="Remove attachment"
            >
              ×
            </button>
          </div>
        )}

        <div className="chat-input-row">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.txt,.md,.csv,.pdf,.docx"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
          />
          <button
            className="btn-secondary btn-tiny"
            onClick={openFilePicker}
            disabled={busy || attaching}
            title="Attach a file or photo"
            style={{ marginRight: 4 }}
          >
            {attaching ? '...' : '📎'}
          </button>
          <button
            className="btn-secondary btn-tiny"
            onClick={toggleListening}
            disabled={busy}
            title="Voice input"
            style={{ marginRight: 4, background: listening ? '#5b3fd1' : undefined }}
          >
            {listening ? '🔴' : '🎤'}
          </button>
          <button
            className="btn-secondary btn-tiny"
            onClick={() => setCodeModalOpen(true)}
            disabled={busy}
            title="Run code"
            style={{ marginRight: 6 }}
          >
            🖥️
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            placeholder="Describe your goal, speak, attach a file, or /imagine <prompt>..."
            disabled={busy}
          />
          <button
            className="btn-primary"
            onClick={() => handleSend()}
            disabled={busy || (!input.trim() && !pendingFile)}
          >
            SEND
          </button>
        </div>
      </div>
    </section>
  );
}