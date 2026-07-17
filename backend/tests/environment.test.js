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
});
