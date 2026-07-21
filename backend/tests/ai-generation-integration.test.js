import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createAiService } from "../src/services/ai/ai.service.js";
import { AI_FEATURES } from "../src/services/ai/provider.js";

const userId = "11111111-1111-4111-8111-111111111111";
const opportunityId = "10000000-0000-4000-8000-000000000001";
const noRateLimit = [(_req, _res, next) => next()];
const profileRow = {
  id: userId, persona: "student", full_name: "Fictional Candidate", country_code: "KE", city: "Nairobi",
  education_level: "undergraduate", institution: "Example University", field_of_study: "Computer Science",
  graduation_year: 2027, skills: ["JavaScript"], interests: ["climate"], career_goals: "Build useful tools.",
  preferred_opportunity_types: ["fellowship"], preferred_locations: ["Nairobi"],
  remote_preference: "remote_preferred", profile_completion: 80,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};
const opportunityRow = {
  id: opportunityId, title: "Fictional Climate Fellowship", organization: "Example Foundation",
  type: "fellowship", description: "A fictional programme for automated testing.",
  requirements: ["JavaScript experience"], eligibility: { educationLevels: ["undergraduate"] },
  benefits: ["Mentorship"], country_codes: ["KE"], is_global: false, location: "Nairobi, Kenya",
  location_mode: "hybrid", deadline: "2027-01-01T00:00:00Z", application_url: "https://example.test/apply",
  canonical_url: "https://example.test/opportunity", source_name: "Example source", source_url: "https://example.test/source",
  status: "published", published_at: "2026-01-01T00:00:00Z", last_verified_at: "2026-07-19T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

const createSupabase = ({ profile = profileRow, opportunity = opportunityRow } = {}) => ({
  from: vi.fn((table) => ({
    select() { return this; },
    eq() { return this; },
    async maybeSingle() {
      if (table === "profiles") return { data: profile, error: null };
      if (table === "opportunities") return { data: opportunity, error: null };
      throw new Error(`Unexpected table: ${table}`);
    },
  })),
});

const summaryOutput = {
  overview: "A fictional climate fellowship.", eligibilityHighlights: ["Undergraduate level is listed."],
  benefits: ["Mentorship"], deadlineNotes: "The supplied deadline is January 1, 2027.", missingInformation: [],
};
const readinessOutput = {
  readinessAssessment: "The supplied profile contains relevant evidence.", strengths: ["JavaScript is listed."],
  gaps: [], nextActions: ["Review the official requirements."], readinessScore: 100,
  eligibilityAssessment: "likely", assessment: "ready",
};
const cvOutput = {
  strengths: ["Lists JavaScript."], relevantEvidence: ["Built a fictional class project."], gaps: [],
  suggestions: ["Add measurable context when truthful."], missingInformation: ["Employment dates are not supplied."],
  inputCoverage: { mode: "full", originalCharacters: 70, analyzedCharacters: 70 },
};
const createProvider = () => ({
  configured: true,
  supports: (feature) => [AI_FEATURES.SUMMARY, AI_FEATURES.READINESS, AI_FEATURES.CV].includes(feature),
  summarizeOpportunity: vi.fn().mockResolvedValue(summaryOutput),
  assessReadiness: vi.fn().mockResolvedValue(readinessOutput),
  analyzeCv: vi.fn().mockResolvedValue(cvOutput),
});
const buildApp = ({ supabase = createSupabase(), provider = createProvider() } = {}) => {
  const authenticate = (req, _res, next) => {
    if (!req.get("authorization")) return next(Object.assign(new Error("Authentication is required."), { statusCode: 401, code: "AUTHENTICATION_REQUIRED" }));
    req.auth = { user: { id: userId } };
    req.supabase = supabase;
    next();
  };
  return { app: createApp({ authenticateMiddleware: authenticate, aiService: createAiService({ provider }), aiEnabled: true, aiRateLimiters: noRateLimit }), provider, supabase };
};
const post = (app, path, body = {}) => request(app).post(path).set("Authorization", "Bearer placeholder").send(body);

describe("approved generation integration", () => {
  it("requires authentication before calling a generation provider", async () => {
    const { app, provider } = buildApp();
    const response = await request(app).post(`/api/v1/ai/opportunities/${opportunityId}/summary`).send({});
    expect(response.status).toBe(401);
    expect(provider.summarizeOpportunity).not.toHaveBeenCalled();
  });

  it("loads and maps a verified opportunity for summaries without accepting client content", async () => {
    const { app, provider, supabase } = buildApp();
    const response = await post(app, `/api/v1/ai/opportunities/${opportunityId}/summary`);
    expect(response.status).toBe(200);
    expect(response.body.meta.requestId).toBe(response.headers["x-request-id"]);
    expect(response.body.data.summary).toMatchObject({
      schemaVersion: "1.0", opportunityId, summary: summaryOutput.overview,
      missingInformation: [], disclaimer: "This summary is guidance; verify all details with the official opportunity source.",
    });
    expect(provider.summarizeOpportunity).toHaveBeenCalledWith(expect.objectContaining({
      input: { opportunity: expect.objectContaining({ title: opportunityRow.title, description: opportunityRow.description }) },
      requestId: response.headers["x-request-id"],
    }));
    expect(supabase.from).toHaveBeenCalledWith("opportunities");
    expect(JSON.stringify(provider.summarizeOpportunity.mock.calls)).not.toContain("application_url");

    const injected = await post(app, `/api/v1/ai/opportunities/${opportunityId}/summary`, { description: "client injection" });
    expect(injected.status).toBe(422);
    expect(provider.summarizeOpportunity).toHaveBeenCalledTimes(1);
  });

  it("combines deterministic readiness with explanation fields and ignores model numeric fields", async () => {
    const { app, provider } = buildApp();
    const response = await post(app, `/api/v1/ai/opportunities/${opportunityId}/readiness`);
    expect(response.status).toBe(200);
    const result = response.body.data.readiness;
    expect(result).toMatchObject({
      readinessScore: 89, assessment: "ready", eligibilityAssessment: "likely",
      explanation: readinessOutput.readinessAssessment,
      disclaimer: "This readiness assessment is guidance, not a guarantee of eligibility or selection.",
    });
    expect(Object.values(result.components).reduce((sum, item) => sum + item.earned, 0)).toBe(result.readinessScore);
    expect(provider.assessReadiness).toHaveBeenCalledTimes(1);
  });

  it("returns PROFILE_REQUIRED before generation when no usable profile exists", async () => {
    const provider = createProvider();
    const { app } = buildApp({ supabase: createSupabase({ profile: null }), provider });
    const response = await post(app, `/api/v1/ai/opportunities/${opportunityId}/readiness`);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("PROFILE_REQUIRED");
    expect(provider.assessReadiness).not.toHaveBeenCalled();
  });

  it("supports general CV analysis without claiming opportunity relevance", async () => {
    const provider = createProvider();
    const supabase = createSupabase();
    const { app } = buildApp({ supabase, provider });
    const response = await post(app, "/api/v1/ai/cv-analysis", { cvText: "Fictional candidate built a class project using JavaScript." });
    expect(response.status).toBe(200);
    expect(response.body.data.analysis).toMatchObject({ analysisScope: "general", opportunityId: null });
    expect(provider.analyzeCv.mock.calls[0][0].input).toEqual({ cvText: "Fictional candidate built a class project using JavaScript." });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("supports opportunity-specific CV relevance using only the server-loaded opportunity", async () => {
    const { app, provider, supabase } = buildApp();
    const response = await post(app, "/api/v1/ai/cv-analysis", {
      cvText: "Fictional candidate built a class project using JavaScript.", opportunityId,
    });
    expect(response.status).toBe(200);
    expect(response.body.data.analysis).toMatchObject({ analysisScope: "opportunity_specific", opportunityId });
    expect(provider.analyzeCv.mock.calls[0][0].input.opportunity).toMatchObject({ opportunityId, title: opportunityRow.title });
    expect(supabase.from).toHaveBeenCalledWith("opportunities");
  });

  it.each([
    [{ cvText: "Fictional CV", opportunityId: "not-a-uuid" }],
    [{ cvText: "Fictional CV", rawOpportunity: { title: "Injected" } }],
    [{ cvText: "Fictional CV", userId }],
  ])("strictly rejects invalid or injected CV fields", async (body) => {
    const { app, provider } = buildApp();
    const response = await post(app, "/api/v1/ai/cv-analysis", body);
    expect(response.status).toBe(422);
    expect(provider.analyzeCv).not.toHaveBeenCalled();
  });

  it("never exposes or persists fictional CV content when upstream fails", async () => {
    const provider = createProvider();
    provider.analyzeCv.mockRejectedValue(Object.assign(new Error("fictional sensitive CV text"), { code: "AI_SERVICE_UNAVAILABLE", statusCode: 503, expose: true }));
    const supabase = createSupabase();
    const { app } = buildApp({ provider, supabase });
    const response = await post(app, "/api/v1/ai/cv-analysis", { cvText: "fictional sensitive CV text" });
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("fictional sensitive CV text");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
