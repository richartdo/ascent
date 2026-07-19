# Ascent

Ascent is an opportunity discovery and application assistant helping African students, graduates, and young founders find, evaluate, save, track, and apply for relevant opportunities.

Many promising applicants discover scholarships, internships, grants, fellowships, competitions, and training programmes too late or struggle to organize the application process. Ascent brings verified opportunities, personal profiles, saved items, application tracking, checklists, and deadline reminders into one secure workflow.

## Current capabilities

The backend provides Supabase authentication, profiles, active opportunity discovery, saved opportunities, application tracking, checklists, lazy notifications, and four optional private-model capabilities: opportunity matching, opportunity summaries, readiness assessment, and general or opportunity-specific CV analysis. Cover-letter generation and essay assistance remain deferred. No OpenAI calls or fabricated fallback results are used.

## Repository structure

```text
ascent/
├── backend/        Express API, tests, Supabase migrations and backend documentation
├── model-service/  Private FastAPI/scikit-learn opportunity matcher
├── frontend/       Frontend workspace placeholder; implementation is incomplete
├── docs/           Project requirements and research documents
├── LICENSE
└── README.md
```

Frontend setup is not yet documented because frontend implementation and commands are incomplete. See the [backend runbook](backend/README.md) for complete installation, configuration, API testing, and verification instructions.

Project documents:

- [Ascent product requirements](docs/Ascent_PRD_v1.pdf)
- [Opportunity Agent Africa research](docs/Opportunity%20Agent%20Africa.pdf)

## Branch model and status

- `main`: production-ready releases
- `uat`: integration and user-acceptance testing
- `feature/*`: isolated development through pull requests

The backend is implementation-ready for local and UAT verification. Deployment preparation is documented, but no Vercel deployment is performed as part of this phase. Live OpenAI integration remains deferred.

## Backend technology stack

- Node.js 22 and Express 5
- JavaScript ES modules
- pnpm 10.31.0
- Supabase PostgreSQL and Authentication
- Zod validation
- Helmet, CORS, Morgan, and express-rate-limit
- Vitest and Supertest
- Provider-neutral AI architecture with private Joblib matching and local Qwen generation; no OpenAI calls
- Vercel as the future deployment target

## Prerequisites

Install Git, Node.js 22, and pnpm 10. Create a Supabase account and project. The Supabase CLI can be run through pnpm without a global installation. Postman is the recommended API client; Thunder Client, curl, and PowerShell are also supported.

Verify the tools:

```bash
git --version
node --version
pnpm --version
```

If PowerShell blocks `pnpm.ps1`, use `pnpm.cmd`, such as `pnpm.cmd test`, without changing the machine execution policy.

## Clone and install

```bash
git clone https://github.com/richartdo/ascent.git
cd ascent
git checkout uat
cd backend
pnpm install --frozen-lockfile
```

The frozen lockfile ensures installed dependency versions match `pnpm-lock.yaml`. When intentionally updating dependencies, use:

```bash
pnpm install
```

## Backend environment setup

From the `backend` directory, create `.env`.

Git Bash, macOS, or Linux:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Use this template without real credentials:

```env
PORT=5000
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
AI_ENABLED=false
AI_PROVIDER=disabled
AI_FEATURES=opportunity_matching
MODEL_SERVICE_URL=http://127.0.0.1:8000
MODEL_SERVICE_API_KEY=
MODEL_SERVICE_TIMEOUT_MS=3000
GENERATION_SERVICE_TIMEOUT_MS=75000
MODEL_SERVICE_MAX_CANDIDATES=20
MODEL_SERVICE_CONCURRENCY=4
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6
AI_TEXT_MAX_LENGTH=30000
JSON_BODY_LIMIT=100kb
```

| Variable | Purpose |
|---|---|
| `PORT` | Local HTTP listener port. |
| `NODE_ENV` | `development`, `test`, or `production`. Production requires Supabase configuration. |
| `CORS_ORIGINS` | Comma-separated exact HTTP(S) frontend origins, without paths or wildcards. |
| `SUPABASE_URL` | Project URL from Supabase Dashboard → Project Settings/API. |
| `SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable/anon project key. |
| `AI_ENABLED` | Safe default `false`; local private-model capabilities require an untracked `true` override. |
| `AI_PROVIDER` | Safe default `disabled`; set `custom` only when the private model service is running. |
| `AI_FEATURES` | Express allowlist. Only matching, summaries, readiness, and CV analysis are accepted. |
| `MODEL_SERVICE_*` | Backend-only model origin, blank local key, timeout, candidate cap, and concurrency settings. Never expose them to frontend code. |
| `GENERATION_SERVICE_TIMEOUT_MS` | Generation timeout from 10,000–120,000 ms; keep it slightly above the model-service timeout. |
| `OPENAI_API_KEY` | Optional and intentionally empty while AI is disabled. |
| `OPENAI_MODEL` | Model reserved for the future live adapter. |
| `AI_TEXT_MAX_LENGTH` | Maximum accepted AI text-input length. |
| `JSON_BODY_LIMIT` | Maximum Express JSON request size. |

The Supabase publishable key identifies the project; it is not a user access token. User JWTs and Row Level Security enforce ownership. This backend does not need a service-role key. Never commit `.env`, tokens, passwords, or credentials.

## Supabase setup and migrations

Create a Supabase project and copy its Project ID/reference, Project URL, and publishable key. From `backend/`, run:

```bash
pnpm dlx supabase login
pnpm dlx supabase link --project-ref YOUR_PROJECT_ID
pnpm dlx supabase migration list
pnpm dlx supabase db push --dry-run
pnpm dlx supabase db push
pnpm dlx supabase migration list
pnpm dlx supabase db lint --linked
```

Always review the dry run before applying migrations. Never run `db reset --linked` against production, commit a database password, or add service-role credentials. The ordered migrations create the schema, functions, RLS policies, and initial verified opportunity records.

See the [database migration guide](backend/docs/database-migrations.md) for environment separation, history verification, seed handling, and RLS checks.

## Run the backend

Development mode with automatic restart:

```bash
pnpm dev
```

Production-style local process without file watching:

```bash
pnpm start
```

Expected local address:

```text
http://localhost:5000
```

Expected API base URL:

```text
http://localhost:5000/api/v1
```

## Verify health

```bash
curl http://localhost:5000/api/v1/health
```

Expected status: `200 OK`

```json
{
  "data": {
    "status": "ok",
    "service": "ascent-api"
  }
}
```

The health endpoint can also be opened in a browser or requested through Postman or Thunder Client. PowerShell:

```powershell
Invoke-WebRequest http://localhost:5000/api/v1/health | Select-Object StatusCode, Content
```

## Run automated checks

```bash
pnpm check:syntax
pnpm test
pnpm test:watch
```

- `check:syntax` checks JavaScript under `src`, `tests`, and `scripts`.
- `test` runs the complete offline suite once and exits non-zero on failure.
- `test:watch` starts the interactive Vitest watcher.
- Normal tests require no secrets, make no OpenAI calls, and run no remote migrations.

## Authentication tokens

Protected endpoints require:

```http
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

Create an ordinary test user through Supabase Dashboard → Authentication → Users or the normal Supabase Auth sign-up flow. Sign in using the project URL and publishable key, then use the returned session's `access_token`.

The publishable key is not the bearer token. The access token represents one authenticated user. Invalid or expired tokens return HTTP 401. Never commit, log, share, or export real passwords or access tokens.

## API testing tools

Supported tools:

1. Postman — recommended primary client
2. Thunder Client — VS Code alternative
3. curl — terminal client
4. `Invoke-WebRequest` or `Invoke-RestMethod` — PowerShell
5. Browser — health endpoint only
6. Supabase Dashboard — users, database records, and RLS verification

Postman assets:

- [Ascent backend collection](backend/docs/postman/Ascent-Backend.postman_collection.json)
- [Local Postman environment](backend/docs/postman/Ascent-Local.postman_environment.json)

Set `accessToken` locally and replace resource-ID placeholders with records visible to the test user. Never commit a populated environment export.

Recommended testing sequence:

1. Health check
2. Authentication context
3. Update and get profile
4. List and view opportunities
5. Save and list saved opportunities
6. Create and update an application
7. Update its checklist
8. List, read, and dismiss notifications
9. Call an AI endpoint
10. Confirm `AI_NOT_CONFIGURED`

## curl examples

From Git Bash, macOS, or Linux:

```bash
BASE_URL=http://localhost:5000/api/v1
ACCESS_TOKEN=replace_with_test_access_token

curl "$BASE_URL/health"
curl -H "Authorization: Bearer $ACCESS_TOKEN" "$BASE_URL/auth/me"
curl -X PATCH "$BASE_URL/profile" -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"persona":"student","educationLevel":"undergraduate","skills":["JavaScript"],"interests":["technology"],"preferredOpportunityTypes":["internship"]}'
curl -H "Authorization: Bearer $ACCESS_TOKEN" "$BASE_URL/opportunities?page=1&limit=20"
curl -H "Authorization: Bearer $ACCESS_TOKEN" "$BASE_URL/opportunities/OPPORTUNITY_UUID"
curl -X POST "$BASE_URL/saved-opportunities/OPPORTUNITY_UUID" -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"notes":"Review requirements"}'
curl -X POST "$BASE_URL/applications" -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"opportunityId":"OPPORTUNITY_UUID","status":"planning"}'
curl -X PATCH "$BASE_URL/applications/APPLICATION_UUID" -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"status":"preparing"}'
curl -X PATCH "$BASE_URL/applications/APPLICATION_UUID/checklist" -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"checklist":[{"id":"00000000-0000-4000-8000-000000000010","title":"Prepare CV","completed":false,"completedAt":null}]}'
curl -H "Authorization: Bearer $ACCESS_TOKEN" "$BASE_URL/notifications"
curl -X POST "$BASE_URL/ai/opportunity-matches" -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"limit":10}'
```

PowerShell:

```powershell
$ascentBaseUrl = 'http://localhost:5000/api/v1'
$ascentHeaders = @{ Authorization = 'Bearer replace_with_test_access_token' }
Invoke-RestMethod "$ascentBaseUrl/auth/me" -Headers $ascentHeaders
Invoke-RestMethod "$ascentBaseUrl/opportunities?page=1&limit=20" -Headers $ascentHeaders
```

## Response envelopes and status codes

Typical success:

```json
{
  "data": {},
  "meta": {
    "requestId": "uuid"
  }
}
```

Single-resource responses may omit `meta`; every response includes `X-Request-Id`.

Authentication failure — HTTP 401:

```json
{
  "error": {
    "code": "AUTHENTICATION_REQUIRED",
    "message": "A valid bearer access token is required.",
    "requestId": "uuid"
  }
}
```

Validation failure — HTTP 422:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request body contains invalid fields.",
    "requestId": "uuid",
    "details": []
  }
}
```

AI disabled — HTTP 503:

```json
{
  "error": {
    "code": "AI_NOT_CONFIGURED",
    "message": "AI features are temporarily unavailable.",
    "requestId": "uuid"
  }
}
```

Important statuses:

- `200`: successful request
- `201`: resource created
- `400`: malformed JSON
- `401`: missing, invalid, or expired token
- `403`: CORS or authorization denial
- `404`: resource missing or inaccessible
- `409`: duplicate or invalid-state conflict
- `413`: request body too large
- `422`: strict validation failure
- `429`: rate limit exceeded
- `503`: AI disabled or dependency unavailable
- `500`: sanitized internal failure

## Endpoint reference

All paths below are relative to `/api/v1`.

| Method | Endpoint | Auth | Purpose |
|---|---|---:|---|
| GET | `/health` | No | Health check |
| GET | `/auth/me` | Yes | Current authenticated user |
| GET/PATCH | `/profile` | Yes | Read or update profile |
| GET | `/opportunities` | Yes | Discover active opportunities |
| GET | `/opportunities/{opportunityId}` | Yes | Full opportunity details |
| GET | `/saved-opportunities` | Yes | List saved opportunities |
| POST/PATCH/DELETE | `/saved-opportunities/{opportunityId}` | Yes | Save, update, or remove |
| GET/POST | `/applications` | Yes | List or create trackers |
| GET/PATCH/DELETE | `/applications/{applicationId}` | Yes | Manage an application |
| PATCH | `/applications/{applicationId}/checklist` | Yes | Replace checklist |
| GET | `/notifications` | Yes | Synchronize and list notifications |
| GET | `/notifications/unread-count` | Yes | Get unread count |
| PATCH | `/notifications/{notificationId}/read` | Yes | Mark notification read |
| PATCH | `/notifications/{notificationId}/dismiss` | Yes | Dismiss notification |
| POST | `/notifications/read-all` | Yes | Read all non-dismissed notifications |
| POST | `/ai/opportunity-matches` | Yes | Optional custom synthetic-baseline matching |
| POST | `/ai/opportunities/{opportunityId}/summary` | Yes | Verified-opportunity summary when allowlisted |
| POST | `/ai/opportunities/{opportunityId}/readiness` | Yes | Deterministic readiness plus generated explanation when allowlisted |
| POST | `/ai/cv-analysis` | Yes | General or optional opportunity-specific CV analysis when allowlisted |
| POST | `/ai/opportunities/{opportunityId}/cover-letter` | Yes | Disabled cover-letter contract |
| POST | `/ai/essay-assistance` | Yes | Disabled essay contract |

See the complete [OpenAPI 3.1 specification](backend/docs/openapi.json) for filters, request schemas, response schemas, and error codes. Frontend developers should also read the [frontend integration guide](backend/docs/frontend-integration.md).

## Application and notification behavior

Application statuses are:

```text
planning, preparing, submitted, under_review, shortlisted,
accepted, rejected, withdrawn
```

Checklist items contain `id`, `title`, `completed`, and `completedAt`. PostgreSQL manages completion timestamps. Notification reminders are calculated lazily when notifications are requested. Read and dismiss operations are idempotent, and read-all does not restore dismissed notifications.

## Database and API security

- Profiles, saved opportunities, applications, and notifications are protected by RLS ownership policies.
- Anonymous table access is denied.
- Authenticated users cannot mutate opportunity records.
- Users cannot insert notifications directly or alter managed database fields.
- The server creates a request-scoped Supabase client using the verified user's JWT.
- Helmet, body limits, request IDs, strict UUID/body validation, sanitized logs, and rate limits remain enabled.
- CORS permits only exact configured origins; production wildcards are rejected.
- Global and AI rate limits use in-memory stores per process or function instance. Larger horizontally scaled deployments require shared storage.
- CVs, essays, drafts, prompts, and AI output are not persisted or logged.

Verify RLS with two ordinary test users and their own JWTs. Confirm each can access only their records, cross-user UUID access fails, direct notification inserts fail, and opportunity mutations fail. Never use service-role credentials for these checks.

## Backend directory structure

```text
backend/
├── docs/                 OpenAPI, Postman, frontend, and database guides
├── scripts/              Dependency-free verification scripts
├── src/
│   ├── config/           Environment, CORS, and Supabase clients
│   ├── controllers/      HTTP response orchestration
│   ├── middleware/       Authentication, validation, limits, and errors
│   ├── routes/           Express endpoint registration
│   ├── schemas/          Strict Zod contracts
│   └── services/         Database and AI-ready domain logic
├── supabase/migrations/  Ordered schema, RLS, function, and seed migrations
└── tests/                Offline route, unit, security, and contract tests
```

There is currently no `utils` directory; reusable behavior is kept in the closest config, middleware, schema, or service module.

## AI capability behavior

AI is fail-closed by default. For local verification, use untracked or process-only backend values:

```env
AI_ENABLED=true
AI_PROVIDER=custom
AI_FEATURES=opportunity_matching,opportunity_summary,readiness,cv_analysis
```

The same feature must be enabled in the private model service. Cover letters and essay assistance always return `AI_NOT_CONFIGURED` after authentication, rate limiting, and validation, without calling a model. The frontend calls Express only; FastAPI, Ollama, and internal keys are never browser configuration. Match and readiness scores are guidance, never outcome probabilities.

### Three-process local AI startup

1. Start or verify Ollama on port 11434. If the Windows Ollama app/service is already running, do not start a second server. Install the evaluated model manually with `ollama pull qwen3:4b-instruct` and confirm it with `ollama list`.
2. From `model-service/`, activate `.venv` and run `uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000` using untracked settings for `opportunity_summary,readiness,cv_analysis` and `OLLAMA_MODEL=qwen3:4b-instruct`.
3. From `backend/`, run `pnpm dev`; Express listens on port 5000 by default.

CPU-only generation may take tens of seconds. Frontends should show a cancellable loading state and preserve the request ID for support. Generated output requires human review. Matching uses a synthetic-data baseline and Qwen is a small pretrained, English-first model; neither proves real-world accuracy, eligibility, employment suitability, selection, or funding.

## Troubleshooting

| Problem | Check |
|---|---|
| pnpm blocked in PowerShell | Use `pnpm.cmd`. |
| Invalid environment configuration | Compare `.env` with `.env.example`; production requires Supabase values. |
| Port 5000 already in use | Stop the conflicting process or set another valid `PORT`. |
| CORS 403 | Configure the exact frontend origin without a path, trailing slash, or wildcard. |
| HTTP 401 | Refresh the Supabase session and send its user access token. |
| HTTP 403 | Check record ownership, RLS, and the configured origin. |
| HTTP 409 | Check duplicates, profile requirements, or application status transition. |
| HTTP 422 | Compare fields with OpenAPI; unknown fields are rejected. |
| HTTP 429 | Wait for the rate-limit window before retrying. |
| AI HTTP 503 | Expected while AI is disabled; do not fabricate output. |
| Supabase linking failure | Check login, project reference, network, and account access. |
| Docker warning | Docker is needed for the full local Supabase stack, not linked cloud commands. |
| Migration mismatch | Review `migration list`; never repair production history blindly. |
| Frontend cannot connect | Check health, API base URL, exact CORS origin, token, and browser network logs. |

## Future Vercel deployment settings

No deployment has been performed. The prepared settings are:

- Repository: `richartdo/ascent`
- Root Directory: `backend`
- Production branch: `main`
- Preview/UAT branch: `uat`
- Node.js: 22
- Install command: `pnpm install --frozen-lockfile`
- Build command/output directory: none for expected zero-configuration Express detection
- Health endpoint: `/api/v1/health`
- Exact stable frontend origin in `CORS_ORIGINS`
- `AI_ENABLED=false` and an empty `OPENAI_API_KEY`
- Supabase URL and publishable key only; no service-role key

The default Express export is deployment preparation. Vercel behavior remains unverified until an explicitly approved preview deployment is performed.

## Verification checklist

- [ ] Repository cloned and `uat` selected
- [ ] Backend dependencies installed
- [ ] `.env` created without committed credentials
- [ ] Supabase project created and linked
- [ ] Migration dry run reviewed
- [ ] Migrations applied and history verified
- [ ] Database lint passes
- [ ] Syntax and automated tests pass
- [ ] Server starts and health returns HTTP 200
- [ ] Authentication and profile tested
- [ ] Opportunities and saved opportunities tested
- [ ] Applications and checklists tested
- [ ] Notifications tested
- [ ] AI endpoint returns `AI_NOT_CONFIGURED`
- [ ] No credentials, passwords, tokens, or service-role keys are committed

The [backend-local README](backend/README.md) contains the same operational guidance for developers working directly inside the backend directory.
