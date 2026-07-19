# Ascent Model Service

This directory contains Ascent's internal FastAPI service for custom opportunity-match inference and optional local structured generation. It is separate from the Node.js Express backend so Python model dependencies and Ollama integration do not become browser-facing concerns or Node.js dependencies.

The service loads one trusted Joblib model during startup and exposes an unauthenticated health check plus internally authenticated endpoints. Matching remains available when local generation is disabled or unavailable. Generation calls only the configured Ollama origin and never persists prompts, CVs, essays, drafts, or responses. Hard eligibility and deterministic readiness scores remain the responsibility of the Express backend.

The current artifact is trained on synthetic data. Its evaluation metrics do not establish real-world accuracy, fairness, eligibility, selection, or reliability.

## Requirements

- Python 3.9 or newer. Current local verification uses Python 3.13.7.
- The model must use `scikit-learn==1.6.1`, matching the version used during training. Do not upgrade it without retraining or explicitly validating artifact compatibility.
- Optional generation requires a local [Ollama](https://ollama.com/) installation and the explicitly installed `smollm2:1.7b` model.

## Setup on Windows PowerShell

```powershell
cd model-service
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If the Python launcher is installed on another Windows machine, `py -m venv .venv` may be used as an alternative.

## Setup on Git Bash

```bash
cd model-service
python -m venv .venv
source .venv/Scripts/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## Required model files

The trusted model and its unchanged evaluation metrics must be available at:

```text
model-service/models/ascent_matcher.joblib
model-service/models/metrics.json
```

Joblib artifacts can execute code while being deserialized. Never load a Joblib file from an untrusted or unverified source. Only the trusted Ascent model artifact should be loaded by this service.

## Environment configuration

Copy the placeholder file before running locally.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Git Bash:

```bash
cp .env.example .env
```

Available variables:

| Variable | Purpose |
| --- | --- |
| `MODEL_PATH` | Trusted artifact path relative to `model-service/`. Requests cannot override it. |
| `MODEL_SERVICE_API_KEY` | Shared internal key. It may be empty in local development but is required in production. |
| `MODEL_SERVICE_ENV` | `development`, `test`, or `production`. |
| `MODEL_REQUEST_MAX_BYTES` | Maximum request-body size; defaults to 32,768 bytes. |
| `GENERATION_ENABLED` | Enables internal Ollama generation routes. Defaults to `false`. |
| `GENERATION_FEATURES` | Comma-separated allowlist of generation features. Defaults to `opportunity_summary`; duplicates are removed and unknown names are rejected. |
| `OLLAMA_BASE_URL` | Exact Ollama origin. Defaults to `http://127.0.0.1:11434`; request bodies cannot override it. |
| `OLLAMA_MODEL` | Bounded server-controlled model identifier. Defaults to `smollm2:1.7b`; API clients cannot choose a model. |
| `OLLAMA_TIMEOUT_SECONDS` | Per-request Ollama timeout from 1 to 120 seconds. |
| `OLLAMA_TEMPERATURE` | Generation temperature from 0 to 1; the committed default is `0`. |
| `OLLAMA_MAX_INPUT_CHARS` | Maximum serialized feature input, up to 30,000 characters. |
| `OLLAMA_MAX_CONCURRENCY` | Process-local generation concurrency from 1 to 4. |

Uvicorn does not automatically load this project's `.env` file. Pass it explicitly:

```powershell
uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000
```

Keep the service on a private interface or internal network. Do not expose `/v1/match` publicly, send the internal key to browsers, print keys, or commit `.env`.

## Run locally

After activating `.venv` and installing dependencies:

```powershell
uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000
```

Startup fails if configuration or the model artifact is missing, malformed, or incompatible.

## Optional local generation with Ollama

Install Ollama using its official installer, then explicitly install the approved model once:

```powershell
ollama pull smollm2:1.7b
```

The service never runs `ollama pull` or downloads a model automatically. Confirm Ollama is running on port 11434:

```powershell
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

Set these untracked values in `model-service/.env`:

```env
GENERATION_ENABLED=true
GENERATION_FEATURES=opportunity_summary
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=smollm2:1.7b
OLLAMA_TIMEOUT_SECONDS=60
OLLAMA_TEMPERATURE=0
OLLAMA_MAX_INPUT_CHARS=30000
OLLAMA_MAX_CONCURRENCY=2
```

Start Ollama first, then FastAPI on port 8000:

```powershell
uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000
```

Generation does not probe Ollama during startup. If generation is disabled, Ollama is stopped, or `smollm2:1.7b` is absent, generation endpoints return sanitized `503 GENERATION_UNAVAILABLE` responses while `/v1/match` continues operating.

`GENERATION_ENABLED` is the global switch. When it is `false`, every generation endpoint is unavailable regardless of the allowlist. When it is `true`, only features listed in `GENERATION_FEATURES` are available. Supported names are:

```text
opportunity_summary
readiness
cv_analysis
cover_letter
essay_assistance
```

Keep low-quality or unevaluated features out of this allowlist. Matching is independent of both generation settings.

## API

### Health

```bash
curl http://127.0.0.1:8000/health
```

PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Example response:

```json
{
  "data": {
    "status": "ok",
    "service": "ascent-model-service",
    "modelLoaded": true,
    "modelVersion": "1.0.0",
    "syntheticBaseline": true
  },
  "requestId": "3d98ebfd-f69b-40f5-8950-137d761e38dd"
}
```

### Match

The `X-Model-Service-Key` header is required whenever `MODEL_SERVICE_API_KEY` is configured. Missing and incorrect keys receive the same sanitized HTTP 401 response.

```bash
curl -X POST http://127.0.0.1:8000/v1/match \
  -H "Content-Type: application/json" \
  -H "X-Model-Service-Key: $MODEL_SERVICE_API_KEY" \
  -d '{"combinedText":"Python data analysis and community leadership","profileCountry":"KE","education":"bachelors_in_progress","opportunityType":"fellowship","locationMode":"hybrid","countryEligible":true,"educationCompatible":true,"typePreferred":true,"locationCompatible":true,"skillOverlapCount":3,"missingRequiredSkillCount":1}'
```

PowerShell:

```powershell
$headers = @{ "X-Model-Service-Key" = $env:MODEL_SERVICE_API_KEY }
$body = @{
  combinedText = "Python data analysis and community leadership"
  profileCountry = "KE"
  education = "bachelors_in_progress"
  opportunityType = "fellowship"
  locationMode = "hybrid"
  countryEligible = $true
  educationCompatible = $true
  typePreferred = $true
  locationCompatible = $true
  skillOverlapCount = 3
  missingRequiredSkillCount = 1
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/v1/match -Headers $headers -ContentType application/json -Body $body
```

Example response:

```json
{
  "data": {
    "matchScore": 82,
    "predictedMatch": true,
    "probability": 0.82,
    "modelVersion": "1.0.0",
    "syntheticBaseline": true,
    "disclaimer": "This score is guidance, not a guarantee of eligibility or selection."
  },
  "requestId": "3d98ebfd-f69b-40f5-8950-137d761e38dd"
}
```

The values above illustrate the response shape only; they are not a promised score for the example request. Match responses include `Cache-Control: no-store`.

### Structured generation

The following private endpoints require the same `X-Model-Service-Key` authentication as matching:

```text
POST /v1/generate/opportunity-summary
POST /v1/generate/readiness
POST /v1/generate/cv-analysis
POST /v1/generate/cover-letter
POST /v1/generate/essay-assistance
```

FastAPI supplies a strict JSON schema to Ollama, rejects missing, misplaced, extra, malformed, or outcome-guaranteeing fields, and adds the schema version, disclaimer, model metadata, and pretrained-model limitation itself. SmolLM2 is never asked to generate disclaimers. Readiness generation produces an explanation only; it cannot create or modify the deterministic numeric readiness score.

If Ollama returns a valid outer response but the generated content is invalid JSON or fails the strict output schema, FastAPI may make exactly one schema-correction call. Both calls share the original configured timeout and request ID. The correction prompt includes the required schema and original request context but never includes the invalid generated content. Timeouts, refusals, unavailable-service responses, authentication failures, and semantically unsupported claims are never retried.

Each feature has a bounded output-token allowance: summaries and readiness explanations are short, CV analysis is medium-length, cover letters have a bounded draft, and essay limits vary by `brainstorm`, `outline`, `review`, or `revise` mode. Successful generation responses include `Cache-Control: no-store`.

All supplied profile, opportunity, CV, essay, and instruction content is serialized as untrusted data and separated from static system instructions. Prompts explicitly prohibit following instructions embedded in that content. These controls reduce prompt-injection risk but cannot guarantee that every prompt-injection technique will be prevented; strict validation and human review remain required.

SmolLM2 is a small, English-first pretrained model. Structured JSON does not establish factual accuracy or ensure that content is placed in the most useful field. Review every result against the supplied facts and official opportunity source. Do not use generated text as an eligibility, selection, funding, employment, or success guarantee.

The generation semaphore limits concurrency only within one FastAPI process. Horizontally scaled deployments require shared capacity controls or coordinated admission limits in front of Ollama.

## Test and compile

```powershell
python -m pytest
python -m compileall app tests
```

Automated tests use FastAPI's in-process client and a mocked Ollama transport. They require no running Ollama instance, GPU, Supabase, OpenAI, external service, or network connection.

## Security and privacy

- Never load untrusted Joblib files; deserialization can execute code.
- Never log request bodies, `combinedText`, headers, API keys, or predictions.
- The default Uvicorn access channel is disabled; sanitized path-only access records come from the service middleware.
- Never persist prediction inputs or outputs in this service.
- Never log or persist generation prompts, model responses, CV text, essay text, profile content, opportunity descriptions, or drafts.
- Keep the model service private and rotate internal keys if exposed.
- Treat every result as synthetic-baseline guidance, not an eligibility or selection guarantee.
- Treat every generated result as an English-first pretrained-model draft requiring human review.
