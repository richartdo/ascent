const normalize = (value) => value.trim().toLocaleLowerCase("en");
const normalizedSet = (values = []) => new Set(values.map(normalize));

const educationLevels = ["secondary", "undergraduate", "graduate", "postgraduate", "other"];

const explicitEducationLevels = (eligibility) => {
  const levels = eligibility?.educationLevels;
  if (!Array.isArray(levels)) return null;
  const valid = levels.filter((level) => educationLevels.includes(level));
  return valid.length > 0 ? new Set(valid) : null;
};

const locationRelevance = (profile, opportunity) => {
  const preferences = [...normalizedSet(profile.preferredLocations)];
  if (preferences.length === 0) return 0;
  const location = normalize(opportunity.location ?? "");
  return preferences.some((preference) => location.includes(preference)) ? 1 : 0;
};

const overlap = (profileValues, opportunity) => {
  const terms = normalizedSet([
    ...(opportunity.requirements ?? []),
    ...Object.values(opportunity.eligibility ?? {}).flatMap((value) =>
      Array.isArray(value) ? value.map(String) : [String(value)],
    ),
    opportunity.title ?? "",
    opportunity.description ?? "",
  ]);

  return [...normalizedSet(profileValues)].filter((value) =>
    [...terms].some((term) => term.includes(value) || value.includes(term)),
  ).length;
};

const isActive = (opportunity, now) =>
  opportunity.status === "published" &&
  (opportunity.deadline === null || new Date(opportunity.deadline) > now);

const isAvailableInProfileCountry = (profile, opportunity) => {
  if (opportunity.isGlobal) return true;
  if (!profile.countryCode) return true;
  return opportunity.countryCodes?.includes(profile.countryCode) ?? false;
};

export const prefilterOpportunities = ({ profile, opportunities, now = new Date(), limit = 25 }) => {
  const preferredTypes = new Set(profile.preferredOpportunityTypes ?? []);

  return opportunities
    .filter((opportunity) => isActive(opportunity, now))
    .filter((opportunity) => preferredTypes.size === 0 || preferredTypes.has(opportunity.type))
    .filter((opportunity) => isAvailableInProfileCountry(profile, opportunity))
    .filter((opportunity) => {
      const levels = explicitEducationLevels(opportunity.eligibility);
      return levels === null || levels.has(profile.educationLevel);
    })
    .map((opportunity) => ({
      opportunity,
      relevance: {
        skillOverlap: overlap(profile.skills, opportunity),
        interestOverlap: overlap(profile.interests, opportunity),
        locationPreference: locationRelevance(profile, opportunity),
        globalAvailability: opportunity.isGlobal ? 1 : 0,
      },
    }))
    .sort((left, right) => {
      const leftTotal = Object.values(left.relevance).reduce((sum, value) => sum + value, 0);
      const rightTotal = Object.values(right.relevance).reduce((sum, value) => sum + value, 0);
      if (leftTotal !== rightTotal) return rightTotal - leftTotal;
      const leftDeadline = left.opportunity.deadline ?? "9999-12-31";
      const rightDeadline = right.opportunity.deadline ?? "9999-12-31";
      return leftDeadline.localeCompare(rightDeadline) || left.opportunity.id.localeCompare(right.opportunity.id);
    })
    .slice(0, limit);
};
