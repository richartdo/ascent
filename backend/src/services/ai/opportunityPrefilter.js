const normalize = (value) => value.trim().toLocaleLowerCase("en");
const normalizedSet = (values = []) => new Set(values.map(normalize));

const educationLevels = ["secondary", "undergraduate", "graduate", "postgraduate", "other"];
const modelOpportunityTypes = new Set([
  "accelerator", "competition", "fellowship", "grant", "hackathon",
  "internship", "scholarship", "training",
]);
const modelLocationModes = new Set(["remote", "hybrid", "onsite"]);

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

const locationCompatibility = (profile, opportunity) => {
  if (profile.remotePreference === "remote_only") return opportunity.locationMode === "remote";
  if (profile.remotePreference === "remote_preferred" && opportunity.locationMode === "remote") return true;
  if ((profile.preferredLocations ?? []).length === 0) return true;
  return locationRelevance(profile, opportunity) === 1 || opportunity.locationMode === "remote";
};

const modelCompatible = (opportunity) =>
  modelOpportunityTypes.has(opportunity.type) && modelLocationModes.has(opportunity.locationMode);

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
    .filter((opportunity) => profile.remotePreference !== "remote_only" || opportunity.locationMode === "remote")
    .filter(modelCompatible)
    .map((opportunity) => ({
      opportunity,
      assessment: {
        countryEligible: true,
        countryReason: opportunity.isGlobal
          ? "The opportunity is marked as globally available."
          : "The opportunity is available in the profile country location.",
        educationCompatible: true,
        educationKnown: explicitEducationLevels(opportunity.eligibility) !== null,
        typePreferred: preferredTypes.size === 0 || preferredTypes.has(opportunity.type),
        locationCompatible: locationCompatibility(profile, opportunity),
      },
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
      return left.opportunity.id.localeCompare(right.opportunity.id);
    })
    .slice(0, limit);
};
