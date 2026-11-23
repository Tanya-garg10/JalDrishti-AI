# JalDrishti AI

**See the Risk. Predict the Shortage. Protect Every Drop.**

Built under the **Open Innovation** theme for **PromptWars x Techverse Solutions 2026**.

JalDrishti AI is an AI-powered water intelligence and decision-support platform designed to monitor groundwater depletion, calculate a transparent 0–100 Water Stress Index, run multi-scenario what-if simulations, prioritize conservation strategies, inspect spatial risk on OpenStreetMap, upload/validate custom hydrological CSVs, and export formatted PDF intelligence briefs.

---

## Features

- **Executive Dashboard** — KPIs, trend series, stress distribution, and automated insights across monitored locations
- **Water Stress Index** — transparent, weighted 0–100 score built from 5 adjustable factors (availability, depletion, rainfall deficit, demand, recharge)
- **Predictive Scenario Engine** — 3-scenario what-if simulation (Optimistic / Baseline / High Stress) with explicit estimate disclosures
- **Conservation Planner** — 6-domain prioritized recommendations per location
- **Interactive Risk Map** — spatial visualization on OpenStreetMap (Leaflet)
- **CSV Data Studio** — upload, validate, and audit custom hydrological datasets with missing-value gap preservation
- **AI Copilot** — context-grounded Q&A powered by Gemini, with a deterministic fallback when no API key is configured
- **PDF Intelligence Reports** — downloadable multi-section water briefs via PDFKit
- **Groundwater Analytics** — monthly/yearly trends, seasonal averages, and cross-station comparison

---

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, Vite, Tailwind CSS 4, Recharts, Leaflet, Lucide Icons, Motion |
| Backend (local) | Express, TypeScript, `sql.js` (SQLite), PDFKit, `@google/genai` |
| Backend (Vercel) | Serverless functions (`/api/*`) → shared handlers in `server/handlers.ts` |
| Reference backend | Python FastAPI + Pandas + NumPy + SQLite + ReportLab (`/backend`) |
| Deployment | Vercel (`vercel.json`: Vite build + serverless functions) |

---

## Project Structure

```
├── api/                  # Vercel serverless functions (one file per endpoint)
│   ├── _lib.ts           # Shared request/response adapter (not routed)
│   ├── dashboard/        # /api/dashboard/overview
│   ├── datasets/         # /api/datasets, /upload, /export, /template
│   ├── reports/          # /api/reports/pdf
│   └── scenarios/        # /api/scenarios/simulate
├── server/               # Shared backend logic
│   ├── handlers.ts       # All API endpoint logic (runtime-agnostic)
│   ├── db.ts             # SQLite schema, seeding, queries (sql.js)
│   ├── analytics.ts      # Stress index, scenarios, conservation engine
│   ├── gemini.ts         # AI Copilot + deterministic fallback
│   ├── pdf.ts            # PDF report generation
│   └── sql-wasm.wasm     # sql.js WASM binary (bundled for Vercel)
├── server.ts             # Express server for local dev/prod (port 3000)
├── src/                  # React frontend (views, components, types)
├── backend/              # Optional standalone Python FastAPI reference
├── data/                 # SQLite DB (local) + demo CSV
├── vercel.json           # Vercel build + function config
└── .env.example          # Environment variable template
```

---

## Setup Instructions

### 1. Local Full-Stack Runtime (Port 3000)

```bash
npm install
cp .env.example .env   # Optional: set GEMINI_API_KEY for live Gemini responses
npm run dev
```

Build and run the production server locally:

```bash
npm run build
npm run start
```

| Script | Description |
| --- | --- |
| `npm run dev` | Express + Vite dev server on `http://localhost:3000` |
| `npm run build` | Production frontend build → `dist/` |
| `npm start` | Serve `dist/` + API on `PORT` (default 3000) |
| `npm run lint` | TypeScript typecheck (`tsc --noEmit`) |

### 2. Vercel Deployment (Frontend + Serverless API)

The repo deploys to Vercel out of the box (`vercel.json`): `vite build` produces `dist/`, and every `/api/*` route is served by a serverless function under `/api/`.

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new) (framework preset: **Vite**, root directory `./`).
2. Add environment variables in **Project → Settings → Environment Variables**:

   | Variable | Required | Description |
   | --- | --- | --- |
   | `GEMINI_API_KEY` | Optional | Live Gemini Copilot responses (deterministic fallback works without it) |
   | `JALDRISHTI_DB_PATH` | Optional | SQLite file path (defaults to `/tmp/jaldrishti.db` on Vercel) |

3. Deploy, then verify with `GET /api/health`.

**Serverless runtime notes:**

- SQLite (`sql.js`) runs fully in-memory; the DB file lives at `/tmp/jaldrishti.db` and persists only while a function instance stays warm. Demo data re-seeds automatically on cold starts.
- Uploaded CSV datasets and stress-weight changes may reset after cold starts — an ephemeral-storage limitation of serverless functions.
- `server/sql-wasm.wasm` is bundled via `functions.includeFiles` in `vercel.json`.

### 3. Optional Standalone Python FastAPI Backend

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## REST API Documentation

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service status & Gemini key availability check |
| `GET` | `/api/dashboard/overview?locationId=&range=` | Executive KPIs, trend series, stress distribution, insights |
| `GET` | `/api/locations` | Monitored locations with stress summary & data provenance |
| `GET` | `/api/stress?locationId=&range=` | Transparent Water Stress Index breakdown & confidence |
| `PUT` | `/api/stress/weights` | Update and normalize 5-factor Water Stress weights |
| `GET` | `/api/analytics?locationId=` | Monthly/yearly trends, seasonal averages, cross-station comparison |
| `POST` | `/api/scenarios/simulate` | Run 3-scenario (Optimistic / Baseline / High Stress) simulation |
| `GET` | `/api/conservation?locationId=` | 6-domain prioritized conservation recommendations |
| `POST` | `/api/copilot` | Context-grounded Gemini AI Copilot (with deterministic fallback) |
| `GET` | `/api/datasets` | List imported user CSV dataset audits |
| `POST` | `/api/datasets/upload` | Parse, validate, detect missing values, and ingest CSV data |
| `GET` | `/api/datasets/export?locationId=` | Export station readings as CSV |
| `GET` | `/api/datasets/template` | Download sample CSV upload template |
| `GET` | `/api/reports/pdf?locationId=&horizon=` | Download multi-section PDF Water Intelligence Report |

---

## Data Integrity & Transparency

- Built-in stations are explicitly marked **Simulated Demo Data** (modeled on regional Indian aquifer characteristics, not official live CGWB telemetry).
- User-uploaded CSV datasets are stored in SQLite and tagged **User-Uploaded Data**.
- Missing readings are preserved as explicit gaps, excluded from linear depletion regression, and surfaced via the **Data Confidence & Completeness** indicator.
- Predictive trajectories carry explicit **Scenario Estimate** disclosures clarifying linear assumptions and limitations.
