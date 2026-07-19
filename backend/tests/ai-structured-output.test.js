import { describe, expect, it, vi } from "vitest";

import {
  MATCH_DISCLAIMER,
  matchingResultSchema,
  opportunitySummaryResultSchema,
} from "../src/schemas/ai.schema.js";
import { createAiService } from "../src/services/ai/ai.service.js";
import { normalizeAiProviderError } from "../src/services/ai/errors.js";
import { parseStructuredOutput } from "../src/services/ai/structuredOutput.js";
import { AI_FEATURES } from "../src/services/ai/provider.js";

const matchingFixture = {
  schemaVersion: "1.0",
  opportunityId: "10000000-0000-4000-8000-000000000001",
  matchScore: 84,
  eligibilityAssessment: "likely",
  reasons: [],
  matchedCriteria: [],
  gaps: [],
  disclaimer: MATCH_DISCLAIMER,
};

describe("AI structured-output contracts", () => {
  it("accepts the approved matching result contract", () => {
    expect(matchingResultSchema.parse(matchingFixture)).toEqual(matchingFixture);
  });

  it("rejects unknown fields, unbounded values and altered disclaimers", () => {
    expect(matchingResultSchema.safeParse({ ...matchingFixture, confidence: 0.84 }).success).toBe(false);
    expect(matchingResultSchema.safeParse({ ...matchingFixture, reasons: Array(11).fill("reason") }).success).toBe(false);
    expect(matchingResultSchema.safeParse({ ...matchingFixture, disclaimer: "Guaranteed selection." }).success).toBe(false);
    expect(matchingResultSchema.safeParse({ ...matchingFixture, reasons: ["You will be accepted."] }).success).toBe(false);
    expect(opportunitySummaryResultSchema.safeParse({ schemaVersion: "1.0" }).success).toBe(false);
  });

  it("separates refusals from malformed model output", () => {
    expect(parseStructuredOutput({
      output: { type: "refusal", refusal: "I cannot assist with that request." },
      schema: matchingResultSchema,
    })).toEqual({ kind: "refusal", reason: "I cannot assist with that request." });

    expect(() => parseStructuredOutput({ output: { malformed: true }, schema: matchingResultSchema }))
      .toThrow(expect.objectContaining({ code: "AI_INVALID_RESPONSE", statusCode: 502 }));
  });

  it("normalizes timeout and unavailable errors without exposing provider details", () => {
    const timeout = normalizeAiProviderError(Object.assign(new Error("CV contents"), { code: "ETIMEDOUT" }));
    const unavailable = normalizeAiProviderError(new Error("Essay draft and provider internals"));

    expect(timeout).toMatchObject({ code: "AI_TIMEOUT", statusCode: 504, message: "The AI service timed out." });
    expect(unavailable).toMatchObject({
      code: "AI_SERVICE_UNAVAILABLE",
      statusCode: 503,
      message: "The AI service is temporarily unavailable.",
    });
    expect(`${timeout.message} ${unavailable.message}`).not.toMatch(/CV contents|Essay draft|provider internals/);
  });

  it("does not log sensitive text when a provider fails", async () => {
    const sensitive = "private-cv-text@example.com";
    const provider = {
      configured: true,
      supports: (feature) => feature === AI_FEATURES.CV,
      analyzeCv: vi.fn().mockRejectedValue(new Error(sensitive)),
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = createAiService({ provider });

    await expect(service.analyzeCv({ cvText: sensitive, requestId: "11111111-1111-4111-8111-111111111111" })).rejects.toMatchObject({
      code: "AI_SERVICE_UNAVAILABLE",
      message: "The AI service is temporarily unavailable.",
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
