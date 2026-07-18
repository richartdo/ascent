# Ascent Model Service

This directory contains Ascent's internal FastAPI service for custom opportunity-match inference. It is separate from the Node.js Express backend so the fitted model can use native Python, Pandas, Joblib, and scikit-learn dependencies without adding Python packages or model-loading concerns to `backend/`.

The service loads one trusted model during startup and exposes an unauthenticated health check plus an internally authenticated matching endpoint. It does not persist requests or predictions and makes no external network calls. Hard eligibility rules remain the responsibility of the Express backend; a model score must never override explicit eligibility requirements.

The current artifact is trained on synthetic data. Its evaluation metrics do not establish real-world accuracy, fairness, eligibility, selection, or reliability.

## Requirements

- Python 3.9 or newer. Current local verification uses Python 3.13.7.
- The model must use `scikit-learn==1.6.1`, matching the version used during training. Do not upgrade it without retraining or explicitly validating artifact compatibility.

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

## Test and compile

```powershell
python -m pytest
python -m compileall app tests
```

Tests use FastAPI's in-process client, temporary failure artifacts, and no Supabase, OpenAI, external service, or network connection.

## Security and privacy

- Never load untrusted Joblib files; deserialization can execute code.
- Never log request bodies, `combinedText`, headers, API keys, or predictions.
- The default Uvicorn access channel is disabled; sanitized path-only access records come from the service middleware.
- Never persist prediction inputs or outputs in this service.
- Keep the model service private and rotate internal keys if exposed.
- Treat every result as synthetic-baseline guidance, not an eligibility or selection guarantee.
