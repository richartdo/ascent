# Ascent Backend

## 1. Backend overview

Ascent serves African students, graduates, and young founders who need a safer, more organized way to discover and pursue opportunities. This Express API provides authentication context, profiles, verified opportunity discovery, saved opportunities, application tracking, checklists, and lazy in-app deadline notifications.

Implemented features are operational. When explicitly allowed in both services, the private Python service provides synthetic-baseline opportunity matching plus Qwen-backed opportunity summaries, readiness explanations, and general or opportunity-specific CV analysis. Cover-letter generation and essay assistance remain deferred and return HTTP 503 `AI_NOT_CONFIGURED`. Fresh installations stay fail-closed and the backend never returns fake AI results.

Deferred features include the live OpenAI adapter, email/push notifications, background workers, and deployment.

## 2. Technology stack

- Node.js 22 and Express 5
- JavaScript ES modules
- pnpm 10.31.0
- Supabase PostgreSQL and Authentication
- Zod request/environment validation
- Helmet, CORS, Morgan and express-rate-limit
- Vitest and Supertest
- Provider-neutral AI boundary with four approved private-model capabilities; OpenAI remains unused
- Vercel as the future deployment target

## 3. Prerequisites

Install Git, Node.js 22, pnpm 10, and create a Supabase account/project. The Supabase CLI is run through pnpm and need not be installed globally. VS Code or another editor and Postman, Thunder Client, curl, or PowerShell are useful for API testing.

```bash
git --version
node --version
pnpm.cmd --version
```

If PowerShell blocks `pnpm.ps1`, use `pnpm.cmd` without changing the machine execution policy, for example `pnpm.cmd test`.

## 4. Clone and select a branch

```bash
git clone https://github.com/richartdo/ascent.git
cd ascent
git checkout uat
cd backend
```

`main` is production, `uat` is integration/testing, and `feature/*` branches are for isolated work.

## 5. Install dependencies

```bash
pnpm.cmd install --frozen-lockfile
```

The frozen lockfile makes installation fail rather than silently changing dependency versions recorded in `pnpm-lock.yaml`. When intentionally updating dependencies, use:

```bash
pnpm.cmd install
```

## 6. Environment setup

Git Bash/macOS/Linux:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Template:

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

| Variable | Meaning |
|---|---|
| `PORT` | Local listener port. Platforms may provide their own port. |
| `NODE_ENV` | `development`, `test`, or `production`. Production requires Supabase configuration. |
| `CORS_ORIGINS` | Comma-separated exact HTTP(S) frontend origins, without paths or wildcards. |
| `SUPABASE_URL` | Project URL from Supabase Dashboard → Project Settings/API. |
| `SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable/anon key from the same API settings page. |
| `AI_ENABLED` | Safe default `false`; set `true` only in an untracked environment when running private-model capabilities. |
| `AI_PROVIDER` | Safe default `disabled`; use `custom` only with the private model service. |
| `AI_FEATURES` | Strict Express allowlist: `opportunity_matching`, `opportunity_summary`, `readiness`, and `cv_analysis`. Unknown, writing, and essay names fail validation. |
| `MODEL_SERVICE_URL` | Exact private model-service origin. HTTP is allowed only for loopback. |
| `MODEL_SERVICE_API_KEY` | Internal shared key; blank is allowed locally and production requires it. Never expose it to a browser. |
| `MODEL_SERVICE_TIMEOUT_MS` | Per-candidate timeout from 500–10,000 ms. |
| `GENERATION_SERVICE_TIMEOUT_MS` | Generation timeout from 10,000–120,000 ms; keep it slightly above Ollama's timeout. Express never retries generation. |
| `MODEL_SERVICE_MAX_CANDIDATES` | Deterministically ordered candidate cap from 1–20. |
| `MODEL_SERVICE_CONCURRENCY` | Bounded parallel model calls from 1–5. |
| `OPENAI_API_KEY` | Optional and intentionally empty while AI is disabled. |
| `OPENAI_MODEL` | Reserved model identifier for the future adapter. |
| `AI_TEXT_MAX_LENGTH` | Maximum accepted AI text input length. |
| `JSON_BODY_LIMIT` | Express JSON payload limit. |

The publishable key identifies the Supabase project; it is not a user access token. RLS and the authenticated user's JWT enforce ownership. No service-role key is needed or permitted. `.env` is ignored and must never be committed.

For local manual testing, supply real values only for `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and the same private `MODEL_SERVICE_API_KEY` used by `model-service/.env`. Keep `OPENAI_API_KEY` empty. Leave `VERCEL` unset locally; the parser defaults it to false and Vercel supplies it on-platform.

## 7. Supabase project and migrations

Create a Supabase project in the dashboard. Copy its Project ID/reference, Project URL, and publishable key. From `backend/`:

```bash
pnpm.cmd dlx supabase login
pnpm.cmd dlx supabase link --project-ref YOUR_PROJECT_ID
pnpm.cmd dlx supabase migration list
pnpm.cmd dlx supabase db push --dry-run
pnpm.cmd dlx supabase db push
pnpm.cmd dlx supabase migration list
pnpm.cmd dlx supabase db lint --linked
```

Always inspect the dry run before applying. Never run `db reset --linked` against production, commit a database password, or add service-role credentials. The ordered migration files create the schema, RLS policies, functions, and initial verified opportunity seeds. See [database-migrations.md](docs/database-migrations.md).

Docker Desktop is required only for Supabase's full local stack; linked migration commands do not require a local Docker database.

## 8. Run the backend

Development with automatic restart:

```bash
pnpm.cmd dev
```

Production-style local process without file watching:

```bash
pnpm.cmd start
```

Both use `src/server.js`, validate configuration, and listen on `PORT`. The expected local address is `http://localhost:5000`; the API base is `http://localhost:5000/api/v1`. Startup logs report only the port, not credentials.

## 9. Verify health

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

The health URL can also be opened in a browser or sent from Postman/Thunder Client. PowerShell:

```powershell
Invoke-WebRequest http://localhost:5000/api/v1/health | Select-Object StatusCode, Content
```

Only health is intended for browser testing without an Authorization header.

## 10. Automated verification

```bash
pnpm.cmd check:syntax
pnpm.cmd test
pnpm.cmd test:watch
```

`check:syntax` checks every JavaScript file under `src`, `tests`, and `scripts`. `test` runs once and returns non-zero on failure; `test:watch` is interactive. Tests mock the private model boundary, require no secrets, make no OpenAI or external calls, and run no remote migrations.

## 11.1 Enable local private-model capabilities

Use this startup order: Ollama on port 11434, FastAPI on port 8000, then Express on port 5000. If the Windows Ollama app/service is already running, do not start another server. Install and verify the evaluated model manually with `ollama pull qwen3:4b-instruct` and `ollama list`; the application never downloads it.

In an untracked `model-service/.env` use:

```dotenv
GENERATION_ENABLED=true
GENERATION_FEATURES=opportunity_summary,readiness,cv_analysis
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b-instruct
OLLAMA_TIMEOUT_SECONDS=60
OLLAMA_TEMPERATURE=0
OLLAMA_MAX_INPUT_CHARS=30000
OLLAMA_MAX_CONCURRENCY=2
```

Run `.venv\Scripts\python.exe -m uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000`. In the untracked `backend/.env`, use:

```dotenv
AI_ENABLED=true
AI_PROVIDER=custom
AI_FEATURES=opportunity_matching,opportunity_summary,readiness,cv_analysis
GENERATION_SERVICE_TIMEOUT_MS=75000
```

Then run `pnpm.cmd dev`. Uvicorn must be private; frontend clients call only Express and must never receive `MODEL_SERVICE_URL`, `MODEL_SERVICE_API_KEY`, or the Ollama origin. CPU generation may take tens of seconds, so clients should show a cancellable loading state and retain the response request ID.

Readiness uses deterministic components totaling 100 points: profile completeness 30, explicit eligibility compatibility 30, preference fit 20, and positive structured skill evidence 20. Unknown country or education information receives exactly half credit for that 10-point check and is exposed as uncertainty. Explicit incompatibility produces `unlikely` and caps the total at 74. Qwen supplies explanations only and cannot alter points, band, or eligibility assessment.

The current synthetic model does not support `job` opportunities or `locationMode=unspecified`; those records are excluded as model-incompatible, not labelled ineligible. Supporting them requires a future retrained dataset/model. Skill overlap uses only transparent matches against structured `requirements` entries. Because there is no structured required-skills field, the baseline cannot reliably identify missing skills and never treats a zero missing-skill count as proof that none are missing.

Education mapping compares a valid `graduationYear` with the current UTC year: secondary, undergraduate, and postgraduate levels map to the corresponding in-progress value for a future year and completed value for a past/current year. Without a year, the fallbacks are secondary completed, bachelor's in progress, graduate/bachelor's completed, and master's in progress. `other` is not invented as a trained category and returns `PROFILE_REQUIRED`. This mapping is only a model input; deterministic opportunity eligibility remains authoritative.

The Postman collection's internal diagnostics folder is for local backend developers only. Its URL is loopback and its key placeholder is blank/secret-typed. Never export a populated environment or copy either internal value into frontend code.

## 11. Obtain a Supabase access token

Protected endpoints require:

```text
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

Create a test user through Supabase Dashboard → Authentication → Users or through your application's normal Supabase Auth sign-up flow. Sign in with the Supabase client using the project URL and publishable key, then copy the returned session's `access_token` into your local API client. Do not use the publishable key as the bearer token.

The access token represents one authenticated user. Expired or invalid tokens return HTTP 401. Never commit, log, share, or store test passwords/tokens in exported Postman assets.

## 12. API testing tools and sequence

Postman is the recommended primary client. Import:

- [Ascent collection](docs/postman/Ascent-Backend.postman_collection.json)
- [Local environment](docs/postman/Ascent-Local.postman_environment.json)

Select the environment, set `accessToken`, and replace resource-ID placeholders with records visible to the test user. Thunder Client can use the same `baseUrl`, bearer token, and JSON bodies. curl and `Invoke-WebRequest` are suitable terminal alternatives; the Supabase Dashboard is used for users, tables, and RLS checks.

Required local testing order:

1. Run automated backend tests with `pnpm.cmd check:syntax` and `pnpm.cmd test`.
2. Run automated model-service tests with `.venv\Scripts\python.exe -m pytest`.
3. Confirm Ollama and Qwen with `ollama list`, `ollama ps`, and the Ollama API check in the model-service guide.
4. Start FastAPI using the direct `.venv\Scripts\python.exe` command.
5. Test FastAPI health and expect HTTP 200.
6. Start Express with `pnpm.cmd dev`.
7. Test Express health and expect HTTP 200.
8. Obtain a development test-user access token without saving it in Git.
9. Test `/auth/me` and create or update the test user's profile.
10. List opportunities and copy an RLS-visible `opportunityId`.
11. Test opportunity matching.
12. Test the opportunity summary.
13. Test readiness assessment.
14. Test general CV analysis with fictional text and no `opportunityId`.
15. Test opportunity-specific CV analysis with fictional text and the visible `opportunityId`.
16. Test cover-letter and essay routes and confirm HTTP 503 `AI_NOT_CONFIGURED` for valid bodies.
17. Stop only the FastAPI and Express processes started for this test.

Expected local results:

| Check | Expected result |
|---|---|
| Express health | HTTP 200 |
| FastAPI health | HTTP 200 |
| Protected endpoint without token | HTTP 401 |
| Invalid or unknown request field | HTTP 422 |
| Matching | Normally under 1 second |
| Opportunity summary | Approximately 35 seconds on the current CPU |
| Readiness | Approximately 35 seconds on the current CPU |
| CV analysis | Approximately 37 seconds on the current CPU |
| Deferred features | HTTP 503 `AI_NOT_CONFIGURED` |
| Ollama/FastAPI unavailable | Sanitized HTTP 503 |
| Generation timeout | Sanitized HTTP 504 |

Generation latency varies substantially with CPU, memory, model state, and concurrent work.

Postman variables required for public testing are `baseUrl`, `accessToken`, `opportunityId`, `supabaseUrl`, and `supabasePublishableKey`. `modelServiceUrl` and `modelServiceApiKey` are developer-only internal diagnostics. Keep placeholders in exported files, never commit populated Postman environments, never put the internal key in frontend code, and never share screenshots containing tokens or keys.

## 13. curl examples

Git Bash/macOS/Linux variables:

```bash
BASE_URL=http://localhost:5000/api/v1
ACCESS_TOKEN=replace_with_test_access_token
```

```bash
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

PowerShell example:

```powershell
$ascentBaseUrl = 'http://localhost:5000/api/v1'
$ascentHeaders = @{ Authorization = 'Bearer replace_with_test_access_token' }
Invoke-RestMethod "$ascentBaseUrl/auth/me" -Headers $ascentHeaders
Invoke-RestMethod "$ascentBaseUrl/opportunities?page=1&limit=20" -Headers $ascentHeaders
```

## 14. Response envelopes and status codes

Typical success:

```json
{ "data": {}, "meta": { "requestId": "uuid" } }
```

Some single-resource responses omit `meta`; the request ID is always returned in `X-Request-Id`. Created resources use HTTP 201.

Authentication required — HTTP 401:

```json
{ "error": { "code": "AUTHENTICATION_REQUIRED", "message": "A valid bearer access token is required.", "requestId": "uuid" } }
```

Validation failure — HTTP 422:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "The request body contains invalid fields.", "requestId": "uuid", "details": [] } }
```

AI disabled — HTTP 503:

```json
{ "error": { "code": "AI_NOT_CONFIGURED", "message": "AI features are temporarily unavailable.", "requestId": "uuid" } }
```

Status meanings: `200` success, `201` created, `400` malformed JSON, `401` missing/invalid token, `403` CORS/RLS authorization denial, `404` missing or inaccessible resource, `409` duplicate or invalid state conflict, `413` oversized payload, `422` validation failure, `429` rate limit, `503` disabled AI/dependency unavailable, and `500` sanitized internal failure.

## 15. Endpoint reference

| Method | Endpoint | Auth | Purpose | Important codes |
|---|---|---:|---|---|
| GET | `/health` | No | Health check | 200, 429 |
| GET | `/auth/me` | Yes | Current user | 200, 401, 503 |
| GET/PATCH | `/profile` | Yes | Read/update profile | 200, 401, 422 |
| GET | `/opportunities` | Yes | Active discovery | 200, 401, 422 |
| GET | `/opportunities/{opportunityId}` | Yes | Full details | 200, 404, 422 |
| GET | `/saved-opportunities` | Yes | List saved records | 200, 401 |
| POST/PATCH/DELETE | `/saved-opportunities/{opportunityId}` | Yes | Save/update/remove | 200, 201, 404, 409, 422 |
| GET/POST | `/applications` | Yes | List/create trackers | 200, 201, 409, 422 |
| GET/PATCH/DELETE | `/applications/{applicationId}` | Yes | Read/update/delete | 200, 404, 409, 422 |
| PATCH | `/applications/{applicationId}/checklist` | Yes | Replace checklist | 200, 404, 422 |
| GET | `/notifications` | Yes | Sync/list notifications | 200, 401, 422 |
| GET | `/notifications/unread-count` | Yes | Unread count | 200, 401 |
| PATCH | `/notifications/{notificationId}/read` | Yes | Mark read | 200, 404, 422 |
| PATCH | `/notifications/{notificationId}/dismiss` | Yes | Dismiss | 200, 404, 422 |
| POST | `/notifications/read-all` | Yes | Read all non-dismissed | 200, 422 |
| POST | `/ai/opportunity-matches` | Yes | Optional custom synthetic-baseline matching | 200, 401, 409, 422, 429, 502, 503, 504 |
| POST | `/ai/opportunities/{opportunityId}/summary` | Yes | Verified-opportunity summary | 200, 401, 404, 422, 429, 502, 503, 504 |
| POST | `/ai/opportunities/{opportunityId}/readiness` | Yes | Deterministic readiness plus generated explanation | 200, 401, 404, 409, 422, 429, 502, 503, 504 |
| POST | `/ai/cv-analysis` | Yes | General analysis or opportunity relevance with optional `opportunityId` | 200, 401, 404, 422, 429, 502, 503, 504 |
| POST | `/ai/opportunities/{opportunityId}/cover-letter` | Yes | Deferred; valid requests return `AI_NOT_CONFIGURED` | 401, 422, 429, 503 |
| POST | `/ai/essay-assistance` | Yes | Deferred; valid requests return `AI_NOT_CONFIGURED` | 401, 422, 429, 503 |

All paths are relative to `/api/v1`. See [OpenAPI 3.1](docs/openapi.json) for complete schemas and filters.

## 16. Database security verification

Use two ordinary test users and each user's JWT—never a service-role key. Verify that anonymous table requests fail; each user sees only their profile, saves, applications, and notifications; cross-user UUID requests return no record; direct notification inserts fail; and authenticated opportunity mutation attempts fail. Confirm RLS is enabled/forced in migrations and use Supabase Dashboard's policy view or SQL editor with user-role/JWT claims. The offline migration tests also assert grants, policies, managed columns, and `auth.uid()` ownership.

## 17. Backend structure

```text
backend/
├── docs/                 OpenAPI, Postman and integration/database guides
├── scripts/              Dependency-free verification scripts
├── src/
│   ├── config/           Environment, CORS and Supabase clients
│   ├── controllers/      HTTP response orchestration
│   ├── middleware/       Auth, validation, rate limits and errors
│   ├── routes/           Express endpoint registration
│   ├── schemas/          Strict Zod contracts
│   └── services/         Database and AI-ready domain logic
├── supabase/migrations/  Ordered schema, policy and seed migrations
└── tests/                Offline unit, route, security and contract tests
```

There is no `utils` directory; reusable behavior currently belongs to the closest config, middleware, schema, or service module.

## 18. Security guidance

- Use exact HTTPS production CORS origins; wildcards are rejected.
- Never expose the Supabase user token, database password, `.env`, or service-role key.
- The server creates one Supabase client per authenticated request using that user's JWT.
- Helmet, request IDs, body limits, strict schemas, sanitized logs, RLS, and rate limits remain enabled.
- Global and AI limits use in-memory stores per process/function instance. Horizontally scaled deployments need shared storage for globally consistent counters.
- CV text and drafts are neither persisted nor logged.

## 19. Troubleshooting

| Problem | Check |
|---|---|
| PowerShell reports a `pnpm.ps1` execution-policy error | Use `pnpm.cmd`; changing the machine execution policy is unnecessary. |
| Missing/invalid environment | Compare `.env` with `.env.example`; production requires Supabase values. |
| Port 5000 in use | Identify its owner before stopping anything, or choose another valid `PORT`. |
| Port 8000 in use | Identify its owner before stopping anything, or use a temporary FastAPI port and update the private backend model-service URL. |
| Ollama port 11434 unavailable | Check the Ollama application/service and `Invoke-RestMethod http://127.0.0.1:11434/api/tags`; do not start a duplicate server. |
| `qwen3:4b-instruct` missing | Confirm with `ollama list`, then manually run `ollama pull qwen3:4b-instruct`. |
| Internal API returns 401 | Confirm the ignored backend and model-service `MODEL_SERVICE_API_KEY` values match. Never print either value. |
| CORS 403 | Add the exact frontend origin, with no path/trailing slash/wildcard. |
| HTTP 401 | Refresh the Supabase session and send its access token. |
| HTTP 403 | Check ownership and RLS; do not use another user's IDs. |
| HTTP 409 `PROFILE_REQUIRED` | Complete the required profile fields before matching or readiness; other 409 responses may indicate duplicate resources or invalid status transitions. |
| HTTP 422 | Compare JSON/query fields with OpenAPI; unknown fields are rejected. |
| HTTP 429 | Wait for the 15-minute in-memory window. |
| `AI_NOT_CONFIGURED` | Expected while globally disabled, when an approved feature is absent from either allowlist, or for deferred cover-letter/essay routes. Do not fabricate fallback output. |
| `AI_SERVICE_UNAVAILABLE` / `AI_TIMEOUT` | Start/check the private model service and confirm the backend-only URL/key configuration. |
| AI HTTP 502/503/504 | Check strict model output, FastAPI/Ollama availability, and timeout logs using request IDs; responses remain sanitized. |
| Slow CPU generation | Wait for the documented timeout, avoid concurrent requests, and keep a loading state visible. |
| Supabase link failure | Confirm project ref, login, network, and account access. |
| Docker warning | Needed for local Supabase only, not linked cloud commands. |
| Migration mismatch | Run `migration list`, inspect history, and never repair blindly. |
| Frontend cannot connect | Check backend health, base URL, exact CORS origin, token, and browser network log. |

## 20. Future Vercel deployment

No deployment is performed in this phase. Proposed project settings:

- Repository: `richartdo/ascent`
- Root Directory: `backend`
- Production branch: `main`
- Preview/UAT branch: `uat`
- Node.js: 22
- Install: `pnpm.cmd install --frozen-lockfile`
- Build/output directory: none for zero-configuration Express detection
- Health endpoint: `/api/v1/health`
- Exact stable frontend origin in `CORS_ORIGINS`
- Keep `AI_ENABLED=false` and `AI_PROVIDER=disabled` unless the private custom matcher is intentionally deployed; leave `OPENAI_API_KEY` empty
- Supabase project URL and publishable key only; no service-role key

The app has a default export for deployment preparation, but Vercel behavior remains unverified until an explicitly approved preview deployment.

## 21. Final verification checklist

- [ ] Repository cloned and correct branch selected
- [ ] Dependencies installed with the frozen lockfile
- [ ] `.env` created without committed credentials
- [ ] Supabase project linked
- [ ] Migration dry run reviewed and migrations applied
- [ ] Migration history and database lint pass
- [ ] Syntax and automated tests pass
- [ ] Server starts and health returns HTTP 200
- [ ] Authentication and profile tested
- [ ] Opportunities and saved opportunities tested
- [ ] Applications and checklists tested
- [ ] Notifications tested
- [ ] Matching returns either the expected ranked response when custom is enabled or `AI_NOT_CONFIGURED` when disabled
- [ ] Enabled matching, summary, readiness, and CV endpoints return strict responses; deferred cover-letter and essay endpoints return `AI_NOT_CONFIGURED`
- [ ] No credentials, tokens, passwords, or service-role keys committed

To stop local processes safely, close the two terminals that started FastAPI and Express or press Ctrl+C in each. If the originating terminal is unavailable, identify the owner first:

```powershell
Get-NetTCPConnection -State Listen | Where-Object LocalPort -In 5000,8000 | Select-Object LocalPort,OwningProcess
Get-Process -Id <OWNING_PROCESS_ID>
```

Only after confirming it is the process you started should you run `Stop-Process -Id <OWNING_PROCESS_ID>`. Do not stop the Ollama Windows application/service or any unrelated Node/Python process merely because it has a familiar name.
