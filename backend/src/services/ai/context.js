import { getOpportunity } from "../opportunity.service.js";
import { getProfile } from "../profile.service.js";
import { requireUsableMatchingProfile, requireUsableProfile } from "./profileReadiness.js";

const candidateColumns = `
  id, title, organization, type, description, requirements, eligibility, country_codes,
  is_global, location, location_mode, deadline, status
`;

const mapCandidate = (row) => ({
  id: row.id,
  title: row.title,
  organization: row.organization,
  type: row.type,
  description: row.description,
  requirements: row.requirements,
  eligibility: row.eligibility,
  countryCodes: row.country_codes,
  isGlobal: row.is_global,
  location: row.location,
  locationMode: row.location_mode,
  deadline: row.deadline,
  status: row.status,
});

export const loadOpportunityContext = ({ supabase, opportunityId }) =>
  getOpportunity({ supabase, opportunityId });

export const loadUsableProfile = async ({ supabase, userId }) =>
  requireUsableProfile(await getProfile({ supabase, userId }));

export const loadUsableMatchingProfile = async ({ supabase, userId, now }) =>
  requireUsableMatchingProfile(await getProfile({ supabase, userId }), now);

export const loadMatchingCandidates = async ({ supabase, now = new Date() }) => {
  const { data, error } = await supabase
    .from("opportunities")
    .select(candidateColumns)
    .eq("status", "published")
    .or(`deadline.is.null,deadline.gt.${now.toISOString()}`);

  if (error) {
    throw Object.assign(new Error("An opportunity database operation failed."), {
      statusCode: 500,
      code: "OPPORTUNITY_DATABASE_ERROR",
    });
  }
  return (data ?? []).map(mapCandidate);
};
