import { aiError } from "./errors.js";

const normalize = (value) => String(value ?? "").trim().toLocaleLowerCase("en");
const validEducationLevels = new Set(["secondary", "undergraduate", "postgraduate", "graduate", "other"]);
const component = (earned, maximum) => ({ earned, maximum });

const explicitEducationLevels = (opportunity) => {
  const values = opportunity.eligibility?.educationLevels;
  if (!Array.isArray(values)) return null;
  const valid = [...new Set(values.filter((value) => validEducationLevels.has(value)))];
  return valid.length > 0 ? valid : null;
};

const preferenceLocationMatch = (profile, opportunity) => {
  if (profile.remotePreference === "no_preference") return { earned: 10, uncertain: false };
  if (profile.remotePreference === "remote_only") {
    return { earned: opportunity.locationMode === "remote" ? 10 : 0, uncertain: false };
  }
  if (profile.remotePreference === "remote_preferred" && opportunity.locationMode === "remote") {
    return { earned: 10, uncertain: false };
  }
  if (opportunity.isGlobal) return { earned: 10, uncertain: false };
  const locations = (profile.preferredLocations ?? []).map(normalize).filter(Boolean);
  if (locations.length === 0) return { earned: 5, uncertain: true };
  const actual = normalize(opportunity.location);
  return { earned: locations.some((location) => actual.includes(location)) ? 10 : 0, uncertain: false };
};

const skillEvidence = (profile, opportunity) => {
  const skills = (profile.skills ?? []).map(normalize).filter(Boolean);
  const requirements = (opportunity.requirements ?? []).map(normalize).filter(Boolean);
  if (skills.length === 0 || requirements.length === 0) return { earned: 10, uncertain: true };
  const matches = skills.filter((skill) => requirements.some((requirement) => requirement.includes(skill)));
  if (matches.length === 0) return { earned: 10, uncertain: true };
  return { earned: matches.length === 1 ? 15 : 20, uncertain: false };
};

export const calculateReadiness = ({ profile, opportunity, now = new Date() }) => {
  if (!Number.isInteger(profile.profileCompletion) || profile.profileCompletion < 0 || profile.profileCompletion > 100) {
    throw aiError("The profile data is invalid.", 500, "PROFILE_DATA_INVALID");
  }

  const missingInformation = [];
  const hardIncompatibilities = [];
  const profileCompleteness = component(Math.round(profile.profileCompletion * 0.3), 30);

  let eligibilityEarned = 0;
  let eligibilityUnknown = false;
  if (opportunity.deadline === null || new Date(opportunity.deadline) > now) eligibilityEarned += 10;
  else hardIncompatibilities.push("The verified application deadline has passed.");

  if (opportunity.isGlobal) eligibilityEarned += 10;
  else if (!/^[A-Z]{2}$/.test(profile.countryCode ?? "") || (opportunity.countryCodes ?? []).length === 0) {
    eligibilityEarned += 5;
    eligibilityUnknown = true;
    missingInformation.push("Country availability could not be fully compared.");
  } else if (opportunity.countryCodes.includes(profile.countryCode)) eligibilityEarned += 10;
  else hardIncompatibilities.push("The opportunity is not listed as available in the profile country.");

  const educationLevels = explicitEducationLevels(opportunity);
  if (!educationLevels || !profile.educationLevel) {
    eligibilityEarned += 5;
    eligibilityUnknown = true;
    missingInformation.push("Explicit education eligibility information is incomplete.");
  } else if (educationLevels.includes(profile.educationLevel)) eligibilityEarned += 10;
  else hardIncompatibilities.push("The profile education level does not match the explicit education criteria.");

  const preferredTypes = profile.preferredOpportunityTypes ?? [];
  const typeFit = preferredTypes.length === 0 ? 5 : preferredTypes.includes(opportunity.type) ? 10 : 0;
  if (preferredTypes.length === 0) missingInformation.push("Opportunity-type preferences are not available.");
  const locationFit = preferenceLocationMatch(profile, opportunity);
  if (locationFit.uncertain) missingInformation.push("Location preferences are insufficient for a complete comparison.");
  const preferenceFit = component(typeFit + locationFit.earned, 20);

  const skill = skillEvidence(profile, opportunity);
  if (skill.uncertain) missingInformation.push("Structured requirements do not provide enough evidence for a complete skill comparison.");
  const skillComponent = component(skill.earned, 20);

  let components = {
    profileCompleteness,
    eligibilityCompatibility: component(eligibilityEarned, 30),
    preferenceFit,
    skillEvidence: skillComponent,
  };
  let score = Object.values(components).reduce((sum, value) => sum + value.earned, 0);
  if (hardIncompatibilities.length > 0 && score >= 75) {
    const reduction = score - 74;
    components = {
      ...components,
      eligibilityCompatibility: component(Math.max(0, eligibilityEarned - reduction), 30),
    };
    score = Object.values(components).reduce((sum, value) => sum + value.earned, 0);
  }

  const eligibilityAssessment = hardIncompatibilities.length > 0
    ? "unlikely"
    : eligibilityUnknown ? "uncertain" : "likely";
  const assessment = score >= 75 ? "ready" : score >= 45 ? "needs_preparation" : "substantial_gaps";
  return {
    readinessScore: score,
    assessment,
    eligibilityAssessment,
    components,
    missingInformation: [...new Set(missingInformation)],
    hardIncompatibilities,
  };
};
