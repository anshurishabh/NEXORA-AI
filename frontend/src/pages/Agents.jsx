import { useState } from 'react';
import { AGENT_CONFIG } from '../constants.js';

function AgentCard({ cfg, custom }) {
  const usage = custom ? 0 : Math.floor(20 + Math.random() * 90);
  return (
    <div className="agent-card">
      <div className="agent-card-top">
        <div className="agent-card-icon">{cfg.icon}</div>
        <span className={'agent-badge' + (custom ? ' custom' : '')}>{custom ? 'CUSTOM' : 'ACTIVE'}</span>
      </div>
      <h4>{cfg.label}</h4>
      <p>{cfg.desc}</p>
      <div className="agent-stats-row">
        <span>{usage} tasks</span>
        <span>Ready</span>
      </div>
    </div>
  );
}

export default function Agents() {
  const [customAgents, setCustomAgents] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');

  function deploy() {
    if (!name.trim()) return;
    setCustomAgents((prev) => [
      ...prev,
      { key: 'custom_' + Date.now(), label: name.trim(), icon: '✦', desc: role.trim() || 'Custom agent — no instructions provided.' }
    ]);
    setName('');
    setRole('');
    setModalOpen(false);
  }

  const core = Object.entries(AGENT_CONFIG).filter(([, c]) => c.group === 'core');
  const specialist = Object.entries(AGENT_CONFIG).filter(([, c]) => c.group === 'specialist');

  return (
    <div className="page active">
      <div className="page-pad">
        <h1 className="page-title">Agent Marketplace</h1>
        <p className="page-desc">
          Every specialist NEXORA can call on, plus any custom agents you deploy. The orchestrator picks from this
          roster automatically based on your task.
        </p>

        <div className="section-label">CORE ORCHESTRATION AGENTS</div>
        <div className="agent-grid">
          {core.map(([key, cfg]) => (
            <AgentCard key={key} cfg={cfg} />
          ))}
        </div>

        <div className="section-label">SPECIALIST AGENTS</div>
        <div className="agent-grid">
          {specialist.map(([key, cfg]) => (
            <AgentCard key={key} cfg={cfg} />
          ))}
        </div>

        <div className="section-label">CUSTOM AGENTS</div>
        <div className="agent-grid">
          {customAgents.map((a) => (
            <AgentCard key={a.key} cfg={a} custom />
          ))}
          <button className="agent-create-card" onClick={() => setModalOpen(true)}>
            <span className="plus">+</span>
            Create Custom Agent
          </button>
        </div>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create Custom Agent</h3>
            <div className="modal-sub">Define a new specialist for the marketplace</div>
            <div className="form-group">
              <label>NAME</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Legal Research Agent" />
            </div>
            <div className="form-group">
              <label>ROLE / INSTRUCTIONS</label>
              <textarea rows="3" value={role} onChange={(e) => setRole(e.target.value)} placeholder="What should this agent do?" />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={deploy}>
                Deploy Agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
