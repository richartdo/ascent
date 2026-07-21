# Ascent

Ascent helps African students, recent graduates, and young founders move from finding a verified opportunity to submitting a stronger application. Users create a profile, discover and save opportunities, compare profile fit, assess readiness, review a CV, and track every application through deadlines and checklist steps.

**OpenAI Build Week track:** Education

## What works

- Supabase email/password authentication and private user profiles
- Verified opportunity discovery with search, filters, deadlines, and official application links
- Saved opportunities with personal notes
- Drag-and-drop application tracking across eight controlled statuses
- Application checklists, dashboard reminders, and in-app notifications
- Private PDF/DOCX CV upload with browser-side text extraction
- Deterministic opportunity matching using a trained scikit-learn pipeline
- Local opportunity summaries, readiness explanations, and CV analysis using Ollama

Ascent does not submit applications on a user's behalf. It links to the official application page and helps the user prepare and track their progress. Cover-letter and essay generation are intentionally deferred rather than returning fake AI content.

## Built with Codex and GPT-5.6

Ascent was developed during OpenAI Build Week through an iterative Codex workflow using GPT-5.6. Codex accelerated repository analysis, API and schema implementation, Supabase migrations and RLS tests, frontend/backend integration, local-model evaluation, failure diagnosis, documentation, and automated verification.

The builder retained the key product and engineering decisions: prioritize the profile-to-application journey, use only verified opportunities, keep user data protected by RLS, separate deterministic matching from generative analysis, run sensitive CV analysis locally, expose transparent readiness components, and disable features whose model quality was insufficient.

GPT-5.6 is used through Codex as the engineering collaborator for this submission. The running application does **not** require an OpenAI API key and does not send CVs to OpenAI. Runtime AI uses the private local services described below.

## Architecture

```text
Browser (Vite :3000)
  |-- Supabase Auth
  `-- Express API :5000 ---- Supabase PostgreSQL + Storage
              |
              `-- FastAPI model service :8000
                         |-- scikit-learn Joblib matcher
                         `-- Ollama :11434 (qwen3:4b-instruct)
```

The browser never receives the model-service key and never calls FastAPI or Ollama directly.

## Requirements

- Node.js 22+
- `pnpm` 10+
- Python 3.13 (3.13.7 was used locally)
- A Supabase project
- Ollama with `qwen3:4b-instruct` for generative features

The repository already contains the small trusted Joblib model and opportunity seed migrations. Never load Joblib files from untrusted sources; the matcher is a synthetic-data baseline, not proven real-world accuracy.

## Setup

Run commands from the repository root. Local `.env` files are ignored and must never be committed.

### 1. Configure Supabase and Express

```powershell
cd backend
pnpm.cmd install --frozen-lockfile
Copy-Item .env.example .env
```

In `backend/.env`, provide your existing `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Keep `CORS_ORIGINS=http://localhost:3000`.

For a new Supabase project, apply the included schema, RLS policies, storage configuration, and seed data:

```powershell
pnpm.cmd dlx supabase login
pnpm.cmd dlx supabase link --project-ref YOUR_PROJECT_REF
pnpm.cmd dlx supabase db push
```

### 2. Configure the model service

```powershell
cd ..\model-service
python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Generate an internal key without printing it, then paste the same value into `MODEL_SERVICE_API_KEY` in both `backend/.env` and `model-service/.env`:

```powershell
$modelKey = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
Set-Clipboard $modelKey
```

For the complete local demo, set these values:

```dotenv
# backend/.env
AI_ENABLED=true
AI_PROVIDER=custom
AI_FEATURES=opportunity_matching,opportunity_summary,readiness,cv_analysis
MODEL_SERVICE_URL=http://127.0.0.1:8000
MODEL_SERVICE_TIMEOUT_MS=3000
GENERATION_SERVICE_TIMEOUT_MS=120000
```

```dotenv
# model-service/.env
GENERATION_ENABLED=true
GENERATION_FEATURES=opportunity_summary,readiness,cv_analysis
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b-instruct
OLLAMA_TIMEOUT_SECONDS=110
```

To run without local generative AI, leave both committed defaults disabled. Opportunity discovery, saving, tracking, checklists, notifications, and profiles still work.

### 3. Install the frontend

```powershell
cd ..\frontend
pnpm.cmd install --frozen-lockfile
```

On first launch, the setup screen asks for:

- Express URL: `http://localhost:5000/api/v1`
- Supabase project URL
- Supabase publishable/anon key

These public client settings are stored locally in the browser. Never enter a Supabase secret or service-role key.

## Run locally

Use four VS Code terminals. PowerShell or Git Bash works for the Node and Python services; the commands below are PowerShell-safe.

### Terminal 1 — Ollama

Start the Ollama Windows application. Confirm that its server and required model are available:

```powershell
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

If Ollama is not installed or the model is absent, install it manually from Ollama before continuing. Do not start a second `ollama serve` process when port `11434` already has a listener.

### Terminal 2 — FastAPI

```powershell
cd model-service
.venv\Scripts\python.exe -m uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000
```

Verify: `http://127.0.0.1:8000/health`

### Terminal 3 — Express

```powershell
cd backend
pnpm.cmd dev
```

Verify: `http://localhost:5000/api/v1/health`

### Terminal 4 — Frontend

```powershell
cd frontend
pnpm.cmd dev
```

Open `http://localhost:3000`, configure the first-run screen, and sign up or log in.

## Recommended demo path

1. Complete the personal profile.
2. Filter and inspect verified opportunities.
3. Save one opportunity and add it to the application tracker.
4. Add checklist steps and move the tracker between valid stages.
5. Run opportunity matching and inspect transparent readiness results.
6. Upload a fictional CV, review the extracted text, and run local CV analysis.
7. Return to the dashboard to show updated counts, pending steps, and deadlines.

Use fictional personal data in demonstrations. Local CPU generation can take over a minute.

## Verify the project

```powershell
cd backend
pnpm.cmd check:syntax
pnpm.cmd test

cd ..\model-service
.venv\Scripts\python.exe -m pytest

cd ..\frontend
pnpm.cmd run build
```

More detail is available in the [backend runbook](backend/README.md), [OpenAPI specification](backend/docs/openapi.json), and [model-service guide](model-service/README.md).

## Privacy and limitations

- Supabase RLS restricts profiles, saved items, applications, notifications, and private documents to their owner.
- No service-role key is used by the application.
- CV text and generated outputs are not persisted or written to logs.
- Matching and readiness are guidance, never guarantees of eligibility or selection.
- Rate limits and model concurrency controls are process-local and need shared storage/capacity controls when horizontally scaled.
- Cover-letter and essay endpoints remain deliberately unavailable.

## License

[MIT](LICENSE)
