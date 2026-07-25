import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../context/AppContext.jsx';

function TypingDots() {
  return (
    <span className="typing-dots">
      <span></span>
      <span></span>
      <span></span>
    </span>
  );
}

export default function Documents() {
  const { providers } = useApp();
  const [fileName, setFileName] = useState(null);
  const [docText, setDocText] = useState(null);
  const [summary, setSummary] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loadingAnswer, setLoadingAnswer] = useState(false);

  const activeProvider = providers.find((p) => p.configured)?.id || 'gemini';

  async function runSummary(text, name) {
    setLoadingSummary(true);
    try {
      const data = await api.summarizeDocument({ text, filename: name, provider: activeProvider, level: 'normal' });
      setSummary(data.summary);
    } catch (err) {
      setSummary('Summary unavailable — ' + err.message);
    }
    setLoadingSummary(false);
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setSummary('');
    setAnswer('');
    setQuestion('');

    const isText = /\.(txt|md)$/i.test(file.name);
    if (isText) {
      const reader = new FileReader();
      reader.onload = () => {
        setDocText(reader.result);
        runSummary(reader.result, file.name);
      };
      reader.readAsText(file);
    } else {
      setDocText(null);
      setSummary(
        "This file type requires full-document parsing (OCR / PDF or DOCX extraction), which isn't run in-browser here. Once connected to a parsing backend, the Document Intelligence agent would extract the title, key entities, and a structured summary here automatically."
      );
    }
  }

  async function handleAsk() {
    if (!question.trim()) return;
    setLoadingAnswer(true);
    setAnswer('');
    const q = question;
    setQuestion('');
    try {
      const data = await api.askDocument({ text: docText, filename: fileName, question: q, provider: activeProvider, level: 'normal' });
      setAnswer(data.answer);
    } catch (err) {
      setAnswer("Couldn't reach the backend — " + err.message);
    }
    setLoadingAnswer(false);
  }

  return (
    <div className="page active">
      <div className="page-pad">
        <h1 className="page-title">Document Intelligence</h1>
        <p className="page-desc">
          Upload a document. Plain text / Markdown files are read and summarized live by the agent; other formats
          show how parsing would flow once connected to a backend extractor.
        </p>

        <label className={'dropzone' + (fileName ? ' has-file' : '')}>
          {fileName ? `✓ ${fileName} received — click to replace` : '📄 Click to upload a .txt, .md, .pdf, or .docx file'}
          <input type="file" accept=".txt,.md,.pdf,.docx" style={{ display: 'none' }} onChange={handleFile} />
        </label>

        {fileName && (
          <div className="panel">
            <h4>Summary</h4>
            <div>{loadingSummary ? <TypingDots /> : summary}</div>
          </div>
        )}

        {fileName && (
          <div className="panel">
            <h4>Ask about this document</h4>
            <div className="qa-row">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAsk();
                }}
                placeholder="e.g. What are the key points?"
              />
              <button className="btn-primary" onClick={handleAsk} disabled={loadingAnswer}>
                ASK
              </button>
            </div>
            {(loadingAnswer || answer) && <div className="qa-answer">{loadingAnswer ? <TypingDots /> : answer}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
