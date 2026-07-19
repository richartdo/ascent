# Frontend integration guide

## Connection and authentication

Use `http://localhost:5000/api/v1` locally. Configure the deployed API base URL through the frontend's environment system after deployment; do not hardcode a preview URL.

The frontend owns the Supabase Auth session. Send the current session access token on every protected request:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

The Supabase publishable key is not the access token. Before a token expires, let the Supabase client refresh the session; after a 401, request the current session once and retry only when a refreshed token exists. Never log tokens.

## Envelopes and pagination

Successful single-resource responses use `{ "data": ... }`. Lists use:

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0, "requestId": "uuid" }
}
```

Errors use `{ "error": { "code", "message", "requestId", "details?" } }`. Preserve `requestId` when reporting a problem. API fields are camelCase. Timestamps are ISO 8601 strings; parse them as instants and format them in the user's locale/time zone. Dates with `deadline=null` are verified rolling opportunities.

## Status handling

- `401`: refresh/re-authenticate the Supabase session.
- `403`: origin or ownership/RLS denial; do not retry automatically.
- `404`: missing or inaccessible resource.
- `409`: duplicate/state conflict or `PROFILE_REQUIRED`.
- `422`: show field-level validation details.
- `429`: back off and respect rate-limit headers.
- `503`: dependency unavailable; `AI_NOT_CONFIGURED` means disable or label AI controls.

Never replace an AI 503 with fabricated recommendations, summaries, CV feedback, letters, or essays.

## Opportunity matching

The frontend may call only `POST /ai/opportunity-matches` on the Express API with the user's bearer token and `{ "limit": 10 }`. Express loads the authenticated profile and verified opportunities, applies deterministic eligibility rules, and privately calls the Python model service. Never put the model-service URL or internal key in frontend code and never call FastAPI from a browser.

Each `matchScore` is synthetic-baseline relevance guidance, not a probability of eligibility, acceptance, selection, or funding. Explicit deterministic eligibility remains authoritative. A `409 PROFILE_REQUIRED` may include `error.details.profileGaps` containing `countryCode` or `educationLevel`; direct the user to update those fields.

## Summaries, readiness, and CV analysis

Call summaries with `POST /ai/opportunities/{opportunityId}/summary` and `{}`. Call readiness at the corresponding `/readiness` path. Express loads the profile and/or opportunity through the authenticated request-scoped Supabase client; never send raw profile or opportunity content. Readiness component earned points sum exactly to `readinessScore`. Treat `missingInformation` and `eligibilityAssessment=uncertain` visibly, and never present the score as selection probability.

`POST /ai/cv-analysis` accepts either `{ "cvText": "..." }` for general analysis or `{ "cvText": "...", "opportunityId": "uuid" }` for opportunity-specific relevance. Use `analysisScope` and nullable `opportunityId` to label the result accurately. Do not send CV text in URLs, telemetry, error reports, or client logs. Generated content requires human review; CPU responses can take tens of seconds, so show a cancellable loading state and preserve `meta.requestId`.

Cover-letter and essay routes are deferred. Valid authenticated requests return `503 AI_NOT_CONFIGURED`; do not expose controls as working features and do not call FastAPI or Ollama from the browser.

## Opportunities

`GET /opportunities` supports `q`, `type`, `country`, `isGlobal`, `locationMode`, `deadlineBefore`, `deadlineAfter`, `page`, `limit`, and `sort`. Normal discovery returns only published opportunities with a future deadline or verified rolling deadline. Details expose `deadline` and `isExpired` for tracked history.

## Applications and checklists

Statuses are `planning`, `preparing`, `submitted`, `under_review`, `shortlisted`, `accepted`, `rejected`, and `withdrawn`. Do not invent transitions; display a 409 from the backend.

Checklist items have `{ id, title, completed, completedAt }`. Send the complete checklist array. The database controls completion timestamps, so use the returned representation as canonical.

## Notifications

Poll `GET /notifications/unread-count` at a modest interval such as 60 seconds while the app is active, and refresh `GET /notifications` when the count changes or the notifications panel opens. Listing notifications lazily synchronizes deadline reminders. Read/dismiss operations are idempotent; read-all does not restore dismissed items.

## CORS

The exact frontend origin must appear in `CORS_ORIGINS`. Origins include scheme, host, and optional port but no path, trailing slash, or wildcard. Use a stable UAT frontend origin rather than dynamic wildcard preview domains.

See [OpenAPI](openapi.json) for every request and response contract.
