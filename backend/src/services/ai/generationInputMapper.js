const cleanText = (value, maximum) => typeof value === "string" ? value.trim().slice(0, maximum) : "";
const cleanList = (values, maximumItems, maximumLength) =>
  (Array.isArray(values) ? values : [])
    .map((value) => cleanText(String(value), maximumLength))
    .filter(Boolean)
    .slice(0, maximumItems);

const flattenEligibility = (eligibility) => {
  if (!eligibility || typeof eligibility !== "object" || Array.isArray(eligibility)) return [];
  const output = [];
  for (const [key, rawValue] of Object.entries(eligibility).sort(([left], [right]) => left.localeCompare(right))) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (!["string", "number", "boolean"].includes(typeof value)) continue;
      const text = cleanText(`${key}: ${String(value)}`, 500);
      if (text) output.push(text);
      if (output.length === 30) return output;
    }
  }
  return output;
};

export const mapOpportunityForGeneration = (opportunity) => ({
  opportunityId: opportunity.id,
  title: cleanText(opportunity.title, 180),
  organization: cleanText(opportunity.organization, 180),
  type: opportunity.type,
  description: cleanText(opportunity.description, 20_000),
  requirements: cleanList(opportunity.requirements, 30, 500),
  eligibility: flattenEligibility(opportunity.eligibility),
  benefits: cleanList(opportunity.benefits, 30, 500),
  countryCodes: cleanList(opportunity.countryCodes, 50, 2),
  isGlobal: opportunity.isGlobal,
  location: cleanText(opportunity.location, 180) || null,
  locationMode: opportunity.locationMode,
  deadline: opportunity.deadline,
});

export const mapProfileForGeneration = (profile) => ({
  persona: profile.persona ?? null,
  countryCode: profile.countryCode ?? null,
  educationLevel: profile.educationLevel ?? null,
  fieldOfStudy: cleanText(profile.fieldOfStudy, 180) || null,
  graduationYear: profile.graduationYear ?? null,
  skills: cleanList(profile.skills, 50, 80),
  interests: cleanList(profile.interests, 50, 80),
  careerGoals: cleanText(profile.careerGoals, 2_000) || null,
});
