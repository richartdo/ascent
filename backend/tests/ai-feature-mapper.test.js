import { describe, expect, it } from "vitest";

import { MODEL_SERVICE_FEATURES } from "../src/services/ai/modelService.schema.js";
import { buildDeterministicMatch, mapOpportunityFeatures, mapProfileEducation } from "../src/services/ai/opportunityFeatureMapper.js";
import { prefilterOpportunities } from "../src/services/ai/opportunityPrefilter.js";
import { requireUsableMatchingProfile } from "../src/services/ai/profileReadiness.js";

const now = new Date("2026-07-19T00:00:00Z");
const profile = {
  fullName: "Private Person", countryCode: "KE", educationLevel: "undergraduate",
  graduationYear: 2027, fieldOfStudy: "Computer Science", skills: [" JavaScript ", "javascript", "Data"],
  interests: ["Climate"], preferredOpportunityTypes: ["fellowship"], preferredLocations: ["Nairobi"],
  remotePreference: "remote_preferred", persona: "student",
};
const opportunity = {
  id: "10000000-0000-4000-8000-000000000001", title: "Climate Fellowship",
  organization: "Verified Foundation", type: "fellowship", description: "Contact apply@example.com for details.",
  requirements: ["JavaScript experience", "Call +254 700 000 000"], eligibility: {}, countryCodes: ["KE"],
  isGlobal: false, location: "Nairobi, Kenya", locationMode: "hybrid", deadline: "2026-12-01T00:00:00Z", status: "published",
};

const candidate = () => prefilterOpportunities({ profile, opportunities: [opportunity], now, limit: 20 })[0];

describe("education mapping", () => {
  it.each([
    [{ educationLevel: "secondary", graduationYear: 2027 }, "secondary_in_progress"],
    [{ educationLevel: "secondary" }, "secondary_completed"],
    [{ educationLevel: "undergraduate", graduationYear: 2026 }, "bachelors_completed"],
    [{ educationLevel: "undergraduate" }, "bachelors_in_progress"],
    [{ educationLevel: "graduate" }, "bachelors_completed"],
    [{ educationLevel: "postgraduate", graduationYear: 2025 }, "masters_completed"],
    [{ educationLevel: "postgraduate" }, "masters_in_progress"],
    [{ educationLevel: "other", graduationYear: 2027 }, null],
  ])("maps %o deterministically", (value, expected) => {
    expect(mapProfileEducation(value, now)).toBe(expected);
  });

  it("ignores invalid graduation years and uses documented fallbacks", () => {
    expect(mapProfileEducation({ educationLevel: "undergraduate", graduationYear: 1900 }, now)).toBe("bachelors_in_progress");
  });
});

describe("model feature mapping", () => {
  it("produces exactly eleven ordered fields and conservative skill values", () => {
    const mapped = mapOpportunityFeatures({ profile, candidate: candidate(), now });
    expect(Object.keys(mapped)).toEqual(MODEL_SERVICE_FEATURES);
    expect(mapped).toMatchObject({
      profileCountry: "KE", education: "bachelors_in_progress", opportunityType: "fellowship",
      locationMode: "hybrid", countryEligible: true, educationCompatible: true,
      typePreferred: true, skillOverlapCount: 1, missingRequiredSkillCount: 0,
    });
  });

  it("uses stable text order, normalizes whitespace, and excludes or redacts PII", () => {
    const text = mapOpportunityFeatures({ profile, candidate: candidate(), now }).combinedText;
    expect(text.indexOf("Profile skills:")).toBeLessThan(text.indexOf("Opportunity title:"));
    expect(text).not.toMatch(/Private Person|apply@example\.com|\+254 700 000 000/);
    expect(text).toMatch(/\[redacted-email\]|\[redacted-phone\]/);
    expect(text.length).toBeLessThanOrEqual(20_000);
  });

  it("does not turn unsupported model categories into ineligibility claims", () => {
    expect(prefilterOpportunities({ profile, opportunities: [
      { ...opportunity, type: "job" },
      { ...opportunity, id: "10000000-0000-4000-8000-000000000002", locationMode: "unspecified" },
    ], now })).toEqual([]);
  });

  it("requires country and mappable education with useful profile gaps", () => {
    expect(() => requireUsableMatchingProfile({ ...profile, countryCode: null, educationLevel: "other" }, now))
      .toThrow(expect.objectContaining({
        code: "PROFILE_REQUIRED", details: { profileGaps: ["countryCode", "educationLevel"] },
      }));
  });

  it("builds explanations from deterministic facts without exposing raw probability", () => {
    const selected = candidate();
    const features = mapOpportunityFeatures({ profile, candidate: selected, now });
    const result = buildDeterministicMatch({ candidate: selected, features, modelResult: { matchScore: 73, probability: 0.73, predictedMatch: true } });
    expect(result.matchScore).toBe(73);
    expect(result).not.toHaveProperty("probability");
    expect(result).not.toHaveProperty("predictedMatch");
    expect(result.gaps.join(" ")).toMatch(/structured required-skills/i);
  });
});
