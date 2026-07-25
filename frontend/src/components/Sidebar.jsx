import { NavLink } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';

const NAV = [
  { to: '/', icon: '⌁', label: 'Console' },
  { to: '/agents', icon: '◆', label: 'Agents' },
  { to: '/data', icon: '▤', label: 'Data Analyst' },
  { to: '/documents', icon: '▥', label: 'Documents' },
  { to: '/analytics', icon: '▦', label: 'Analytics' },
  { to: '/settings', icon: '⚙', label: 'Settings' }
];

export default function Sidebar() {
  const { analytics } = useApp();

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <svg viewBox="0 0 30 30" fill="none">
          <circle cx="15" cy="6" r="3" fill="#5b7fff" />
          <circle cx="5" cy="23" r="3" fill="#9b7cff" />
          <circle cx="25" cy="23" r="3" fill="#34d399" />
          <path d="M15 9 L5 20 M15 9 L25 20 M5 23 L25 23" stroke="#3a4152" strokeWidth="1.4" />
        </svg>
        <div>
          <h1>NEXORA AI</h1>
          <p>ORCHESTRATION OS</p>
        </div>
      </div>

      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </NavLink>
      ))}

      <div className="sidebar-footer">
        <div className="mini-stat">
          <span>Tasks run</span>
          <b>{analytics.tasksRun || 0}</b>
        </div>
        <div className="mini-stat">
          <span>Saved chats</span>
          <b>{analytics.conversationCount || 0}</b>
        </div>
      </div>
    </nav>
  );
}
