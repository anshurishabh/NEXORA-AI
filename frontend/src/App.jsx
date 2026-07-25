import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Console from './pages/Console.jsx';
import Agents from './pages/Agents.jsx';
import DataAnalyst from './pages/DataAnalyst.jsx';
import Documents from './pages/Documents.jsx';
import Analytics from './pages/Analytics.jsx';
import Settings from './pages/Settings.jsx';
import { AppProvider } from './context/AppContext.jsx';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Console />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/data" element={<DataAnalyst />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
