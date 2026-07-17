import { profileRequiredError } from "./errors.js";

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
