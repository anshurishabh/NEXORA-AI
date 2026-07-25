import { useState } from 'react';

const SAMPLE_LABELS = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const SAMPLE_REVENUE = [108000, 82400, 108900, 121300, 96700, 134200, 149800];

function generateInsights(labels, values) {
  const pctChange = (((values[1] - values[0]) / values[0]) * 100).toFixed(1);
  const maxIdx = values.indexOf(Math.max(...values));
  const minIdx = values.indexOf(Math.min(...values));
  const overallChange = (((values[values.length - 1] - values[0]) / values[0]) * 100).toFixed(1);
  return [
    Number(pctChange) < 0
      ? `Revenue dropped ${Math.abs(pctChange)}% from ${labels[0]} to ${labels[1]} — worth checking for a seasonal dip.`
      : `Revenue grew ${pctChange}% from ${labels[0]} to ${labels[1]}.`,
    `${labels[maxIdx]} recorded the highest value at ₹${values[maxIdx].toLocaleString('en-IN')}; ${labels[minIdx]} recorded the lowest at ₹${values[minIdx].toLocaleString('en-IN')}.`,
    `Overall change across the period: ${Number(overallChange) >= 0 ? '+' : ''}${overallChange}%.`
  ];
}

export default function DataAnalyst() {
  const [dataset, setDataset] = useState({
    labels: SAMPLE_LABELS,
    values: SAMPLE_REVENUE,
    valueLabel: 'Revenue',
    title: 'Sample Dataset — Monthly Sales'
  });
  const [fileName, setFileName] = useState(null);
  const [insights, setInsights] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const lines = reader.result.trim().split(/\r?\n/);
        const headers = lines[0].split(',').map((h) => h.trim());
        const rows = lines.slice(1).map((l) => l.split(',').map((c) => c.trim()));

        let valueCol = -1;
        for (let c = 1; c < headers.length; c++) {
          if (rows.every((r) => !isNaN(parseFloat(r[c])))) {
            valueCol = c;
            break;
          }
        }
        if (valueCol === -1) valueCol = headers.length > 1 ? 1 : 0;

        setDataset({
          labels: rows.map((r) => r[0]),
          values: rows.map((r) => parseFloat(r[valueCol]) || 0),
          valueLabel: headers[valueCol] || 'Value',
          title: 'Uploaded Dataset — ' + file.name
        });
        setFileName(file.name);
        setInsights([]);
      } catch (err) {
        alert('Could not parse that file as CSV.');
      }
    };
    reader.readAsText(file);
  }

  async function runAnalysis() {
    setAnalyzing(true);
    await new Promise((r) => setTimeout(r, 600));
    setInsights(generateInsights(dataset.labels, dataset.values));
    setAnalyzing(false);
  }

  const max = Math.max(...dataset.values, 1);

  return (
    <div className="page active">
      <div className="page-pad">
        <h1 className="page-title">Data Analyst Workspace</h1>
        <p className="page-desc">
          Upload a CSV or use the sample dataset. The Data Analyst agent cleans, charts, and surfaces insights
          automatically.
        </p>

        <label className={'dropzone' + (fileName ? ' has-file' : '')}>
          {fileName ? `✓ ${fileName} loaded — click to replace` : '📄 Click to upload a .csv file — or keep exploring the sample sales dataset below'}
          <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
        </label>

        <div className="panel">
          <h4>{dataset.title}</h4>
          <table className="data-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>{dataset.valueLabel}</th>
              </tr>
            </thead>
            <tbody>
              {dataset.labels.map((l, i) => (
                <tr key={i}>
                  <td>{l}</td>
                  <td>{dataset.values[i].toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h4>{dataset.valueLabel} Overview</h4>
          <div className="bar-chart">
            {dataset.labels.map((l, i) => (
              <div className="bar-col" key={i}>
                <span className="bar-val">{(dataset.values[i] / 1000).toFixed(0)}k</span>
                <div className="bar" style={{ height: Math.round((dataset.values[i] / max) * 120) + 6 + 'px' }}></div>
                <span className="bar-label">{l}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h4>Insights</h4>
          <ul className="insight-list">
            {insights.map((ins, i) => (
              <li key={i}>{ins}</li>
            ))}
          </ul>
          <div style={{ marginTop: 14 }}>
            <button className="btn-secondary" onClick={runAnalysis} disabled={analyzing}>
              {analyzing ? 'DATA AGENT · RUNNING...' : '▶ Run Analysis'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
