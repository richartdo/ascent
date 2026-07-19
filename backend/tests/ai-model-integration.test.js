import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createAiService } from "../src/services/ai/ai.service.js";
import { AI_FEATURES } from "../src/services/ai/provider.js";

const userId = "11111111-1111-4111-8111-111111111111";
const noRateLimit = [(_req, _res, next) => next()];
const profileRow = {
  id: userId, persona: "student", full_name: "Private Person", country_code: "KE", city: "Nairobi",
  education_level: "undergraduate", institution: null, field_of_study: "Computer Science",
  graduation_year: 2027, skills: ["JavaScript"], interests: ["climate"], career_goals: null,
  preferred_opportunity_types: ["fellowship"], preferred_locations: ["Nairobi"],
  remote_preference: "remote_preferred", profile_completion: 80, created_at: "2026-01-01", updated_at: "2026-01-01",
};
const opportunity = (id, overrides = {}) => ({
  id, title: "Climate Fellowship", organization: "Verified Foundation", type: "fellowship",
  description: "Build climate tools", requirements: ["JavaScript experience"], eligibility: {},
  country_codes: ["KE"], is_global: false, location: "Nairobi, Kenya", location_mode: "hybrid",
  deadline: "2027-01-01T00:00:00Z", status: "published", ...overrides,
});

const createSupabase = ({ profile = profileRow, opportunities = [] } = {}) => ({
  from: vi.fn((table) => {
    if (table === "profiles") return {
      select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: profile, error: null }; },
    };
    if (table === "opportunities") return {
      select() { return this; }, eq() { return this; }, or() { return this; },
      then(resolve) { return Promise.resolve({ data: opportunities, error: null }).then(resolve); },
    };
    throw new Error(`Unexpected table ${table}`);
  }),
});
const modelResult = (score) => ({
  matchScore: score, predictedMatch: score >= 50, probability: score / 100,
  modelVersion: "1.0.0", syntheticBaseline: true,
  disclaimer: "This score is guidance, not a guarantee of eligibility or selection.",
});
const createProvider = (implementation = vi.fn().mockResolvedValue(modelResult(80))) => ({
  configured: true,
  supports: (feature) => feature === AI_FEATURES.MATCHING,
  matchOpportunity: implementation,
});
const buildApp = ({ supabase, provider, maxCandidates = 20, concurrency = 4 } = {}) => {
  const authenticate = (req, _res, next) => {
    if (!req.get("authorization")) return next(Object.assign(new Error("Authentication is required."), { statusCode: 401, code: "AUTHENTICATION_REQUIRED" }));
    req.auth = { user: { id: userId } };
    req.supabase = supabase;
    next();
  };
  return createApp({
    authenticateMiddleware: authenticate,
    aiService: createAiService({ provider, maxCandidates, concurrency }),
    aiEnabled: true,
    aiRateLimiters: noRateLimit,
  });
};

describe("custom model matching endpoint", () => {
  it("returns PROFILE_REQUIRED with a useful country gap", async () => {
    const response = await request(buildApp({
      supabase: createSupabase({ profile: { ...profileRow, country_code: null } }),
      provider: createProvider(),
    })).post("/api/v1/ai/opportunity-matches").set("Authorization", "Bearer placeholder").send({ limit: 10 });
    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: "PROFILE_REQUIRED",
      details: { profileGaps: ["countryCode"] },
    });
  });

  it("loads server-owned context and returns validated deterministic results", async () => {
    const supabase = createSupabase({ opportunities: [opportunity("10000000-0000-4000-8000-000000000001")] });
    const matchOpportunity = vi.fn().mockResolvedValue(modelResult(84));
    const response = await request(buildApp({ supabase, provider: createProvider(matchOpportunity) }))
      .post("/api/v1/ai/opportunity-matches").set("Authorization", "Bearer placeholder").send({ limit: 10 });
    expect(response.status).toBe(200);
    expect(response.body.meta.requestId).toBe(response.headers["x-request-id"]);
    expect(response.body.data.matches[0]).toMatchObject({
      schemaVersion: "1.0", opportunityId: "10000000-0000-4000-8000-000000000001",
      matchScore: 84, disclaimer: "This assessment is guidance, not an eligibility guarantee.",
    });
    expect(response.body.data.matches[0]).not.toHaveProperty("probability");
    expect(matchOpportunity).toHaveBeenCalledWith(expect.objectContaining({ requestId: response.headers["x-request-id"] }));
    expect(supabase.from.mock.calls.map(([table]) => table)).toEqual(["profiles", "opportunities"]);
  });

  it("never sends inactive, explicitly incompatible, or model-unsupported candidates", async () => {
    const records = [
      opportunity("10000000-0000-4000-8000-000000000001", { status: "archived" }),
      opportunity("10000000-0000-4000-8000-000000000002", { deadline: "2025-01-01T00:00:00Z" }),
      opportunity("10000000-0000-4000-8000-000000000003", { country_codes: ["UG"] }),
      opportunity("10000000-0000-4000-8000-000000000004", { eligibility: { educationLevels: ["postgraduate"] } }),
      opportunity("10000000-0000-4000-8000-000000000005", { type: "job" }),
      opportunity("10000000-0000-4000-8000-000000000006", { location_mode: "unspecified" }),
    ];
    const matchOpportunity = vi.fn();
    const response = await request(buildApp({ supabase: createSupabase({ opportunities: records }), provider: createProvider(matchOpportunity) }))
      .post("/api/v1/ai/opportunity-matches").set("Authorization", "Bearer placeholder").send({ limit: 20 });
    expect(response.status).toBe(200);
    expect(response.body.data.matches).toEqual([]);
    expect(matchOpportunity).not.toHaveBeenCalled();
  });

  it("orders deterministically before candidate truncation", async () => {
    const weak = opportunity("10000000-0000-4000-8000-000000000002", { requirements: [], description: "General", location: "Mombasa" });
    const strong = opportunity("10000000-0000-4000-8000-000000000001");
    const matchOpportunity = vi.fn().mockResolvedValue(modelResult(70));
    const response = await request(buildApp({
      supabase: createSupabase({ opportunities: [weak, strong] }), provider: createProvider(matchOpportunity), maxCandidates: 1,
    })).post("/api/v1/ai/opportunity-matches").set("Authorization", "Bearer placeholder").send({ limit: 20 });
    expect(response.status).toBe(200);
    expect(response.body.data.matches.map(({ opportunityId }) => opportunityId)).toEqual([strong.id]);
    expect(matchOpportunity).toHaveBeenCalledTimes(1);
  });

  it("uses bounded concurrency and stable final score ordering", async () => {
    let active = 0;
    let maximumActive = 0;
    const matchOpportunity = vi.fn(async ({ features }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return modelResult(features.combinedText.includes("Organization 3") ? 90 : 70);
    });
    const records = [1, 2, 3].map((value) => opportunity(
      `10000000-0000-4000-8000-00000000000${value}`,
      { organization: `Organization ${value}` },
    ));
    const response = await request(buildApp({
      supabase: createSupabase({ opportunities: records }), provider: createProvider(matchOpportunity), concurrency: 2,
    })).post("/api/v1/ai/opportunity-matches").set("Authorization", "Bearer placeholder").send({ limit: 20 });
    expect(response.status).toBe(200);
    expect(maximumActive).toBeLessThanOrEqual(2);
    expect(response.body.data.matches[0].opportunityId).toBe(records[2].id);
    expect(matchOpportunity).toHaveBeenCalledTimes(3);
  });

  it("returns one sanitized failure and no partial ranking", async () => {
    const matchOpportunity = vi.fn().mockRejectedValue(new Error("private opportunity text"));
    const response = await request(buildApp({
      supabase: createSupabase({ opportunities: [
        opportunity("10000000-0000-4000-8000-000000000001"),
        opportunity("10000000-0000-4000-8000-000000000002"),
      ] }), provider: createProvider(matchOpportunity), concurrency: 1,
    })).post("/api/v1/ai/opportunity-matches").set("Authorization", "Bearer placeholder").send({ limit: 20 });
    expect(response.status).toBe(503);
    expect(response.body).not.toHaveProperty("data");
    expect(response.body.error).toMatchObject({ code: "AI_SERVICE_UNAVAILABLE", message: "The AI service is temporarily unavailable." });
    expect(JSON.stringify(response.body)).not.toMatch(/private opportunity text/);
    expect(matchOpportunity).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["/api/v1/ai/opportunities/10000000-0000-4000-8000-000000000001/summary", {}],
    ["/api/v1/ai/opportunities/10000000-0000-4000-8000-000000000001/readiness", {}],
    ["/api/v1/ai/cv-analysis", { cvText: "CV placeholder" }],
    ["/api/v1/ai/opportunities/10000000-0000-4000-8000-000000000001/cover-letter", { tone: "professional" }],
    ["/api/v1/ai/essay-assistance", { mode: "outline", prompt: "Outline placeholder" }],
  ])("keeps non-matching custom-provider endpoint disabled: %s", async (path, body) => {
    const provider = createProvider();
    const response = await request(buildApp({ supabase: createSupabase(), provider }))
      .post(path).set("Authorization", "Bearer placeholder").send(body);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AI_NOT_CONFIGURED");
    expect(provider.matchOpportunity).not.toHaveBeenCalled();
  });
});
