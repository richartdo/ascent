import { describe, expect, it } from "vitest";

import { parseEnvironment } from "../src/config/env.js";

const base = {
  NODE_ENV: "development",
  CORS_ORIGINS: "http://localhost:3000",
  AI_ENABLED: "false",
};

describe("environment hardening", () => {
  it("trims values and parses an exact comma-separated CORS allowlist", () => {
    const parsed = parseEnvironment({
      ...base,
      PORT: " 5001 ",
      CORS_ORIGINS: " https://app.example.com, http://localhost:3000 ",
      SUPABASE_URL: " https://example.supabase.co ",
      SUPABASE_PUBLISHABLE_KEY: " publishable-placeholder ",
      VERCEL: "1",
    });

    expect(parsed.PORT).toBe(5001);
    expect(parsed.CORS_ORIGINS).toEqual(["https://app.example.com", "http://localhost:3000"]);
    expect(parsed.SUPABASE_URL).toBe("https://example.supabase.co");
    expect(parsed.SUPABASE_PUBLISHABLE_KEY).toBe("publishable-placeholder");
    expect(parsed.VERCEL).toBe(true);
  });

  it.each([
    { PORT: "0" },
    { PORT: "not-a-number" },
    { AI_TEXT_MAX_LENGTH: "0" },
    { JSON_BODY_LIMIT: "unlimited" },
    { CORS_ORIGINS: "https://app.example.com/path" },
    { CORS_ORIGINS: "https://app.example.com/" },
    { CORS_ORIGINS: "*" },
  ])("rejects malformed limits and origins", (override) => {
    expect(() => parseEnvironment({ ...base, ...override })).toThrow("Invalid environment configuration for:");
  });

  it("requires Supabase configuration in production without requiring OpenAI", () => {
    expect(() => parseEnvironment({ ...base, NODE_ENV: "production" })).toThrow(/SUPABASE_URL/);
    const parsed = parseEnvironment({
      ...base,
      NODE_ENV: "production",
      CORS_ORIGINS: "https://app.example.com",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "publishable-placeholder",
      AI_ENABLED: "false",
      OPENAI_API_KEY: "",
    });
    expect(parsed.OPENAI_API_KEY).toBe("");
  });

  it("never includes submitted values in validation errors", () => {
    const secretLikeValue = "https://secret.example.com/private-path";
    expect(() => parseEnvironment({ ...base, CORS_ORIGINS: secretLikeValue }))
      .toThrow(expect.not.stringContaining(secretLikeValue));
  });

  it("parses the custom matching provider without requiring OpenAI or a development key", () => {
    const parsed = parseEnvironment({
      ...base,
      AI_ENABLED: "true",
      AI_PROVIDER: "custom",
      MODEL_SERVICE_URL: "http://127.0.0.1:8000",
      MODEL_SERVICE_API_KEY: "",
      OPENAI_API_KEY: "",
    });
    expect(parsed).toMatchObject({
      AI_ENABLED: true,
      AI_PROVIDER: "custom",
      AI_FEATURES: ["opportunity_matching"],
      MODEL_SERVICE_TIMEOUT_MS: 3000,
      GENERATION_SERVICE_TIMEOUT_MS: 75000,
      MODEL_SERVICE_MAX_CANDIDATES: 20,
      MODEL_SERVICE_CONCURRENCY: 4,
      OPENAI_API_KEY: "",
    });
  });

  it("validates, trims and deduplicates the approved AI feature allowlist", () => {
    const parsed = parseEnvironment({
      ...base,
      AI_FEATURES: "opportunity_matching, readiness,readiness,cv_analysis",
    });
    expect(parsed.AI_FEATURES).toEqual(["opportunity_matching", "readiness", "cv_analysis"]);
    for (const AI_FEATURES of ["cover_letter", "essay_assistance", "unknown", ""]) {
      expect(() => parseEnvironment({ ...base, AI_FEATURES })).toThrow(/AI_FEATURES/);
    }
  });

  it.each([
    { MODEL_SERVICE_URL: "" },
    { MODEL_SERVICE_URL: "http://example.com:8000" },
    { MODEL_SERVICE_URL: "https://user:secret@example.com" },
    { MODEL_SERVICE_URL: "https://example.com/path" },
    { MODEL_SERVICE_URL: "https://example.com?secret=value" },
    { MODEL_SERVICE_URL: "https://example.com#fragment" },
    { MODEL_SERVICE_TIMEOUT_MS: "499" },
    { MODEL_SERVICE_TIMEOUT_MS: "10001" },
    { GENERATION_SERVICE_TIMEOUT_MS: "9999" },
    { GENERATION_SERVICE_TIMEOUT_MS: "120001" },
    { MODEL_SERVICE_MAX_CANDIDATES: "0" },
    { MODEL_SERVICE_MAX_CANDIDATES: "21" },
    { MODEL_SERVICE_CONCURRENCY: "0" },
    { MODEL_SERVICE_CONCURRENCY: "6" },
  ])("rejects invalid custom-provider settings without exposing values", (override) => {
    const secret = "submitted-secret-value";
    expect(() => parseEnvironment({
      ...base, AI_ENABLED: "true", AI_PROVIDER: "custom", MODEL_SERVICE_API_KEY: secret, ...override,
    })).toThrow(expect.not.stringContaining(secret));
  });

  it("requires an internal key for production custom matching", () => {
    const production = {
      ...base,
      NODE_ENV: "production",
      CORS_ORIGINS: "https://app.example.com",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "publishable-placeholder",
      AI_ENABLED: "true",
      AI_PROVIDER: "custom",
      MODEL_SERVICE_URL: "https://model.internal.example.com",
      MODEL_SERVICE_API_KEY: "",
      OPENAI_API_KEY: "",
    };
    expect(() => parseEnvironment(production)).toThrow(/MODEL_SERVICE_API_KEY/);
    expect(parseEnvironment({ ...production, MODEL_SERVICE_API_KEY: "internal-placeholder" }).OPENAI_API_KEY).toBe("");
  });
});
