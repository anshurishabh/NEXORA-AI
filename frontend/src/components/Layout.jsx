import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import { useApp } from '../context/AppContext.jsx';

const ROUTE_META = {
  '/': { title: 'Orchestration Console', sub: 'Plan → Delegate → Verify' },
  '/agents': { title: 'Agent Marketplace', sub: 'Manage and deploy specialist agents' },
  '/data': { title: 'Data Analyst Workspace', sub: 'Upload, chart, and extract insights' },
  '/documents': { title: 'Document Intelligence', sub: 'Summarize and query documents' },
  '/analytics': { title: 'Usage Analytics', sub: 'Live session metrics' },
  '/settings': { title: 'Settings', sub: 'Connection, security, workspace' }
};

export default function Layout() {
  const location = useLocation();
  const meta = ROUTE_META[location.pathname] || ROUTE_META['/'];
  const { backendError } = useApp();

  return (
    <div className="shell">
      <Sidebar />
      <div className="content-area">
        <div className="topbar">
          <div>
            <h2>{meta.title}</h2>
            <div className="topbar-sub">{meta.sub}</div>
          </div>
          {backendError ? (
            <span className="live-pill offline" title={backendError}>
              <span className="live-dot offline-dot"></span>BACKEND OFFLINE
            </span>
          ) : (
            <span className="live-pill">
              <span className="live-dot"></span>LIVE
            </span>
          )}
        </div>
        <Outlet />
      </div>
    </div>
  );
}
