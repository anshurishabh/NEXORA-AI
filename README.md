# NEXORA AI

**A multi-agent AI orchestration platform.** You type one goal into a single chat console — NEXORA plans it, breaks it into subtasks, delegates each subtask to the right specialist agent, runs those agents in parallel, and then verifies/merges everything into one clean final answer. Alongside the console there's an Agent Marketplace, a Data Analyst workspace, a Document Intelligence tool, a live Analytics dashboard, and a Settings page.

Built as a real two-part full-stack app:

- **`backend/`** — Node.js + Express API. Owns the API key, talks to the LLM provider, runs the orchestration pipeline, and persists everything to a local JSON file store.
- **`frontend/`** — React 18 + Vite single-page app. Talks only to the backend over REST — it never touches the model provider directly, so no key is ever exposed in the browser.

---

## 1. What actually happens when you send a message

This is the core idea of the project — every query goes through a **Plan → Delegate → Verify** pipeline instead of a single model call:

1. **Planning agent** — reads your query (plus memory + chat history context, if any) and decides, as a JSON plan, which of the 6 specialist agents are genuinely needed (between 1 and 4 of them), and writes one focused subtask instruction for each. This step always runs on the cheapest/fastest model tier since it's just classification.
2. **Specialist agents run in parallel** — each agent picked by the planner receives its own subtask and its own system prompt, and runs concurrently via `Promise.all`. Agents that need current information (`research`, `websearch`) first hit a live web search and get the results injected into their prompt.
3. **Verifier / synthesis agent** — takes every successful specialist's output and merges it into one non-redundant, well-structured final answer, matching depth/length to what the question actually needs (short for factual asks, detailed for "explain/analyze/compare" style asks). Code blocks from a coding agent's output are copied through verbatim rather than being retyped.
4. The final answer, plus which agents ran and their individual outputs, is saved to that conversation and returned to the frontend — so the Console can show an expandable "N agents used" trace under every answer.

There's also a **`/stream`** version of this same pipeline that streams the verifier's tokens back to the browser in real time (Server-Sent-style chunked response) instead of waiting for the full answer.

### The 6 specialist agents

| Agent | Role |
|---|---|
| **Research** | Gathers and cross-checks information on the topic (uses live web search) |
| **Coding** | Writes, explains, or debugs code |
| **Data Analyst** | Analyzes data, finds patterns and statistics |
| **Document** | Reads and extracts information from attached documents/files |
| **Web Search** | Pulls in current, up-to-date information (uses live web search) |
| **Content** | Drafts and structures the final written output |

`Planner` and `Verifier` are two additional "core" agents that always run behind the scenes (they don't need to be picked — they orchestrate and merge, respectively).

### Smart, cost-aware model routing

Every call — planning, each agent, and the final synthesis — is independently routed to one of three model tiers based on how complex that specific piece of text looks (word count + keyword signals like "explain," "compare," "architecture," "debug," etc.):

| Tier | Used for |
|---|---|
| **Fast** | Trivial/short queries and the planning step |
| **Medium** | Everyday, moderate-complexity subtasks |
| **Normal** | Long, complex, "explain/analyze/design/compare" style asks |

This means a simple one-line question doesn't burn the same compute as a full research-and-code request — NEXORA decides per sub-request, not once for the whole conversation.

---

## 2. Full feature list

### Console (main chat)
- Single clean chat column. While a task runs, a compact **Planning → Delegating → Verifying** progress strip is shown.
- Every assistant answer has an expandable trace showing exactly which agents ran, their individual subtask + output, and how many tokens each used.
- Supports plain text queries, image attachments (routed to a vision-capable model), and document attachments (PDF/DOCX, parsed server-side and fed into the pipeline).
- **`/imagine <prompt>`** style image generation — calls Pollinations AI (no API key needed) and returns a rendered image inline in the chat, saved as part of the conversation.
- **In-conversation memory** — the assistant can be asked to remember facts/preferences; these are stored server-side and silently injected into every future prompt across all chats, without being read back verbatim unless asked.
- **Chat history** — every conversation is persisted on the backend; a history drawer lets you switch between past chats or start a new one.
- **Response caching** — fully context-free queries (no memory, no history, no attachment) are cached in-memory for 30 minutes, so repeated/common questions skip a full multi-agent run entirely and return instantly.
- **Rate-limit-safe execution** — all model calls go through a concurrency-limited queue (max 3 parallel) with automatic exponential-backoff retry on rate-limit errors, so heavy multi-agent runs don't trip the provider's free-tier limits.

### Agent Marketplace
- Browse every built-in agent (Planner, Verifier, Research, Coding, Data Analyst, Document, Web Search, Content) with its role description and icon.

### Data Analyst
- Feed in labeled numeric data (e.g. from a CSV) and get back real, model-generated insights — trends, anomalies, and 2–3 specific actionable takeaways that cite actual numbers from the dataset.

### Document Intelligence
- Upload a PDF or DOCX file — text is extracted server-side (`pdf-parse` / `mammoth`) and summarized concisely with up to 3 key points.
- Follow-up **Q&A on the uploaded document**, using only the document's actual content (and prior Q&A on that same document for context), with an honest "not enough info" fallback instead of guessing.

### Live code execution
- Run Python, JavaScript/Node.js, C, C++, or Java snippets for real via the free Piston public execution API — no API key required, no local runtime needed.

### Scheduled/recurring queries
- Save a query to run automatically on a daily or hourly schedule; the backend scheduler tracks `lastRun`/`nextRun` and executes due jobs in the background.

### Analytics dashboard
- Live-computed stats derived from real saved chat history: total tasks run, success/fail counts, total tokens used, per-agent usage and token breakdown, and daily activity.
- **One-click data export** — download every saved conversation as a single JSON file.

### Settings
- See which model provider is configured (the key itself never leaves `backend/.env` / never reaches the browser).
- Security/privacy toggles and a "clear all history" action.

---

## 3. Architecture

```
User query (Console)
        │
        ▼
 POST /api/orchestrate
        │
        ▼
 ┌─────────────────┐
 │  Planning agent  │  → decides which specialists to use + writes their subtasks
 └────────┬─────────┘
          │  (parallel fan-out, Promise.all)
   ┌──────┼──────┬──────────┬───────────┬─────────┐
   ▼      ▼      ▼          ▼           ▼         ▼
Research Coding  Data   Document   Web Search   Content
   │      │      │          │           │         │
   └──────┴──────┴────┬─────┴───────────┴─────────┘
                       ▼
              Verifier / Synthesis agent
                       │
                       ▼
              Final merged answer → saved to conversation → returned to frontend
```

### Backend (`backend/`)

| File | Responsibility |
|---|---|
| `server.js` | Express app entry point, route mounting, error handling, starts the scheduler |
| `routes/orchestrate.js` | The core Plan → Delegate → Verify pipeline (`/`, and `/stream` for token streaming) |
| `routes/conversations.js` | List/search/fetch/delete saved chat conversations |
| `routes/documents.js` | PDF/DOCX text extraction, summarization, and document Q&A |
| `routes/dataAnalysis.js` | Dataset → model-generated insights |
| `routes/image.js` | `/imagine` image generation via Pollinations AI |
| `routes/code.js` | Live code execution via the Piston API |
| `routes/memory.js` | CRUD for persistent cross-chat memory notes |
| `routes/schedules.js` | CRUD for scheduled/recurring queries |
| `routes/analytics.js` | Computes usage analytics from stored conversation history |
| `routes/providers.js` | Reports which model provider(s) are configured |
| `providers/` | Abstraction layer over the LLM API — model tiers, vision routing, request building |
| `agentConfig.js` | Central definition of the 6 specialist agents (label + description) |
| `queue.js` | Concurrency-limited job queue + retry-with-backoff for all model calls |
| `cache.js` | In-memory 30-minute response cache for context-free queries |
| `scheduler.js` | Background runner that executes due scheduled queries |
| `db.js` | Minimal file-based JSON store (`data/db.json`) — conversations, memory, schedules |

### Frontend (`frontend/`)

| Path | Responsibility |
|---|---|
| `src/pages/Console.jsx` | Main chat interface, streaming, agent trace UI |
| `src/pages/Agents.jsx` | Agent Marketplace |
| `src/pages/DataAnalyst.jsx` | Dataset input + insights display |
| `src/pages/Documents.jsx` | Document upload, summary, and Q&A |
| `src/pages/Analytics.jsx` | Usage dashboard + JSON export |
| `src/pages/Settings.jsx` | Provider status, security toggles, clear history |
| `src/components/Layout.jsx`, `Sidebar.jsx` | App shell and navigation |
| `src/context/AppContext.jsx` | Global app state (conversations, provider status, etc.) |
| `src/api.js` | Thin fetch client for every backend route |
| `src/constants.js` | Shared agent metadata (icons, labels, descriptions) used across pages |

---

## 4. Tech stack

**Backend:** Node.js, Express, `dotenv`, `cors`, `pdf-parse`, `mammoth`
**Frontend:** React 18, Vite, React Router
**External free APIs used:** Groq (LLM inference), Pollinations AI (image generation), Piston (public code execution sandbox)
**Storage:** Local JSON file store (no external database required to run it)
**Deploy targets:** Backend → Render, Frontend → Vercel

---

## 5. Running it locally

You need [Node.js 18+](https://nodejs.org).

### Backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `backend/.env` and add your Groq key:

```
GROQ_API_KEY=your_key_here
```

Get a free key at **https://console.groq.com/keys**.

```bash
npm start
```

Runs on **http://localhost:5000**.

### Frontend

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open **http://localhost:5173**.

---

## 6. Deployment

### Backend → Render
- **Root Directory:** `backend`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- Add `GROQ_API_KEY` under Environment Variables.

> Render's free tier has an ephemeral filesystem, so the JSON-file conversation store can reset on redeploy/sleep. For production-grade persistence, swap `backend/db.js` for a real database — every other file reads/writes only through `readDB()`/`writeDB()`, so nothing else needs to change.

### Frontend → Vercel
- **Root Directory:** `frontend`
- **Framework Preset:** Vite (auto-detected)
- Add `VITE_API_BASE_URL` pointing at your Render backend URL.

---

## 7. Troubleshooting

- **"BACKEND OFFLINE"** — backend isn't running, or `VITE_API_BASE_URL` doesn't match where it's actually running.
- **Provider shows "NOT SET"** — add `GROQ_API_KEY` to `backend/.env` and restart (`npm start`).
- **Requests failing with rate-limit errors** — the built-in queue already retries automatically with backoff; if it still fails, you've likely exceeded Groq's free-tier daily quota.
