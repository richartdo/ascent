import { MODEL_SERVICE_FEATURES, modelServiceRequestSchema } from "./modelService.schema.js";

const MAX_MODEL_TEXT = 20_000;
const validGraduationYear = (value) => Number.isInteger(value) && value >= 2000 && value <= 2045;
const normalize = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const normalized = (value) => normalize(value).toLocaleLowerCase("en");
const unique = (values = []) => [...new Set(values.map(normalize).filter(Boolean))];
const uniqueIgnoringCase = (values = []) => {
  const seen = new Map();
  for (const value of values.map(normalize).filter(Boolean)) {
    const key = normalized(value);
    if (!seen.has(key)) seen.set(key, value);
  }
  return [...seen.values()];
};

export const mapProfileEducation = ({ educationLevel, graduationYear }, now = new Date()) => {
  const year = now.getUTCFullYear();
  const knownYear = validGraduationYear(graduationYear) ? graduationYear : null;
  if (educationLevel === "secondary") {
    return knownYear !== null && knownYear > year ? "secondary_in_progress" : "secondary_completed";
  }
  if (educationLevel === "undergraduate") {
    return knownYear !== null && knownYear <= year ? "bachelors_completed" : "bachelors_in_progress";
  }
  if (educationLevel === "graduate") return "bachelors_completed";
  if (educationLevel === "postgraduate") {
    return knownYear !== null && knownYear <= year ? "masters_completed" : "masters_in_progress";
  }
  return null;
};

const redactContactDetails = (value) => normalize(value)
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
  .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[redacted-phone]");

const skillOverlap = (profileSkills, requirements) => {
  const skills = uniqueIgnoringCase(profileSkills).map(normalized);
  const entries = unique(requirements).map(normalized);
  return skills.filter((skill) => entries.some((entry) => entry.includes(skill))).length;
};

const combinedText = (profile, opportunity) => redactContactDetails([
  `Profile skills: ${uniqueIgnoringCase(profile.skills).join(", ") || "not provided"}`,
  `Profile interests: ${uniqueIgnoringCase(profile.interests).join(", ") || "not provided"}`,
  `Field of study: ${normalize(profile.fieldOfStudy) || "not provided"}`,
  `Opportunity title: ${normalize(opportunity.title)}`,
  `Opportunity organization: ${normalize(opportunity.organization)}`,
  `Opportunity type: ${normalize(opportunity.type)}`,
  `Opportunity description: ${normalize(opportunity.description)}`,
  `Structured requirements: ${unique(opportunity.requirements).join("; ") || "not provided"}`,
].join("\n")).slice(0, MAX_MODEL_TEXT).trim();

export const mapOpportunityFeatures = ({ profile, candidate, now = new Date() }) => {
  const { opportunity, assessment } = candidate;
  const values = {
    combinedText: combinedText(profile, opportunity),
    profileCountry: profile.countryCode,
    education: mapProfileEducation(profile, now),
    opportunityType: opportunity.type,
    locationMode: opportunity.locationMode,
    countryEligible: assessment.countryEligible,
    educationCompatible: assessment.educationCompatible,
    typePreferred: assessment.typePreferred,
    locationCompatible: assessment.locationCompatible,
    skillOverlapCount: skillOverlap(profile.skills, opportunity.requirements),
    missingRequiredSkillCount: 0,
  };
  const parsed = modelServiceRequestSchema.parse(values);
  if (Object.keys(parsed).join(",") !== MODEL_SERVICE_FEATURES.join(",")) {
    throw new Error("The model feature order is incompatible.");
  }
  return parsed;
};

export const buildDeterministicMatch = ({ candidate, features, modelResult }) => {
  const { opportunity, relevance, assessment } = candidate;
  const matchedCriteria = [];
  const reasons = [];
  const gaps = [];

  reasons.push(assessment.countryReason);
  if (assessment.typePreferred) matchedCriteria.push("The opportunity type matches the profile preferences.");
  if (assessment.educationKnown) matchedCriteria.push("The explicit structured education criteria are compatible.");
  else gaps.push("No explicit structured education criteria are available; verify the official eligibility rules.");
  if (features.skillOverlapCount > 0) matchedCriteria.push(`${features.skillOverlapCount} profile skill(s) appear in structured requirement entries.`);
  if (relevance.interestOverlap > 0) reasons.push(`${relevance.interestOverlap} profile interest(s) overlap with verified opportunity text.`);
  if (assessment.locationCompatible) matchedCriteria.push("The location mode is compatible with the profile preferences.");
  else gaps.push("The location is not a stated profile preference.");
  gaps.push("No structured required-skills field exists, so missing skill requirements cannot be confirmed.");

  return {
    schemaVersion: "1.0",
    opportunityId: opportunity.id,
    matchScore: modelResult.matchScore,
    eligibilityAssessment: assessment.educationKnown ? "likely" : "uncertain",
    reasons: reasons.slice(0, 10),
    matchedCriteria: matchedCriteria.slice(0, 10),
    gaps: gaps.slice(0, 10),
    disclaimer: "This assessment is guidance, not an eligibility guarantee.",
  };
};
