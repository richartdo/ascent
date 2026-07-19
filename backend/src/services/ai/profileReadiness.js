import { profileRequiredError } from "./errors.js";
import { mapProfileEducation } from "./opportunityFeatureMapper.js";

export const isProfileUsableForAi = (profile) =>
  Boolean(
    profile?.persona &&
      profile?.educationLevel &&
      profile?.preferredOpportunityTypes?.length > 0 &&
      (profile?.skills?.length > 0 || profile?.interests?.length > 0),
  );

export const requireUsableProfile = (profile) => {
  if (!isProfileUsableForAi(profile)) throw profileRequiredError();
  return profile;
};

export const requireUsableMatchingProfile = (profile, now = new Date()) => {
  requireUsableProfile(profile);
  const profileGaps = [];
  if (!/^[A-Z]{2}$/.test(profile.countryCode ?? "")) profileGaps.push("countryCode");
  if (!mapProfileEducation(profile, now)) profileGaps.push("educationLevel");
  if (profileGaps.length > 0) throw profileRequiredError(profileGaps);
  return profile;
};
