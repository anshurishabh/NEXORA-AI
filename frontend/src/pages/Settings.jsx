import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../api.js';
import { LEVEL_LABEL, LEVEL_ORDER } from '../constants.js';

function ToggleRow({ title, desc, on, onClick }) {
  return (
    <div className="toggle-row">
      <div>
        <div className="t-title">{title}</div>
        <div className="t-desc">{desc}</div>
      </div>
      <div className={'toggle' + (on ? ' on' : '')} onClick={onClick}></div>
    </div>
  );
}

export default function Settings() {
  const { providers, loadingProviders, refreshProviders, refreshAnalytics } = useApp();
  const [toggles, setToggles] = useState({ injection: true, filescan: true, redaction: false });
  const [workspaceName, setWorkspaceName] = useState('My NEXORA Workspace');
  const [clearing, setClearing] = useState(false);

  const [memory, setMemory] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    api.getMemory().then((d) => setMemory(d.memory || [])).catch(() => {});
  }, []);

  function toggle(key) {
    setToggles((t) => ({ ...t, [key]: !t[key] }));
  }

  async function clearHistory() {
    if (!window.confirm('Delete ALL saved chat history? This cannot be undone.')) return;
    setClearing(true);
    try {
      await api.clearAllConversations();
      await refreshAnalytics();
      alert('Chat history cleared.');
    } catch (err) {
      alert('Failed to clear history: ' + err.message);
    }
    setClearing(false);
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const data = await api.addMemory(newNote.trim());
      setMemory(data.memory);
      setNewNote('');
    } catch (err) {
      alert('Could not save: ' + err.message);
    }
    setSavingNote(false);
  }

  async function removeNote(id) {
    try {
      const data = await api.deleteMemory(id);
      setMemory(data.memory);
    } catch (err) {
      alert('Could not delete: ' + err.message);
    }
  }

  return (
    <div className="page active">
      <div className="page-pad">
        <h1 className="page-title">Settings</h1>
        <p className="page-desc">Model connection, memory, security controls, and workspace preferences.</p>

        <div className="settings-panel">
          <div className="panel">
            <h4>🧠 Memory</h4>
            <p className="provider-note">
              Facts or preferences NEXORA should remember across every future chat — e.g. "I prefer answers in
              Hinglish" or "I'm a B.Tech CSE student at BBDU".
            </p>
            <div className="qa-row" style={{ marginBottom: 10 }}>
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addNote();
                }}
                placeholder="e.g. Always reply in Hinglish"
              />
              <button className="btn-primary" onClick={addNote} disabled={savingNote || !newNote.trim()}>
                Add
              </button>
            </div>
            {memory.length === 0 ? (
              <div className="empty-note">No memory saved yet.</div>
            ) : (
              memory.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 10px', borderRadius: 8, background: '#16161f', marginBottom: 6, fontSize: 13
                  }}
                >
                  <span>{m.text}</span>
                  <button
                    onClick={() => removeNote(m.id)}
                    style={{ background: 'none', border: 'none', color: '#e0a458', cursor: 'pointer', fontSize: 16 }}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="panel">
            <div className="panel-head-row">
              <h4>Model Providers</h4>
              <button className="btn-secondary btn-tiny" onClick={refreshProviders}>
                ↻ Refresh
              </button>
            </div>
            <p className="provider-note">
              API keys live in <code>backend/.env</code> — not here. Add a key, restart the backend server, and it
              shows as CONFIGURED below.
            </p>
            {loadingProviders ? (
              <div className="empty-note">Loading...</div>
            ) : (
              providers.map((p) => (
                <div className="provider-card" key={p.id}>
                  <div className="provider-card-top">
                    <h5>{p.name}</h5>
                    <span className={'provider-pill ' + (p.configured ? 'configured' : 'missing')}>
                      {p.configured ? 'CONFIGURED' : 'NOT SET'}
                    </span>
                  </div>
                  <div className="level-ref">
                    {LEVEL_ORDER.filter((l) => p.levels[l]).map((l) => (
                      <span className="level-chip" key={l}>
                        <b>{LEVEL_LABEL[l]}</b> {p.levels[l].label}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="panel">
            <h4>Security Agent Controls</h4>
            <ToggleRow
              title="Prompt injection detection"
              desc="Screens incoming tasks for manipulation attempts"
              on={toggles.injection}
              onClick={() => toggle('injection')}
            />
            <ToggleRow
              title="Malicious file scanning"
              desc="Checks uploads before they reach an agent"
              on={toggles.filescan}
              onClick={() => toggle('filescan')}
            />
            <ToggleRow
              title="Sensitive data redaction"
              desc="Masks emails, keys, and IDs in agent output"
              on={toggles.redaction}
              onClick={() => toggle('redaction')}
            />
          </div>

          <div className="panel">
            <h4>Workspace</h4>
            <div className="form-group">
              <label>WORKSPACE NAME</label>
              <input type="text" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
            </div>
            <button className="btn-secondary" onClick={clearHistory} disabled={clearing}>
              {clearing ? 'Clearing...' : 'Clear all chat history'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}