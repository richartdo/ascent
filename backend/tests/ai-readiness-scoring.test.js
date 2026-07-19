import { describe, expect, it } from "vitest";

import { calculateReadiness } from "../src/services/ai/readinessScoring.js";

const profile = (overrides = {}) => ({
  profileCompletion: 80,
  countryCode: "KE",
  educationLevel: "undergraduate",
  preferredOpportunityTypes: ["fellowship"],
  preferredLocations: ["Nairobi"],
  remotePreference: "remote_preferred",
  skills: ["JavaScript"],
  ...overrides,
});
const opportunity = (overrides = {}) => ({
  type: "fellowship",
  deadline: "2027-01-01T00:00:00.000Z",
  isGlobal: false,
  countryCodes: ["KE"],
  location: "Nairobi, Kenya",
  locationMode: "hybrid",
  requirements: ["JavaScript experience"],
  eligibility: {},
  ...overrides,
});
const now = new Date("2026-07-19T00:00:00.000Z");

describe("deterministic readiness scoring", () => {
  it("returns transparent components whose earned points sum exactly to the score", () => {
    const result = calculateReadiness({ profile: profile(), opportunity: opportunity(), now });
    expect(result.components).toEqual({
      profileCompleteness: { earned: 24, maximum: 30 },
      eligibilityCompatibility: { earned: 25, maximum: 30 },
      preferenceFit: { earned: 20, maximum: 20 },
      skillEvidence: { earned: 15, maximum: 20 },
    });
    expect(result.readinessScore).toBe(84);
    expect(Object.values(result.components).reduce((sum, item) => sum + item.earned, 0)).toBe(84);
    expect(result.eligibilityAssessment).toBe("uncertain");
    expect(result.missingInformation).toContain("Explicit education eligibility information is incomplete.");
  });

  it("awards exactly half credit for each unknown country or education check", () => {
    const result = calculateReadiness({
      profile: profile({ countryCode: null }),
      opportunity: opportunity({ countryCodes: [], requirements: [] }),
      now,
    });
    expect(result.components.eligibilityCompatibility).toEqual({ earned: 20, maximum: 30 });
    expect(result.components.skillEvidence).toEqual({ earned: 10, maximum: 20 });
    expect(result.eligibilityAssessment).toBe("uncertain");
  });

  it("separates hard incompatibility, caps the score below ready, and preserves the sum", () => {
    const result = calculateReadiness({
      profile: profile({ profileCompletion: 100, skills: ["JavaScript", "Python"] }),
      opportunity: opportunity({
        requirements: ["JavaScript and Python experience"],
        eligibility: { educationLevels: ["postgraduate"] },
      }),
      now,
    });
    expect(result.eligibilityAssessment).toBe("unlikely");
    expect(result.readinessScore).toBe(74);
    expect(result.assessment).toBe("needs_preparation");
    expect(Object.values(result.components).reduce((sum, item) => sum + item.earned, 0)).toBe(74);
    expect(result.hardIncompatibilities).toHaveLength(1);
  });

  it.each([-1, 101, 20.5, null])("rejects invalid database profile completion: %s", (profileCompletion) => {
    expect(() => calculateReadiness({ profile: profile({ profileCompletion }), opportunity: opportunity(), now }))
      .toThrow(expect.objectContaining({ code: "PROFILE_DATA_INVALID" }));
  });
});
