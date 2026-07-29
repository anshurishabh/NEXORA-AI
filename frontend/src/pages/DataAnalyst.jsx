import { useState } from 'react';
import { api } from '../api.js';

const SAMPLE_LABELS = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const SAMPLE_REVENUE = [108000, 82400, 108900, 121300, 96700, 134200, 149800];

function generateQuickInsights(labels, values) {
  const pctChange = (((values[1] - values[0]) / values[0]) * 100).toFixed(1);
  const maxIdx = values.indexOf(Math.max(...values));
  const minIdx = values.indexOf(Math.min(...values));
  const overallChange = (((values[values.length - 1] - values[0]) / values[0]) * 100).toFixed(1);
  return [
    Number(pctChange) < 0
      ? 'Value dropped ' + Math.abs(pctChange) + '% from ' + labels[0] + ' to ' + labels[1] + '.'
      : 'Value grew ' + pctChange + '% from ' + labels[0] + ' to ' + labels[1] + '.',
    labels[maxIdx] + ' recorded the highest value at ' + values[maxIdx].toLocaleString('en-IN') +
      '; ' + labels[minIdx] + ' recorded the lowest at ' + values[minIdx].toLocaleString('en-IN') + '.',
    'Overall change across the period: ' + (Number(overallChange) >= 0 ? '+' : '') + overallChange + '%.'
  ];
}

function detectDelimiter(text, filename) {
  if (/\.tsv$/i.test(filename)) return '\t';
  const firstLine = text.split(/\r?\n/)[0] || '';
  return firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
}

function parseDelimited(text, filename) {
  const delimiter = detectDelimiter(text, filename);
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('File needs a header row and at least one data row.');

  const headers = lines[0].split(delimiter).map((h) => h.trim());
  const rows = lines.slice(1).map((l) => l.split(delimiter).map((c) => c.trim()));

  const numericCols = [];
  for (let c = 1; c < headers.length; c++) {
    if (rows.every((r) => r[c] !== undefined && r[c] !== '' && !isNaN(parseFloat(r[c])))) {
      numericCols.push(c);
    }
  }
  if (numericCols.length === 0) throw new Error('No numeric column found — need at least one column of numbers besides the label column.');

  return {
    labels: rows.map((r) => r[0]),
    columns: numericCols.map((c) => ({
      key: headers[c] || 'Column ' + c,
      values: rows.map((r) => parseFloat(r[c]) || 0)
    }))
  };
}

function parseJSONFile(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('JSON must be an array of objects, e.g. [{"month":"Jan","revenue":1000}, ...]');
  }
  const keys = Object.keys(data[0]);
  const labelKey = keys.find((k) => typeof data[0][k] === 'string') || keys[0];
  const numericKeys = keys.filter(
    (k) => k !== labelKey && data.every((row) => typeof row[k] === 'number' || !isNaN(parseFloat(row[k])))
  );
  if (numericKeys.length === 0) throw new Error('No numeric field found in the JSON objects.');

  return {
    labels: data.map((row) => String(row[labelKey])),
    columns: numericKeys.map((k) => ({
      key: k,
      values: data.map((row) => parseFloat(row[k]) || 0)
    }))
  };
}

export default function DataAnalyst() {
  const [labels, setLabels] = useState(SAMPLE_LABELS);
  const [columns, setColumns] = useState([{ key: 'Revenue', values: SAMPLE_REVENUE }]);
  const [activeCol, setActiveCol] = useState(0);
  const [fileName, setFileName] = useState(null);
  const [fileType, setFileType] = useState('Sample');
  const [insights, setInsights] = useState([]);
  const [aiInsights, setAiInsights] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [parseError, setParseError] = useState('');

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setParseError('');
    setAiInsights('');
    setInsights([]);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        let parsed;
        let type;
        if (/\.json$/i.test(file.name)) {
          parsed = parseJSONFile(reader.result);
          type = 'JSON';
        } else if (/\.tsv$/i.test(file.name)) {
          parsed = parseDelimited(reader.result, file.name);
          type = 'TSV';
        } else {
          parsed = parseDelimited(reader.result, file.name);
          type = 'CSV';
        }
        setLabels(parsed.labels);
        setColumns(parsed.columns);
        setActiveCol(0);
        setFileName(file.name);
        setFileType(type);
      } catch (err) {
        setParseError(err.message || 'Could not parse that file.');
      }
    };
    reader.onerror = () => setParseError('Could not read that file.');
    reader.readAsText(file);
  }

  function runQuickAnalysis() {
    const values = columns[activeCol].values;
    setInsights(generateQuickInsights(labels, values));
  }

  async function runAIAnalysis() {
    setAiLoading(true);
    setAiInsights('');
    try {
      const data = await api.analyzeData({
        title: fileName || 'Sample Dataset',
        valueLabel: columns[activeCol].key,
        labels,
        values: columns[activeCol].values
      });
      setAiInsights(data.insights);
    } catch (err) {
      setAiInsights("Couldn't reach the backend — " + err.message);
    }
    setAiLoading(false);
  }

  const values = columns[activeCol] ? columns[activeCol].values : [];
  const max = Math.max(...values, 1);

  return (
    <div className="page active">
      <div className="page-pad">
        <h1 className="page-title">Data Analyst Workspace</h1>
        <p className="page-desc">
          Upload a .csv, .tsv, or .json file — numeric columns are auto-detected, and the Data Analyst agent (real
          AI, not a template) can generate deeper insights on demand.
        </p>

        <label className={'dropzone' + (fileName ? ' has-file' : '')}>
          {fileName ? '✓ ' + fileName + ' (' + fileType + ') loaded — click to replace' : '📄 Click to upload a .csv, .tsv, or .json file — or explore the sample dataset below'}
          <input type="file" accept=".csv,.tsv,.json" style={{ display: 'none' }} onChange={handleFile} />
        </label>

        {parseError && (
          <div className="panel" style={{ borderColor: '#e0665f' }}>
            <div style={{ color: '#e0665f', fontSize: 13.5 }}>⚠ {parseError}</div>
          </div>
        )}

        {columns.length > 1 && (
          <div className="panel">
            <h4>Column to analyze</h4>
            <select
              value={activeCol}
              onChange={(e) => {
                setActiveCol(Number(e.target.value));
                setInsights([]);
                setAiInsights('');
              }}
              style={{ padding: '6px 10px', borderRadius: 6, background: '#1c1c26', color: '#eee', border: '1px solid #333' }}
            >
              {columns.map((c, i) => (
                <option key={i} value={i}>{c.key}</option>
              ))}
            </select>
          </div>
        )}

        <div className="panel">
          <h4>{fileName ? fileName : 'Sample Dataset — Monthly Sales'}</h4>
          <table className="data-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>{columns[activeCol] ? columns[activeCol].key : 'Value'}</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((l, i) => (
                <tr key={i}>
                  <td>{l}</td>
                  <td>{(values[i] || 0).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h4>{columns[activeCol] ? columns[activeCol].key : 'Value'} Overview</h4>
          <div className="bar-chart">
            {labels.map((l, i) => (
              <div className="bar-col" key={i}>
                <span className="bar-val">{((values[i] || 0) / 1000).toFixed(0)}k</span>
                <div className="bar" style={{ height: Math.round(((values[i] || 0) / max) * 120) + 6 + 'px' }}></div>
                <span className="bar-label">{l}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h4>Quick Insights (instant, formula-based)</h4>
          <ul className="insight-list">
            {insights.map((ins, i) => (
              <li key={i}>{ins}</li>
            ))}
          </ul>
          <div style={{ marginTop: 14 }}>
            <button className="btn-secondary" onClick={runQuickAnalysis}>
              ▶ Run Quick Analysis
            </button>
          </div>
        </div>

        <div className="panel">
          <h4>🤖 AI Insights (real analysis via the Data Analyst agent)</h4>
          {aiInsights && <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>{aiInsights}</p>}
          <button className="btn-primary" onClick={runAIAnalysis} disabled={aiLoading}>
            {aiLoading ? 'Analyzing...' : '🤖 Ask AI for Deeper Analysis'}
          </button>
        </div>
      </div>
    </div>
  );
}