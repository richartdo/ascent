import { describe, expect, it } from "vitest";

import { prefilterOpportunities } from "../src/services/ai/opportunityPrefilter.js";
import { isProfileUsableForAi, requireUsableProfile } from "../src/services/ai/profileReadiness.js";

const now = new Date("2026-07-17T12:00:00Z");
const profile = {
  persona: "student",
  countryCode: "KE",
  educationLevel: "undergraduate",
  skills: ["JavaScript"],
  interests: ["climate"],
  preferredOpportunityTypes: ["internship"],
  preferredLocations: ["Nairobi"],
};

const opportunity = (overrides = {}) => ({
  id: "10000000-0000-4000-8000-000000000001",
  title: "Climate engineering internship",
  type: "internship",
  description: "Work on climate tools",
  requirements: ["JavaScript experience"],
  eligibility: {},
  countryCodes: ["KE"],
  isGlobal: false,
  location: "Nairobi, Kenya",
  locationMode: "hybrid",
  deadline: "2026-09-01T00:00:00Z",
  status: "published",
  ...overrides,
});

describe("AI profile readiness", () => {
  it("uses one consistent minimum profile definition", () => {
    expect(isProfileUsableForAi(profile)).toBe(true);
    expect(isProfileUsableForAi({ ...profile, skills: [], interests: [] })).toBe(false);
    expect(() => requireUsableProfile(null)).toThrow(expect.objectContaining({
      code: "PROFILE_REQUIRED",
      statusCode: 409,
    }));
  });
});

describe("deterministic opportunity prefilter", () => {
  it("keeps future and rolling opportunities but excludes expired and unpublished records", () => {
    const future = opportunity();
    const rolling = opportunity({ id: "10000000-0000-4000-8000-000000000002", deadline: null });
    const expired = opportunity({ id: "10000000-0000-4000-8000-000000000003", deadline: "2026-07-01T00:00:00Z" });
    const archived = opportunity({ id: "10000000-0000-4000-8000-000000000004", status: "archived" });

    const result = prefilterOpportunities({ profile, opportunities: [expired, archived, rolling, future], now });
    expect(result.map(({ opportunity: item }) => item.id)).toEqual([future.id, rolling.id]);
  });

  it("honors explicit type and country availability while always allowing global records", () => {
    const wrongCountry = opportunity({ id: "10000000-0000-4000-8000-000000000002", countryCodes: ["UG"] });
    const global = opportunity({ id: "10000000-0000-4000-8000-000000000003", countryCodes: [], isGlobal: true });
    const wrongType = opportunity({ id: "10000000-0000-4000-8000-000000000004", type: "grant" });

    const result = prefilterOpportunities({ profile, opportunities: [wrongCountry, global, wrongType], now });
    expect(result.map(({ opportunity: item }) => item.id)).toEqual([global.id]);
  });

  it("does not reject ambiguous eligibility prose or infer nationality from residence", () => {
    const ambiguous = opportunity({
      eligibility: { notes: "Applicants should normally have a suitable educational background." },
    });
    const withoutResidence = { ...profile, countryCode: null };

    expect(prefilterOpportunities({ profile: withoutResidence, opportunities: [ambiguous], now })).toHaveLength(1);
  });

  it("uses only explicit structured education restrictions as a conservative exclusion", () => {
    const explicitMismatch = opportunity({ eligibility: { educationLevels: ["postgraduate"] } });
    const ambiguousMismatch = opportunity({ eligibility: { notes: "Postgraduates may be especially interested." } });

    const result = prefilterOpportunities({ profile, opportunities: [explicitMismatch, ambiguousMismatch], now });
    expect(result.map(({ opportunity: item }) => item.id)).toEqual([ambiguousMismatch.id]);
  });

  it("orders by transparent relevance signals without mutating or persisting input", () => {
    const weaker = opportunity({
      id: "10000000-0000-4000-8000-000000000002",
      description: "General programme",
      requirements: [],
      location: "Mombasa, Kenya",
    });
    const input = [weaker, opportunity()];
    const snapshot = structuredClone(input);

    const result = prefilterOpportunities({ profile, opportunities: input, now });
    expect(result[0].opportunity.id).toBe(opportunity().id);
    expect(result[0].relevance).toEqual(expect.objectContaining({ skillOverlap: 1, locationPreference: 1 }));
    expect(input).toEqual(snapshot);
  });
});
