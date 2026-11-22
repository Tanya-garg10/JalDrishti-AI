# JalDrishti AI

**See the Risk. Predict the Shortage. Protect Every Drop.**

Built under the **Open Innovation** theme for **PromptWars x Techverse Solutions 2026**.

JalDrishti AI is an AI-powered water intelligence and decision-support platform designed to monitor groundwater depletion, calculate a transparent 0–100 Water Stress Index, run multi-scenario what-if simulations, prioritize conservation strategies, inspect spatial risk on OpenStreetMap, upload/validate custom hydrological CSVs, and export formatted PDF intelligence briefs.

---

## Architecture

- **Frontend**: React 19 + Vite + Tailwind CSS + Recharts + Leaflet (OpenStreetMap) + Lucide icons
- **Runtime Backend (local)**: Express + TypeScript (`server.ts`) + SQLite (`sql.js`) + PDFKit + `@google/genai` (`gemini-4-hydrogen` with deterministic context-grounded fallback)
- **Runtime Backend (Vercel)**: Serverless functions in `/api/*` backed by shared handlers in `server/handlers.ts` + `server/db.ts` (SQLite via `sql.js`, DB persisted to `/tmp` per instance)
- **Python FastAPI Reference Backend**: `/backend/main.py` + `/requirements.txt` (FastAPI + Pandas + NumPy + SQLite + ReportLab)

---

## Setup Instructions

### 1. Unified Full-Stack Runtime (Port 3000)

```bash
npm install
cp .env.example .env   # Optional: set GEMINI_API_KEY for live Gemini responses
npm run dev
```

Build and run production server:

```bash
npm run build
npm run start
```

### 2. Vercel Deployment (Frontend + Serverless API)

The repo is configured for Vercel out of the box (`vercel.json`): `vite build` produces `dist/`, and every `/api/*` route is served by a serverless function under `/api/`.

1. Import the GitHub repo in [Vercel](https://vercel.com/new) (framework preset: Vite, root directory `./`).
2. Add environment variables in **Project → Settings → Environment Variables**:
   - `GEMINI_API_KEY` — required for live Gemini Copilot responses (optional; deterministic fallback works without it)
3. Deploy. Verify with `GET /api/health`.

Notes for the serverless runtime:

- SQLite (`sql.js`) runs fully in-memory; the DB file lives at `/tmp/jaldrishti.db` and persists only while a function instance stays warm. Demo data re-seeds automatically on cold starts.
- Uploaded CSV datasets and weight changes may reset after cold starts — this is an ephemeral-storage limitation of serverless functions.
- `server/sql-wasm.wasm` is bundled via `functions.includeFiles` in `vercel.json`.

### 3. Optional Standalone Python FastAPI Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
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
