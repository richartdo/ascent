const profileColumns = `
  id,
  persona,
  full_name,
  country_code,
  city,
  education_level,
  institution,
  field_of_study,
  graduation_year,
  skills,
  interests,
  career_goals,
  preferred_opportunity_types,
  preferred_locations,
  remote_preference,
  profile_completion,
  created_at,
  updated_at
`;

const fieldMap = {
  persona: "persona",
  fullName: "full_name",
  countryCode: "country_code",
  city: "city",
  educationLevel: "education_level",
  institution: "institution",
  fieldOfStudy: "field_of_study",
  graduationYear: "graduation_year",
  skills: "skills",
  interests: "interests",
  careerGoals: "career_goals",
  preferredOpportunityTypes: "preferred_opportunity_types",
  preferredLocations: "preferred_locations",
  remotePreference: "remote_preference",
};

const toDatabaseProfile = (profile) =>
  Object.fromEntries(Object.entries(profile).map(([key, value]) => [fieldMap[key], value]));

const toApiProfile = (profile) => {
  if (!profile) return null;

  return {
    id: profile.id,
    persona: profile.persona,
    fullName: profile.full_name,
    countryCode: profile.country_code,
    city: profile.city,
    educationLevel: profile.education_level,
    institution: profile.institution,
    fieldOfStudy: profile.field_of_study,
    graduationYear: profile.graduation_year,
    skills: profile.skills,
    interests: profile.interests,
    careerGoals: profile.career_goals,
    preferredOpportunityTypes: profile.preferred_opportunity_types,
    preferredLocations: profile.preferred_locations,
    remotePreference: profile.remote_preference,
    profileCompletion: profile.profile_completion,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
};

const databaseError = () => {
  const error = new Error("A profile database operation failed.");
  error.statusCode = 500;
  error.code = "PROFILE_DATABASE_ERROR";
  return error;
};

export const getProfile = async ({ supabase, userId }) => {
  const { data, error } = await supabase
    .from("profiles")
    .select(profileColumns)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw databaseError();
  return toApiProfile(data);
};

export const updateProfile = async ({ supabase, userId, changes }) => {
  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select(profileColumns)
    .eq("id", userId)
    .maybeSingle();

  if (readError) throw databaseError();

  const databaseChanges = toDatabaseProfile(changes);
  const query = existing
    ? supabase.from("profiles").update(databaseChanges).eq("id", userId)
    : supabase.from("profiles").insert({ id: userId, ...databaseChanges });
  const { data, error } = await query.select(profileColumns).single();

  if (error) throw databaseError();
  return toApiProfile(data);
};
