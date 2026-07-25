import { useState } from 'react';
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

  return (
    <div className="page active">
      <div className="page-pad">
        <h1 className="page-title">Settings</h1>
        <p className="page-desc">Model connection, security controls, and workspace preferences.</p>

        <div className="settings-panel">
          <div className="panel">
            <div className="panel-head-row">
              <h4>Model Providers</h4>
              <button className="btn-secondary btn-tiny" onClick={refreshProviders}>
                ↻ Refresh
              </button>
            </div>
            <p className="provider-note">
              API keys live in <code>backend/.env</code> — not here. Add a key, restart the backend server, and it
              shows as CONFIGURED below. This keeps your keys off the browser entirely. The provider you pick in the
              Console's model bar is the one every agent runs on.
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