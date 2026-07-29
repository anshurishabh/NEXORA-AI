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

  const tokenEntries = Object.entries(analytics.agentTokens || {}).sort((a, b) => b[1] - a[1]);
  const tokenMax = tokenEntries.length ? Math.max(...tokenEntries.map((e) => e[1])) : 1;

  const daily = analytics.dailyActivity || [];
  const dailyMax = daily.length ? Math.max(1, ...daily.map((d) => d.count)) : 1;

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
            <div className="big">{analytics.successRate ?? 100}%</div>
            <div className="lbl">SUCCESS RATE</div>
          </div>
          <div className="stat-card">
            <div className="big">{(analytics.totalTokens || 0).toLocaleString('en-IN')}</div>
            <div className="lbl">TOTAL TOKENS USED</div>
          </div>
          <div className="stat-card">
            <div className="big">{analytics.avgTokensPerTask || 0}</div>
            <div className="lbl">AVG TOKENS / TASK</div>
          </div>
        </div>

        <div className="stat-grid">
          <div className="stat-card">
            <div className="big">{analytics.conversationCount || 0}</div>
            <div className="lbl">SAVED CHATS</div>
          </div>
          <div className="stat-card">
            <div className="big">{analytics.memoryCount || 0}</div>
            <div className="lbl">MEMORY NOTES</div>
          </div>
        </div>

        <div className="panel">
          <h4>Last 7 Days</h4>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90, padding: '8px 4px' }}>
            {daily.map((d) => (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{d.count}</div>
                <div
                  style={{
                    width: '100%',
                    maxWidth: 28,
                    height: Math.max(4, Math.round((d.count / dailyMax) * 60)),
                    background: d.count > 0 ? 'linear-gradient(180deg,#7c6bf0,#4b3bb0)' : '#22222c',
                    borderRadius: 4
                  }}
                />
                <div style={{ fontSize: 10, opacity: 0.55 }}>
                  {new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short' })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h4>Success vs Failed Tasks</h4>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', background: '#22222c' }}>
                <div style={{ width: (analytics.successRate ?? 100) + '%', background: '#5fd68a' }} />
                <div style={{ width: 100 - (analytics.successRate ?? 100) + '%', background: '#e0665f' }} />
              </div>
            </div>
            <span style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
              ✓ {analytics.successCount || 0} &nbsp; ✕ {analytics.failCount || 0}
            </span>
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
          <h4>Token Usage by Agent</h4>
          {tokenEntries.length === 0 ? (
            <div className="empty-note">No token data yet — run a task to see usage here.</div>
          ) : (
            tokenEntries.map(([key, tokens]) => (
              <div className="usage-row" key={key}>
                <span className="name">{AGENT_CONFIG[key]?.label || key}</span>
                <div className="usage-bar-track">
                  <div className="usage-bar-fill" style={{ width: Math.round((tokens / tokenMax) * 100) + '%', background: 'linear-gradient(90deg,#e0a458,#c47f2e)' }}></div>
                </div>
                <span className="count">{tokens.toLocaleString('en-IN')}</span>
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
                  <span className={item.ok ? 'status-ok' : 'status-fail'} style={!item.ok ? { color: '#e0665f' } : undefined}>
                    {item.ok ? 'Verified' : 'Failed'}
                  </span>{' '}
                  {item.tokens ? '· ' + item.tokens + ' tokens ' : ''}
                  · {new Date(item.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
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