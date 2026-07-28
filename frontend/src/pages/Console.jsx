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
const sleep = (ms) => new Promise(function (resolve) { setTimeout(resolve, ms); });

const RUNNABLE_LANGS = {
  python: 'python',
  py: 'python',
  javascript: 'javascript',
  js: 'javascript',
  node: 'javascript',
  nodejs: 'javascript',
  cpp: 'cpp',
  'c++': 'cpp',
  c: 'c',
  java: 'java'
};
const FILE_EXT = { python: 'py', javascript: 'js', cpp: 'cpp', c: 'c', java: 'java' };

function formatInline(str) {
  const esc = (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
}

function parseContentBlocks(content) {
  const blocks = [];
  const regex = /```(\w+)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    blocks.push({ type: 'code', lang: (match[1] || 'text').toLowerCase(), value: match[2].replace(/\n$/, '') });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    blocks.push({ type: 'text', value: content.slice(lastIndex) });
  }
  return blocks;
}

function CodeBlock(props) {
  const lang = props.lang;
  const code = props.code;
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState(null);
  const runnableLang = RUNNABLE_LANGS[lang];

  function copy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
    }
    setCopied(true);
    setTimeout(function () {
      setCopied(false);
    }, 1500);
  }

  function download() {
    const ext = FILE_EXT[runnableLang] || 'txt';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nexora-snippet.' + ext;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function run() {
    setRunning(true);
    setOutput(null);
    try {
      const result = await api.executeCode({ language: runnableLang, code: code });
      setOutput(result);
    } catch (err) {
      setOutput({ error: err.message });
    }
    setRunning(false);
  }

  return (
    <div style={{ background: '#0d0d13', border: '1px solid #26262f', borderRadius: 10, margin: '8px 0', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #26262f', background: '#13131a' }}>
        <span style={{ fontSize: 12, color: '#9a9aa8', textTransform: 'capitalize' }}>{lang}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {runnableLang && (
            <button onClick={run} disabled={running} title="Run code" style={{ background: 'none', border: 'none', color: running ? '#666' : '#9be89b', cursor: running ? 'default' : 'pointer', fontSize: 14 }}>
              {running ? '⏳' : '▶'}
            </button>
          )}
          <button onClick={download} title="Download" style={{ background: 'none', border: 'none', color: '#9a9aa8', cursor: 'pointer', fontSize: 14 }}>
            ⭳
          </button>
          <button onClick={copy} title="Copy" style={{ background: 'none', border: 'none', color: copied ? '#9be89b' : '#9a9aa8', cursor: 'pointer', fontSize: 14 }}>
            {copied ? '✓' : '⧉'}
          </button>
        </div>
      </div>
      <pre style={{ margin: 0, padding: '12px 14px', overflowX: 'auto', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5, color: '#e2e2ea' }}>
        <code>{code}</code>
      </pre>
      {output && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid #26262f', fontFamily: 'monospace', fontSize: 12.5 }}>
          {output.error && <div style={{ color: '#ff6b6b' }}>Error: {output.error}</div>}
          {output.compileError && (
            <div style={{ color: '#ff6b6b', whiteSpace: 'pre-wrap' }}>
              Compile error:{String.fromCharCode(10)}{output.compileError}
            </div>
          )}
          {output.stdout && (
            <div style={{ whiteSpace: 'pre-wrap', color: '#9be89b' }}>
              <div style={{ opacity: 0.55, marginBottom: 4 }}>stdout:</div>
              {output.stdout}
            </div>
          )}
          {output.stderr && (
            <div style={{ whiteSpace: 'pre-wrap', color: '#e0a458', marginTop: 6 }}>
              <div style={{ opacity: 0.55, marginBottom: 4 }}>stderr:</div>
              {output.stderr}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MessageContent(props) {
  const blocks = parseContentBlocks(props.content || '');
  return (
    <>
      {blocks.map(function (b, i) {
        if (b.type === 'code') {
          return <CodeBlock key={i} lang={b.lang} code={b.value} />;
        }
        if (b.value.trim()) {
          return <div key={i} className="msg-bubble" dangerouslySetInnerHTML={{ __html: formatInline(b.value) }} />;
        }
        return null;
      })}
    </>
  );
}

function readAsDataURL(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () {
      resolve(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readAsText(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () {
      resolve(reader.result);
    };
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
  const appCtx = useApp();
  const providers = appCtx.providers;
  const refreshAnalytics = appCtx.refreshAnalytics;

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

  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const recognitionRef = useRef(null);

  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [codeLang, setCodeLang] = useState('python');
  const [codeInput, setCodeInput] = useState('');
  const [codeRunning, setCodeRunning] = useState(false);
  const [codeOutput, setCodeOutput] = useState(null);

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  const groq = providers.find(function (p) {
    return p.id === 'groq';
  });

  const loadConversations = useCallback(async function () {
    try {
      const data = await api.listConversations();
      setConversations(data.conversations);
    } catch (err) {
      // sidebar just stays empty if the backend is unreachable
    }
  }, []);

  useEffect(function () {
    loadConversations();
  }, [loadConversations]);

  useEffect(function () {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending, imagining]);

  function speak(text) {
    if (!voiceOn || !text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/\*\*/g, '').replace(/```[\s\S]*?```/g, 'a code block');
    const utter = new SpeechSynthesisUtterance(clean);
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
      if (recognitionRef.current) recognitionRef.current.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = function (e) {
      const transcript = e.results[0][0].transcript;
      setInput(function (prev) {
        return prev ? prev + ' ' + transcript : transcript;
      });
    };
    recognition.onerror = function () {
      setListening(false);
    };
    recognition.onend = function () {
      setListening(false);
    };
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
    setExpanded(function (prev) {
      const copy = Object.assign({}, prev);
      copy[i] = !copy[i];
      return copy;
    });
  }

  function openFilePicker() {
    if (fileInputRef.current) fileInputRef.current.click();
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
        setPendingFile({ kind: 'image', name: file.name, base64: base64, mimeType: file.type, previewUrl: dataUrl });
      } else if (/\.(txt|md|csv)$/i.test(file.name)) {
        const text = await readAsText(file);
        setPendingFile({ kind: 'document', name: file.name, text: text });
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

    const imagineMatch = raw.match(/^\/imagine\s+(.+)/i);
    if (imagineMatch) {
      const imgPrompt = imagineMatch[1].trim();
      setInput('');
      setImagining(true);
      setMessages(function (prev) {
        return prev.concat([{ role: 'user', content: raw, time: new Date().toISOString() }]);
      });
      try {
        const result = await api.generateImage({ conversationId: activeId, prompt: imgPrompt });
        setMessages(function (prev) {
          return prev.concat([{
            role: 'assistant',
            content: '',
            imageUrl: result.imageUrl,
            imagePrompt: result.prompt,
            agents: ['content'],
            agentTraces: [{ agent: 'content', provider: 'pollinations', ok: true }]
          }]);
        });
        setActiveId(result.conversationId);
        loadConversations();
        refreshAnalytics();
      } catch (err) {
        setMessages(function (prev) {
          return prev.concat([{ role: 'assistant', content: "Couldn't generate that image — " + err.message, agents: [] }]);
        });
      }
      setImagining(false);
      return;
    }

    const text = raw;
    const attachmentForSend = pendingFile;
    setInput('');
    setPendingFile(null);

    if (attachmentForSend) {
      setSending(true);
      setStage(0);
      setMessages(function (prev) {
        return prev.concat([{
          role: 'user',
          content: text,
          attachment: { name: attachmentForSend.name, type: attachmentForSend.kind },
          time: new Date().toISOString()
        }]);
      });

      const attachmentPayload = attachmentForSend.kind === 'image'
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
        setMessages(function (prev) {
          return prev.concat([{ role: 'assistant', content: "Couldn't reach the backend — " + err.message, agents: [] }]);
        });
        return;
      }
      await sleep(300);
      setStage(2);
      await sleep(250);

      const agents = result.agents && result.agents.length ? result.agents : ['research', 'content'];
      const traces = result.agentTraces && result.agentTraces.length
        ? result.agentTraces
        : agents.map(function (a) {
            return { agent: a, provider: 'groq', ok: true };
          });

      setMessages(function (prev) {
        return prev.concat([{ role: 'assistant', content: result.response, agents: agents, agentTraces: traces }]);
      });
      setActiveId(result.conversationId);
      setSending(false);
      speak(result.response);
      loadConversations();
      refreshAnalytics();
      return;
    }

    setSending(true);
    setStage(0);
    setMessages(function (prev) {
      return prev.concat([{ role: 'user', content: text, time: new Date().toISOString() }]);
    });

    let assistantIndex = -1;
    setMessages(function (prev) {
      assistantIndex = prev.length;
      return prev.concat([{ role: 'assistant', content: '', agents: [], agentTraces: [], streaming: true }]);
    });

    let accumulated = '';

    try {
      await api.streamOrchestrate({ conversationId: activeId, query: text }, function (evt) {
        if (evt.type === 'stage') {
          setStage(evt.stage === 'planning' ? 0 : evt.stage === 'delegating' ? 1 : 2);
        } else if (evt.type === 'agents') {
          setMessages(function (prev) {
            const copy = prev.slice();
            copy[assistantIndex] = Object.assign({}, copy[assistantIndex], { agents: evt.agents, agentTraces: evt.agentTraces });
            return copy;
          });
        } else if (evt.type === 'token') {
          accumulated += evt.text;
          setMessages(function (prev) {
            const copy = prev.slice();
            copy[assistantIndex] = Object.assign({}, copy[assistantIndex], { content: accumulated });
            return copy;
          });
        } else if (evt.type === 'done') {
          setActiveId(evt.conversationId);
        } else if (evt.type === 'error') {
          accumulated = evt.message;
          setMessages(function (prev) {
            const copy = prev.slice();
            copy[assistantIndex] = Object.assign({}, copy[assistantIndex], { content: accumulated });
            return copy;
          });
          setActiveId(evt.conversationId);
        }
      });
    } catch (err) {
      accumulated = "Couldn't reach the backend — " + err.message;
      setMessages(function (prev) {
        const copy = prev.slice();
        copy[assistantIndex] = Object.assign({}, copy[assistantIndex], { content: accumulated });
        return copy;
      });
    }

    setMessages(function (prev) {
      const copy = prev.slice();
      copy[assistantIndex] = Object.assign({}, copy[assistantIndex], { streaming: false });
      return copy;
    });
    setSending(false);
    speak(accumulated);
    loadConversations();
    refreshAnalytics();
  }

  const busy = sending || imagining;
  const activeTitle = activeId
    ? (function () {
        const found = conversations.find(function (c) {
          return c.id === activeId;
        });
        return found ? found.title : 'Chat';
      })()
    : 'New chat';

  return (
    <section className="page active console-page">
      {drawerOpen && <div className="drawer-backdrop" onClick={function () { setDrawerOpen(false); }} />}

      <aside className={'history-drawer' + (drawerOpen ? ' open' : '')}>
        <div className="history-drawer-head">
          <span>CHAT HISTORY</span>
          <button className="drawer-close" onClick={function () { setDrawerOpen(false); }} aria-label="Close">
            ×
          </button>
        </div>
        <button className="btn-primary new-chat-btn" onClick={startNewChat}>
          + New Chat
        </button>
        <div className="history-list">
          {conversations.length === 0 && <div className="empty-note">No chats yet</div>}
          {conversations.map(function (c) {
            return (
              <div
                key={c.id}
                className={'history-item' + (c.id === activeId ? ' active' : '')}
                onClick={function () { openConversation(c.id); }}
              >
                <span className="history-title">{c.title}</span>
                <button className="history-delete" onClick={function (e) { handleDelete(c.id, e); }} title="Delete chat">
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {codeModalOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={function () { setCodeModalOpen(false); }}
        >
          <div
            style={{ background: '#14141c', border: '1px solid #2a2a36', borderRadius: 12, width: 'min(640px, 92vw)', maxHeight: '85vh', overflowY: 'auto', padding: 20 }}
            onClick={function (e) { e.stopPropagation(); }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>Code Runner</h4>
              <button onClick={function () { setCodeModalOpen(false); }} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 20, cursor: 'pointer' }}>
                ×
              </button>
            </div>

            <select
              value={codeLang}
              onChange={function (e) { setCodeLang(e.target.value); }}
              style={{ marginBottom: 10, padding: '6px 10px', borderRadius: 6, background: '#1c1c26', color: '#eee', border: '1px solid #333' }}
            >
              {CODE_LANGUAGES.map(function (l) {
                return <option key={l.id} value={l.id}>{l.label}</option>;
              })}
            </select>

            <textarea
              value={codeInput}
              onChange={function (e) { setCodeInput(e.target.value); }}
              placeholder={'Write your ' + codeLang + ' code here...'}
              rows={10}
              style={{ width: '100%', background: '#0e0e14', color: '#e6e6e6', border: '1px solid #333', borderRadius: 8, padding: 10, fontFamily: 'monospace', fontSize: 13, marginBottom: 10, resize: 'vertical' }}
            />

            <button className="btn-primary" onClick={runCode} disabled={codeRunning || !codeInput.trim()}>
              {codeRunning ? 'Running...' : 'Run'}
            </button>

            {codeOutput && (
              <div style={{ marginTop: 14, fontFamily: 'monospace', fontSize: 13 }}>
                {codeOutput.error && <div style={{ color: '#ff6b6b' }}>Error: {codeOutput.error}</div>}
                {codeOutput.compileError && (
                  <div style={{ color: '#ff6b6b', whiteSpace: 'pre-wrap' }}>
                    Compile error:{String.fromCharCode(10)}{codeOutput.compileError}
                  </div>
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
          <button className="hamburger-btn" onClick={function () { setDrawerOpen(true); }} aria-label="Chat history">
            <span></span>
            <span></span>
            <span></span>
          </button>
          <span className="chat-topstrip-title">{activeTitle}</span>
          {activeId ? (
            <a
              className="btn-secondary btn-tiny"
              href={api.conversationExportUrl(activeId, 'txt')}
              download
              style={{ marginRight: 6, textDecoration: 'none' }}
              title="Export this chat"
            >
              Export
            </a>
          ) : null}
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
                Type, speak, attach a file, or generate an image with /imagine. Any code in a response becomes a
                runnable, copyable card.
              </p>
              <div className="chips">
                {SUGGESTIONS.map(function (s) {
                  return (
                    <div key={s.label} className="chip" onClick={function () { handleSend(s.prompt); }}>
                      {s.label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {messages.map(function (m, i) {
            return (
              <div key={i} className={'msg ' + m.role}>
                <div className={'avatar ' + m.role}>{m.role === 'user' ? 'Y' : '✦'}</div>
                <div className="msg-body">
                  <div className="msg-role">{m.role === 'user' ? 'YOU' : 'NEXORA'}</div>
                  {m.attachment && (
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                      {m.attachment.type === 'image' ? 'Image' : 'File'}: {m.attachment.name}
                    </div>
                  )}
                  {m.imageUrl && (
                    <div style={{ marginBottom: 6 }}>
                      <img src={m.imageUrl} alt={m.imagePrompt || 'Generated image'} style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} />
                      {m.imagePrompt && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Prompt: {m.imagePrompt}</div>}
                    </div>
                  )}
                  {m.content && (
                    <>
                      <MessageContent content={m.content} />
                      {m.streaming && <span style={{ opacity: 0.6 }}>▌</span>}
                    </>
                  )}
                  {m.role === 'assistant' && m.agents && m.agents.length > 0 && (
                    <div className="agent-trace">
                      <button className="agent-trace-toggle" onClick={function () { toggleExpanded(i); }}>
                        {expanded[i] ? '▾' : '▸'} {m.agents.length} agent{m.agents.length > 1 ? 's' : ''} used
                      </button>
                      {expanded[i] && (
                        <div className="agent-trace-chips">
                          {m.agents.map(function (a) {
                            const cfg = AGENT_CONFIG[a];
                            return (
                              <span className="trace-chip" key={a}>
                                <span className="trace-chip-icon">{cfg ? cfg.icon : ''}</span>
                                {cfg ? cfg.label : a}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {imagining && (
            <div className="msg assistant">
              <div className="avatar assistant">✦</div>
              <div className="msg-body">
                <div className="msg-role">NEXORA</div>
                <div className="processing-strip">
                  {IMAGE_STAGE_LABELS.map(function (label) {
                    return (
                      <span key={label} className="stage-pill active">
                        <span className="stage-dot" /> {label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="model-bar">
          <span className="model-bar-label">MODEL</span>
          <span className="model-bar-fixed">Groq</span>
          <span className={'model-bar-status ' + (groq && groq.configured ? 'ok' : 'warn')}>
            {groq && groq.configured ? 'Ready' : 'No key — add GROQ_API_KEY to backend/.env'}
          </span>
          <button className="btn-secondary btn-tiny" onClick={function () { setVoiceOn(function (v) { return !v; }); }} style={{ marginLeft: 'auto' }} title="Toggle voice replies">
            {voiceOn ? 'Voice: ON' : 'Voice: OFF'}
          </button>
        </div>

        {pendingFile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', fontSize: 13, opacity: 0.85 }}>
            {pendingFile.kind === 'image' ? 'Image' : 'File'}: {pendingFile.name}
            {pendingFile.warning && <span style={{ color: '#e0a458' }}> — {pendingFile.warning}</span>}
            <button onClick={removePendingFile} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7 }} title="Remove attachment">
              ×
            </button>
          </div>
        )}

        <div className="chat-input-row">
          <input ref={fileInputRef} type="file" accept="image/*,.txt,.md,.csv,.pdf,.docx" style={{ display: 'none' }} onChange={handleFileSelected} />
          <button className="btn-secondary btn-tiny" onClick={openFilePicker} disabled={busy || attaching} title="Attach a file or photo" style={{ marginRight: 4 }}>
            {attaching ? '...' : 'Attach'}
          </button>
          <button className="btn-secondary btn-tiny" onClick={toggleListening} disabled={busy} title="Voice input" style={{ marginRight: 4, background: listening ? '#5b3fd1' : undefined }}>
            {listening ? 'Stop' : 'Mic'}
          </button>
          <button className="btn-secondary btn-tiny" onClick={function () { setCodeModalOpen(true); }} disabled={busy} title="Run code" style={{ marginRight: 6 }}>
            Code
          </button>
          <input
            value={input}
            onChange={function (e) { setInput(e.target.value); }}
            onKeyDown={function (e) {
              if (e.key === 'Enter') handleSend();
            }}
            placeholder="Describe your goal, speak, attach a file, or /imagine <prompt>..."
            disabled={busy}
          />
          <button className="btn-primary" onClick={function () { handleSend(); }} disabled={busy || (!input.trim() && !pendingFile)}>
            SEND
          </button>
        </div>
      </div>
    </section>
  );
}