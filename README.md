# Ascent

**Ascent** is an AI-powered opportunity discovery, evaluation, and application management platform designed specifically for African students, graduates, and young founders. It brings verified scholarships, fellowships, grants, internships, competitions, and training programmes together with automated application tracking, dynamic checklists, notification sync, and contextual AI reasoning into one secure, unified workflow.

Ascent was engineered using **OpenAI Codex** as an agentic AI coding partner to scaffold its full-stack microservice architecture, type-safe API contracts, and responsive Vite frontend, while its core intelligent matching, profile readiness scoring, and CV analysis engines are architected for **GPT-5.6**.

---

## Key Capabilities

### 1. Frontend Workspace (Vite Single-Page Application)
The `frontend/` directory contains a modern Vite single-page application (SPA) built with vanilla JavaScript (ES modules), Supabase Auth, and a responsive CSS design system featuring dark mode, glassmorphism, and dynamic visual indicators:
- **Authentication Suite**: Complete Supabase Authentication (login, registration, password reset modal, session persistence, and instant token sync).
- **Interactive Dashboard**: Metric cards showing active applications, upcoming deadlines, saved items, application progress bar, and instant action shortcuts.
- **Opportunity Discovery Hub**: Full opportunity catalog with search, filtering by type (*scholarship, grant, fellowship, internship, competition, training*) and target region, sorting options, and direct modal inspection.
- **Opportunity Detail & AI Suite**: In-depth modal viewing eligibility, host organization, key dates, direct apply link, bookmarking toggle, plus interactive AI triggers for **Opportunity Summaries**, **Readiness Assessment**, and **CV Analysis**.
- **Application Tracker (Kanban & List)**: End-to-end application lifecycle management across 8 statuses (`planning`, `preparing`, `submitted`, `under_review`, `shortlisted`, `accepted`, `rejected`, `withdrawn`), custom interactive checklists with automatic completion timestamping, progress tracking, and notes editor.
- **Saved Opportunities Manager**: Bookmarked opportunity list with quick conversion into active application trackers and notes management.
- **Profile & Persona Management**: User profile editor supporting persona selection (*student*, *graduate*, *founder*), education level, skills, interests, target regions, preferred opportunity types, and CV text storage.
- **Notification Hub**: Real-time notification synchronization with unread count badges, mark read, dismiss, and mark-all-read capabilities.
- **Dynamic Backend Settings**: Settings modal allowing runtime API Base URL override (`http://localhost:5000/api/v1`) and connectivity health checks.

### 2. Express Backend & Supabase Storage
- **Node.js 22 & Express 5 API**: RESTful architecture delivering request validation, centralized error handling, and structured response envelopes.
- **Supabase Authentication & Row-Level Security (RLS)**: Row Level Security policies enforce strict single-user record ownership across profiles, saved opportunities, applications, and notifications.
- **Security & Validation**: Strict Zod payload schema validation, Helmet security headers, CORS origin protection, request tracing with `X-Request-Id`, and rate limiting.

### 3. Dual AI Processing Architecture
- **Production Cloud Intelligence**: Built for **GPT-5.6** to perform high-dimensional candidate-opportunity reasoning, contextual eligibility verification, and resume synthesis.
- **Local Offline Inference**: Powered by Ollama (`qwen3:4b-instruct`) and a FastAPI (`scikit-learn` vector matcher) service, enabling zero-cost, private offline evaluation during development.

---

## Reality Check & Pre-Implementation Notes

> [!IMPORTANT]
> **System Design Constraints & Implementation Considerations**:
>
> 1. **Deferred AI Capabilities (`503 AI_NOT_CONFIGURED`)**
>    - *Current Reality*: Express endpoints for Cover Letter generation (`POST /api/v1/ai/opportunities/:id/cover-letter`) and Essay assistance (`POST /api/v1/ai/essay-assistance`) explicitly return HTTP `503 AI_NOT_CONFIGURED` by design. The frontend includes UI entry points that gracefully display an informational notice when clicked. Live text generation for these two endpoints remains deferred until cloud OpenAI adapters are enabled.
> 2. **Supabase Auth Redirect URL Whitelisting**
>    - *Current Reality*: For email confirmation links and password reset flows to operate properly with the Vite dev server, `http://localhost:5173` must be added to **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**.
> 3. **CORS Synchronization**
>    - *Current Reality*: The Express backend enforces exact CORS origins via `CORS_ORIGINS` in `backend/.env`. Ensure `http://localhost:5173` is present (e.g., `CORS_ORIGINS=http://localhost:5173,http://localhost:3000`), otherwise browser requests from Vite will be blocked with `403 CORS Forbidden`.
> 4. **CPU Inference Timeouts**
>    - *Current Reality*: When running local AI inference using Ollama on CPU-only machines, model response generation may take 30–60+ seconds. Ensure `GENERATION_SERVICE_TIMEOUT_MS` in `backend/.env` is set to `75000` (75 seconds) to prevent gateway timeouts.
> 5. **Stateless Rate Limiting**
>    - *Current Reality*: Express rate limiting uses an in-memory store per server instance. Scaling across multi-instance serverless deployments (e.g., Vercel Functions) requires backing rate limiters with a distributed cache like Redis or Upstash.

---

## Architecture & Data Flow

```text
┌─────────────────────────────────────────────────────────────┐
│                 Client Browser (Vite SPA)                   │
│                    http://localhost:5173                    │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
     Supabase Auth Session            Express REST API
               │                    http://localhost:5000
               ▼                              │
┌─────────────────────────────┐               │
│   Supabase PostgreSQL DB    │◄──────────────┤
│  (Auth, Profiles, RLS Data) │               │
└─────────────────────────────┘               ├───► Private Model Service (FastAPI :8000)
                                              │            │
                                              │            ▼
                                              │     Ollama (Qwen3 :11434)
                                              │
                                              └───► Cloud OpenAI Engine (GPT-5.6)
```

*Security Requirement*: The frontend client communicates exclusively with Supabase Auth and the Express API (`:5000`). Never expose FastAPI model endpoints (`:8000`), Ollama ports (`:11434`), or internal service keys in client configurations.

---

## Repository Structure

```text
ascent/
├── backend/                  Express 5 API, tests, Supabase migrations, and backend guides
│   ├── docs/                 OpenAPI specification, Postman collections, and guides
│   ├── src/                  API controllers, middleware, routes, schemas, and services
│   ├── supabase/migrations/  PostgreSQL schema, functions, seed data, and RLS policies
│   └── tests/                Vitest unit, route, security, and contract test suites
├── frontend/                 Vite single-page application
│   ├── public/               Static web assets and brand logos
│   ├── src/
│   │   ├── api.js            Modular Express API client wrapper
│   │   ├── main.js           SPA state router, UI event orchestration, and modals
│   │   ├── style.css         Design system, CSS tokens, dark mode, glassmorphism
│   │   └── supabaseClient.js Supabase Auth client initialization
│   ├── index.html            Application entry frame & semantic layout
│   ├── package.json          Vite & Supabase dependencies
│   └── vite.config.js        Vite build and server settings
├── model-service/            FastAPI & scikit-learn private opportunity matcher
│   ├── app/                  FastAPI routes, candidate matchers, Ollama client
│   └── README.md             Model service setup & environment configuration
├── docs/                     Product requirement documents and domain research
├── LICENSE
└── README.md                 Root project documentation
```

---

## Quick Start & Local Development

### Prerequisites
- **Git**
- **Node.js** v22+
- **pnpm** v10+
- **Python** 3.13+ *(for local model service)*
- **Ollama** with `qwen3:4b-instruct` *(optional for local AI)*
- **Supabase Account & Project**

Verify local runtime tools:
```bash
git --version
node --version
pnpm.cmd --version
```

---

### Step 1: Backend Setup (Express & Supabase)

1. Navigate to the backend directory and install dependencies:
   ```bash
   cd backend
   pnpm.cmd install --frozen-lockfile
   ```

2. Create `.env` from `.env.example`:
   ```powershell
   Copy-Item .env.example .env
   ```

3. Configure your backend `.env` variables:
   ```env
   PORT=5000
   NODE_ENV=development
   CORS_ORIGINS=http://localhost:5173,http://localhost:3000
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
   AI_ENABLED=false
   AI_PROVIDER=disabled
   AI_FEATURES=opportunity_matching,opportunity_summary,readiness,cv_analysis
   MODEL_SERVICE_URL=http://127.0.0.1:8000
   MODEL_SERVICE_TIMEOUT_MS=3000
   GENERATION_SERVICE_TIMEOUT_MS=75000
   OPENAI_MODEL=gpt-5.6
   ```

4. Link Supabase and run database migrations:
   ```bash
   pnpm.cmd dlx supabase login
   pnpm.cmd dlx supabase link --project-ref YOUR_PROJECT_ID
   pnpm.cmd dlx supabase db push
   ```

5. Start the backend development server:
   ```bash
   pnpm.cmd dev
   ```
   The backend API will be live at `http://localhost:5000/api/v1`. Verify health at `http://localhost:5000/api/v1/health`.

---

### Step 2: Frontend Setup (Vite SPA)

1. Open a new terminal and navigate to `frontend`:
   ```bash
   cd frontend
   pnpm.cmd install
   ```

2. Verify or create `frontend/.env`:
   ```env
   VITE_SUPABASE_URL="https://your-project.supabase.co"
   VITE_SUPABASE_ANON_KEY="your-supabase-publishable-key"
   VITE_API_URL="http://localhost:5000/api/v1"
   ```

3. Start the Vite dev server:
   ```bash
   pnpm.cmd dev
   ```
   The frontend application will open at `http://localhost:5173`.

---

### Step 3: (Optional) Local AI Model Service Setup

To enable local offline AI matching, summaries, readiness scores, and CV analysis:

1. Ensure Ollama is running and pull the Qwen model:
   ```bash
   ollama pull qwen3:4b-instruct
   ```

2. From `model-service/`, create a Python virtual environment and start FastAPI:
   ```bash
   cd model-service
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

3. Update `backend/.env` to enable private AI:
   ```env
   AI_ENABLED=true
   AI_PROVIDER=custom
   ```

---

## Verification & Automated Testing

Run syntax checks and automated test suites in `backend/`:

```bash
cd backend
pnpm.cmd check:syntax
pnpm.cmd test
```

- `check:syntax`: Validates ES syntax across source files and verification scripts.
- `test`: Executes offline Vitest suite testing API controllers, RLS boundary logic, security validation, and schema contracts.

---

## API Endpoints Reference

All endpoint routes are prefixed with `/api/v1`:

| Method | Endpoint | Auth | Description |
|---|---|:---:|---|
| **GET** | `/health` | No | System health and service status |
| **GET** | `/auth/me` | Yes | Get authenticated user context |
| **GET / PATCH** | `/profile` | Yes | Read or update candidate profile |
| **GET** | `/opportunities` | Yes | List & filter verified opportunities |
| **GET** | `/opportunities/{id}` | Yes | View opportunity details |
| **GET** | `/saved-opportunities` | Yes | List bookmarked opportunities |
| **POST / PATCH / DELETE** | `/saved-opportunities/{id}` | Yes | Save, update notes, or unsave opportunity |
| **GET / POST** | `/applications` | Yes | List or create application trackers |
| **GET / PATCH / DELETE** | `/applications/{id}` | Yes | Read, update status/notes, or delete tracker |
| **PATCH** | `/applications/{id}/checklist` | Yes | Update application task checklist |
| **GET** | `/notifications` | Yes | Sync and list notifications |
| **GET** | `/notifications/unread-count` | Yes | Unread notification count |
| **PATCH** | `/notifications/{id}/read` | Yes | Mark single notification read |
| **PATCH** | `/notifications/{id}/dismiss` | Yes | Dismiss notification |
| **POST** | `/notifications/read-all` | Yes | Mark all active notifications read |
| **POST** | `/ai/opportunity-matches` | Yes | AI candidate-opportunity matching |
| **POST** | `/ai/opportunities/{id}/summary` | Yes | AI opportunity summary |
| **POST** | `/ai/opportunities/{id}/readiness` | Yes | AI profile readiness score & advice |
| **POST** | `/ai/cv-analysis` | Yes | General or opportunity-specific CV analysis |
| **POST** | `/ai/opportunities/{id}/cover-letter` | Yes | *Deferred capability (`503 AI_NOT_CONFIGURED`)* |
| **POST** | `/ai/essay-assistance` | Yes | *Deferred capability (`503 AI_NOT_CONFIGURED`)* |

---

## License & Project References

- **License**: MIT
- **Product Requirements**: [Ascent PRD Document](docs/Ascent_PRD_v1.pdf)
- **Market Research**: [Opportunity Agent Africa Analysis](docs/Opportunity%20Agent%20Africa.pdf)
- **Backend Runbook**: [Express Backend Documentation](backend/README.md)
- **Model Service Guide**: [FastAPI Model Service Guide](model-service/README.md)
