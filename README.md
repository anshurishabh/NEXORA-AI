# NEXORA AI

A multi-agent AI orchestration platform — a chat console that plans a task, delegates it to
specialist agents (Research, Coding, Data, Document, Web Search, Content), and verifies the
result, plus an Agent Marketplace, Data Analyst workspace, Document Intelligence, Usage
Analytics, and Settings.

This is a real two-part app:

- **`backend/`** — Node.js + Express API. Holds your API keys in `.env` (never in the browser),
  calls whichever model provider you configure, and stores chat history to a local JSON file.
- **`frontend/`** — React + Vite single-page app. Talks only to your backend, never to the model
  providers directly.

---

## 1. Run it locally in VS Code

You need [Node.js 18+](https://nodejs.org) installed.

### Backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `backend/.env` and paste in **at least one** provider key (you don't need all of them):

```
GEMINI_API_KEY=...
GROQ_API_KEY=...
CEREBRAS_API_KEY=...
OPENROUTER_API_KEY=...
MISTRAL_API_KEY=...
```

Where to get free keys (all 5 are free — no card required):
| Provider | Get a key at |
|---|---|
| Google Gemini | https://aistudio.google.com/apikey |
| Groq | https://console.groq.com/keys |
| Cerebras | https://cloud.cerebras.ai (1M free tokens/day) |
| OpenRouter | https://openrouter.ai/keys |
| Mistral AI | https://console.mistral.ai |

Then start the server:

```bash
npm start
```

It runs on **http://localhost:5000**. Restart it any time you edit `.env`.

### Frontend

Open a **second terminal**:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open **http://localhost:5173** — that's the app.

---

## 2. Push to GitHub

```bash
git init
git add .
git commit -m "NEXORA AI"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

Your `.env` files are already excluded by `.gitignore` — your keys will never be pushed.

---

## 3. Deploy the backend to Render

1. On [render.com](https://render.com), click **New → Web Service**, connect your GitHub repo.
2. Set:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
3. Under **Environment**, add the same variables from `backend/.env.example`
   (`GEMINI_API_KEY`, `GROQ_API_KEY`, etc. — only the ones you're using).
4. Deploy. Copy the URL Render gives you, e.g. `https://nexora-backend.onrender.com`.

> **Note on chat history persistence:** the backend stores conversations in a JSON file on disk.
> Render's free tier has an *ephemeral* filesystem — history can reset on redeploy or after the
> service sleeps. For production-grade persistence, swap `backend/db.js` for a real database
> (e.g. a free Postgres instance on Render or Supabase) — the rest of the app doesn't need to
> change, since everything reads/writes through the two functions in that one file.

---

## 4. Deploy the frontend to Vercel

1. On [vercel.com](https://vercel.com), click **Add New → Project**, import the same GitHub repo.
2. Set:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite (auto-detected)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `dist` (default)
3. Under **Environment Variables**, add:
   ```
   VITE_API_BASE_URL=https://nexora-backend.onrender.com
   ```
   (use your actual Render URL from step 3)
4. Deploy.

Once both are live, go back to Render and set `PUBLIC_APP_URL` to your Vercel URL — it's used as
the OpenRouter referer header.

---

## Features

- **Console** — a clean single chat column; while a task runs you see a compact
  Planning → Delegating → Verifying strip, and each answer has an expandable "N agents used" line
  showing exactly which agent ran on which provider
- **Chat history** — tap the ☰ icon to slide out the history drawer; every conversation is saved
  on the backend; switch between past chats or
  start a new one from the sidebar
- **5 free model providers, switchable per-message** — Google Gemini, Groq, Cerebras, OpenRouter,
  Mistral — each with Fast / Medium / Normal model tiers. No paid plan needed for any of them.
- **Real per-agent multi-provider execution** — this isn't just "pick one AI for everything."
  Each specialist (Research, Coding, Data, Document, Web Search, Content) can be assigned its own
  provider in **Settings → Agent → Provider Routing**. When you send a task, the planner splits it
  into subtasks and every agent runs **in parallel, on its own assigned provider** — e.g. Research
  genuinely runs on Gemini while Coding genuinely runs on Groq, at the same time — then a
  synthesis step merges all of it into one answer. The Console's orchestration panel shows exactly
  which provider powered each agent. If an assigned provider has no key configured, that agent
  automatically falls back to whichever provider you picked in the Console's model bar.
- **Agent Marketplace** — see every built-in agent, deploy your own custom agent
- **Data Analyst** — upload a CSV (parsed for real, client-side) or explore the sample dataset;
  auto-generated chart + insights
- **Document Intelligence** — upload `.txt`/`.md` for a real AI summary + Q&A; other formats show
  how parsing would flow once wired to a backend extractor
- **Live, current answers for research/news questions** — the Research and Web Search agents use
  Gemini's free Google Search grounding, so questions about today's date, current events, or
  recent news get real answers instead of a training-cutoff disclaimer (works when Gemini is
  configured — it's the only one of the 5 providers with this built in for free)
- **Analytics** — live stats derived from your actual saved chat history
- **Data export** — download all saved conversations as one JSON file from the Analytics page
- **Settings** — see which providers are configured (keys stay in `.env`, never in the browser),
  security toggles, clear all history

## Project structure

```
nexora-ai/
├── backend/
│   ├── server.js            # Express app entry point
│   ├── db.js                # simple file-based JSON store
│   ├── providers/           # one dispatcher for all 5 model providers
│   ├── routes/               # orchestrate, conversations, documents, providers, analytics
│   └── data/db.json          # created automatically on first run (gitignored)
└── frontend/
    ├── src/
    │   ├── pages/            # Console, Agents, DataAnalyst, Documents, Analytics, Settings
    │   ├── components/       # Sidebar, Layout
    │   ├── context/          # global providers/analytics state
    │   ├── api.js             # backend API client
    │   └── constants.js       # shared agent config
    └── index.html
```

## Troubleshooting

- **"BACKEND OFFLINE" badge in the top bar** — the backend isn't running, or
  `VITE_API_BASE_URL` in `frontend/.env` doesn't match where it's running.
- **A provider says "NOT SET" in Settings** — add its key to `backend/.env` and restart the
  backend (`npm start`).
- **A configured provider still fails** — double check the key is valid and has remaining free
  quota; the exact error message from the provider is shown in the chat response.
- **Gemini says "invalid authentication credentials" / mentions OAuth 2** — your `GEMINI_API_KEY`
  is invalid, from a disabled project, or has stray quotes/spaces around it in `.env`. Fix: go to
  https://aistudio.google.com/apikey, generate a **fresh** key (this auto-enables the right API),
  paste it into `backend/.env` with no quotes, and restart the server.
