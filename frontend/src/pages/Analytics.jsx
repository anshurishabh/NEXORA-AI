import { useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { AGENT_CONFIG } from '../constants.js';
import { api } from '../api.js';

export default function Analytics() {
  const { analytics, refreshAnalytics } = useApp();

  useEffect(() => {
    refreshAnalytics();
  }, [refreshAnalytics]);

  const entries = Object.entries(analytics.agentUsage || {}).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? Math.max(...entries.map((e) => e[1])) : 1;

  return (
    <div className="page active">
      <div className="page-pad">
        <h1 className="page-title">Usage Analytics</h1>
        <p className="page-desc">Live metrics pulled from your saved chat history on the backend.</p>

        <div className="stat-grid">
          <div className="stat-card">
            <div className="big">{analytics.tasksRun || 0}</div>
            <div className="lbl">TASKS RUN</div>
          </div>
          <div className="stat-card">
            <div className="big">{entries.length}</div>
            <div className="lbl">AGENTS ACTIVE</div>
          </div>
          <div className="stat-card">
            <div className="big">{analytics.conversationCount || 0}</div>
            <div className="lbl">SAVED CHATS</div>
          </div>
          <div className="stat-card">
            <div className="big">${((analytics.tasksRun || 0) * 0.004).toFixed(3)}</div>
            <div className="lbl">EST. TOTAL COST</div>
          </div>
        </div>

        <div className="panel">
          <h4>Agent Usage (All Time)</h4>
          {entries.length === 0 ? (
            <div className="empty-note">No agent activity yet — run a task in the Console to see it here.</div>
          ) : (
            entries.map(([key, count]) => (
              <div className="usage-row" key={key}>
                <span className="name">{AGENT_CONFIG[key]?.label || key}</span>
                <div className="usage-bar-track">
                  <div className="usage-bar-fill" style={{ width: Math.round((count / max) * 100) + '%' }}></div>
                </div>
                <span className="count">{count}</span>
              </div>
            ))
          )}
        </div>

        <div className="panel">
          <h4>Recent Activity</h4>
          {(analytics.activity || []).length === 0 ? (
            <div className="empty-note">Nothing logged yet.</div>
          ) : (
            analytics.activity.map((item, i) => (
              <div className="activity-item" key={i}>
                <span className="q">{item.query}</span>
                <span className="meta">
                  {item.agents.map((a) => AGENT_CONFIG[a]?.label || a).join(', ')} ·{' '}
                  <span className="status-ok">Verified</span> ·{' '}
                  {new Date(item.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="panel">
          <h4>Export Your Data</h4>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>
            Download every saved conversation as a single JSON file.
          </p>
          <a className="btn-secondary" href={api.exportUrl()} download="nexora-export.json">
            ⬇ Export All Data
          </a>
        </div>
      </div>
    </div>
  );
}
