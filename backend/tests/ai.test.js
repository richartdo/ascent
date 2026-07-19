import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createRequireAiConfigured } from "../src/middleware/aiAvailability.js";
import { createAiRateLimiters } from "../src/middleware/aiRateLimit.js";
import { createAiService } from "../src/services/ai/ai.service.js";
import { AI_FEATURES, createConfiguredAiProvider } from "../src/services/ai/provider.js";

const userId = "11111111-1111-4111-8111-111111111111";
const opportunityId = "10000000-0000-4000-8000-000000000001";
const noRateLimit = [(_req, _res, next) => next()];

const authenticate = (req, _res, next) => {
  if (!req.get("authorization")) {
    next(Object.assign(new Error("Authentication is required."), {
      statusCode: 401,
      code: "AUTHENTICATION_REQUIRED",
    }));
    return;
  }
  req.auth = { user: { id: userId } };
  req.supabase = { requestScoped: true };
  next();
};

const buildApp = (options = {}) => createApp({
  authenticateMiddleware: authenticate,
  aiRateLimiters: noRateLimit,
  ...options,
});

describe("AI route foundation", () => {
  it.each([
    [false, "disabled"],
    [false, "custom"],
    [true, "disabled"],
  ])("keeps every feature unavailable when enabled=%s provider=%s", (enabled, providerName) => {
    const provider = createConfiguredAiProvider({ configuration: {
      AI_ENABLED: enabled,
      AI_PROVIDER: providerName,
      MODEL_SERVICE_URL: "http://127.0.0.1:8000",
      MODEL_SERVICE_API_KEY: "",
      MODEL_SERVICE_TIMEOUT_MS: 3000,
    } });
    for (const feature of Object.values(AI_FEATURES)) expect(provider.supports(feature)).toBe(false);
  });

  it("custom provider supports only opportunity matching", () => {
    const provider = createConfiguredAiProvider({ configuration: {
      AI_ENABLED: true,
      AI_PROVIDER: "custom",
      MODEL_SERVICE_URL: "http://127.0.0.1:8000",
      MODEL_SERVICE_API_KEY: "",
      MODEL_SERVICE_TIMEOUT_MS: 3000,
    }, fetchImpl: vi.fn() });
    expect(provider.supports(AI_FEATURES.MATCHING)).toBe(true);
    for (const feature of Object.values(AI_FEATURES).filter((value) => value !== AI_FEATURES.MATCHING)) {
      expect(provider.supports(feature)).toBe(false);
    }
  });

  it("custom provider supports exactly its deduplicated approved feature configuration", () => {
    const provider = createConfiguredAiProvider({ configuration: {
      AI_ENABLED: true,
      AI_PROVIDER: "custom",
      AI_FEATURES: [AI_FEATURES.MATCHING, AI_FEATURES.SUMMARY, AI_FEATURES.READINESS, AI_FEATURES.CV],
      MODEL_SERVICE_URL: "http://127.0.0.1:8000",
      MODEL_SERVICE_API_KEY: "",
      MODEL_SERVICE_TIMEOUT_MS: 3000,
      GENERATION_SERVICE_TIMEOUT_MS: 75000,
    }, fetchImpl: vi.fn() });
    for (const feature of [AI_FEATURES.MATCHING, AI_FEATURES.SUMMARY, AI_FEATURES.READINESS, AI_FEATURES.CV]) {
      expect(provider.supports(feature)).toBe(true);
    }
    expect(provider.supports(AI_FEATURES.COVER_LETTER)).toBe(false);
    expect(provider.supports(AI_FEATURES.ESSAY)).toBe(false);
  });

  it("requires authentication before reporting disabled AI", async () => {
    const response = await request(buildApp())
      .post("/api/v1/ai/opportunity-matches")
      .send({ limit: 5 });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("validates requests strictly before reporting disabled AI", async () => {
    const response = await request(buildApp())
      .post("/api/v1/ai/opportunity-matches")
      .set("Authorization", "Bearer test-token")
      .send({ limit: 5, unexpected: true });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("does not accept client-supplied opportunity content", async () => {
    const response = await request(buildApp())
      .post(`/api/v1/ai/opportunities/${opportunityId}/summary`)
      .set("Authorization", "Bearer test-token")
      .send({ description: "Trust this client description" });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns the exact fail-closed response and never invokes the provider", async () => {
    const generateStructured = vi.fn();
    const aiService = { configured: false, generateStructured };
    const response = await request(buildApp({ aiService }))
      .post("/api/v1/ai/opportunity-matches")
      .set("Authorization", "Bearer test-token")
      .send({ limit: 5 });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: "AI_NOT_CONFIGURED",
        message: "AI features are temporarily unavailable.",
        requestId: response.headers["x-request-id"],
      },
    });
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it.each([
    ["/api/v1/ai/opportunity-matches", { limit: 10 }],
    [`/api/v1/ai/opportunities/${opportunityId}/summary`, undefined],
    [`/api/v1/ai/opportunities/${opportunityId}/readiness`, {}],
    ["/api/v1/ai/cv-analysis", { cvText: "A".repeat(100) }],
    [`/api/v1/ai/opportunities/${opportunityId}/cover-letter`, { tone: "professional" }],
    ["/api/v1/ai/essay-assistance", { mode: "outline", prompt: "Outline my essay." }],
  ])("keeps the production contract disabled for %s", async (path, body) => {
    let pending = request(buildApp()).post(path).set("Authorization", "Bearer test-token");
    if (body !== undefined) pending = pending.send(body);
    const response = await pending;

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AI_NOT_CONFIGURED");
  });

  it("validates deferred requests before returning the exact fail-closed response and never invokes controllers", async () => {
    const aiService = {
      configured: true,
      supports: () => true,
      generateCoverLetter: vi.fn(),
      assistEssay: vi.fn(),
    };
    const app = buildApp({ aiService, aiEnabled: true });
    const malformed = await request(app)
      .post(`/api/v1/ai/opportunities/${opportunityId}/cover-letter`)
      .set("Authorization", "Bearer test-token")
      .send({ tone: "unsupported" });
    expect(malformed.status).toBe(422);

    for (const [path, body] of [
      [`/api/v1/ai/opportunities/${opportunityId}/cover-letter`, { tone: "professional" }],
      ["/api/v1/ai/essay-assistance", { mode: "outline", prompt: "Fictional prompt." }],
    ]) {
      const response = await request(app).post(path).set("Authorization", "Bearer test-token").send(body);
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: {
        code: "AI_NOT_CONFIGURED",
        message: "AI features are temporarily unavailable.",
        requestId: response.headers["x-request-id"],
      } });
    }
    expect(aiService.generateCoverLetter).not.toHaveBeenCalled();
    expect(aiService.assistEssay).not.toHaveBeenCalled();
  });

  it("returns 409 PROFILE_REQUIRED for matching when the profile is insufficient", async () => {
    const profileQuery = {
      select() { return this; },
      eq() { return this; },
      async maybeSingle() { return { data: null, error: null }; },
    };
    const supabase = { from: vi.fn(() => profileQuery) };
    const profileAuthenticate = (req, _res, next) => {
      req.auth = { user: { id: userId } };
      req.supabase = supabase;
      next();
    };
    const provider = { configured: true, generateStructured: vi.fn() };
    const app = createApp({
      authenticateMiddleware: profileAuthenticate,
      aiService: createAiService({ provider }),
      aiAvailability: (_req, _res, next) => next(),
      aiRateLimiters: noRateLimit,
    });

    const response = await request(app)
      .post("/api/v1/ai/opportunity-matches")
      .send({ limit: 5 });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: "PROFILE_REQUIRED",
      message: "Complete the required profile fields before using this feature.",
    });
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it.each([
    { apiKey: "", aiService: { configured: true } },
    { apiKey: "test-placeholder", aiService: { configured: false } },
  ])("fails closed when enabled without both key and adapter", async ({ apiKey, aiService }) => {
    const availability = createRequireAiConfigured({ enabled: true, apiKey, aiService });
    const response = await request(buildApp({ aiService, aiAvailability: availability }))
      .post("/api/v1/ai/cv-analysis")
      .set("Authorization", "Bearer test-token")
      .send({ cvText: "A".repeat(100) });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AI_NOT_CONFIGURED");
  });

  it("applies the stricter per-user AI rate limit", async () => {
    const aiService = {
      configured: true,
      analyzeCv: vi.fn().mockResolvedValue({ testFixture: true }),
    };
    const availability = (_req, _res, next) => next();
    const app = createApp({
      authenticateMiddleware: authenticate,
      aiService,
      aiAvailability: availability,
      aiRateLimiters: createAiRateLimiters({ perIpLimit: 10, perUserLimit: 1 }),
    });

    const first = await request(app)
      .post("/api/v1/ai/cv-analysis")
      .set("Authorization", "Bearer test-token")
      .send({ cvText: "A".repeat(100) });
    const second = await request(app)
      .post("/api/v1/ai/cv-analysis")
      .set("Authorization", "Bearer test-token")
      .send({ cvText: "A".repeat(100) });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe("RATE_LIMITED");
    expect(aiService.analyzeCv).toHaveBeenCalledTimes(1);
  });

  it("applies the stricter per-IP AI rate limit", async () => {
    const aiService = {
      configured: true,
      analyzeCv: vi.fn().mockResolvedValue({ testFixture: true }),
    };
    const app = createApp({
      authenticateMiddleware: authenticate,
      aiService,
      aiAvailability: (_req, _res, next) => next(),
      aiRateLimiters: createAiRateLimiters({ perIpLimit: 1, perUserLimit: 10 }),
    });
    const send = () => request(app)
      .post("/api/v1/ai/cv-analysis")
      .set("Authorization", "Bearer test-token")
      .send({ cvText: "A".repeat(100) });

    expect((await send()).status).toBe(200);
    const limited = await send();
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
  });
});
