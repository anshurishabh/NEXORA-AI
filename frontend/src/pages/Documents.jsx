import { useState } from 'react';
import { api } from '../api.js';

function TypingDots() {
  return (
    <span className="typing-dots">
      <span></span>
      <span></span>
      <span></span>
    </span>
  );
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result looks like "data:application/pdf;base64,JVBERi0x..."
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Documents() {
  const [fileName, setFileName] = useState(null);
  const [docText, setDocText] = useState(null);
  const [summary, setSummary] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loadingAnswer, setLoadingAnswer] = useState(false);

  async function runSummary(text, name) {
    setLoadingSummary(true);
    try {
      const data = await api.summarizeDocument({ text, filename: name });
      setSummary(data.summary);
    } catch (err) {
      setSummary('Summary unavailable — ' + err.message);
    }
    setLoadingSummary(false);
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setSummary('');
    setAnswer('');
    setQuestion('');
    setDocText(null);

    const isPlainText = /\.(txt|md)$/i.test(file.name);
    const isPdfOrDocx = /\.(pdf|docx)$/i.test(file.name);

    if (isPlainText) {
      const reader = new FileReader();
      reader.onload = () => {
        setDocText(reader.result);
        runSummary(reader.result, file.name);
      };
      reader.readAsText(file);
      return;
    }

    if (isPdfOrDocx) {
      setLoadingSummary(true);
      try {
        const fileBase64 = await readFileAsBase64(file);
        const extracted = await api.extractDocument({ filename: file.name, fileBase64 });
        if (extracted.warning) {
          setSummary(extracted.warning);
          setLoadingSummary(false);
          return;
        }
        setDocText(extracted.text);
        await runSummary(extracted.text, file.name);
      } catch (err) {
        setSummary("Couldn't read that file — " + err.message);
        setLoadingSummary(false);
      }
      return;
    }

    setSummary('Unsupported file type. Please upload a .txt, .md, .pdf, or .docx file.');
  }

  async function handleAsk() {
    if (!question.trim()) return;
    setLoadingAnswer(true);
    setAnswer('');
    const q = question;
    setQuestion('');
    try {
      const data = await api.askDocument({ text: docText, filename: fileName, question: q });
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
          Upload a .txt, .md, .pdf, or .docx file — the agent extracts the real text and summarizes it live.
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