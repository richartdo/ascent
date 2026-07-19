import { toOpportunityCard } from "./opportunity.service.js";

const opportunityCardColumns = `
  id, title, organization, type, description, country_codes, is_global,
  location, location_mode, deadline, application_url, published_at, last_verified_at
`;

const savedColumns = `
  id, user_id, opportunity_id, notes, created_at, updated_at,
  opportunities (${opportunityCardColumns})
`;

const serviceError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });
const databaseError = () => serviceError("A saved-opportunity database operation failed.", 500, "SAVED_OPPORTUNITY_DATABASE_ERROR");
const notFoundError = () => serviceError("The saved opportunity was not found.", 404, "SAVED_OPPORTUNITY_NOT_FOUND");
const opportunityNotFoundError = () => serviceError("The opportunity was not found.", 404, "OPPORTUNITY_NOT_FOUND");

const mapSavedOpportunity = (row) => ({
  id: row.id,
  opportunityId: row.opportunity_id,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  opportunity: row.opportunities ? toOpportunityCard(row.opportunities) : null,
});

export const listSavedOpportunities = async ({ supabase, userId, pagination }) => {
  const { page, limit } = pagination;
  const { data, error, count } = await supabase
    .from("saved_opportunities")
    .select(savedColumns, { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (error) throw databaseError();
  const total = count ?? 0;
  return {
    savedOpportunities: (data ?? []).map(mapSavedOpportunity),
    pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
};

export const saveOpportunity = async ({ supabase, userId, opportunityId, notes }) => {
  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunities")
    .select("id")
    .eq("status", "published")
    .eq("id", opportunityId)
    .maybeSingle();

  if (opportunityError) throw databaseError();
  if (!opportunity) throw opportunityNotFoundError();

  const payload = { user_id: userId, opportunity_id: opportunityId };
  if (notes !== undefined) payload.notes = notes;
  const { data, error } = await supabase
    .from("saved_opportunities")
    .insert(payload)
    .select(savedColumns)
    .single();

  if (error?.code === "23505") {
    throw serviceError("The opportunity has already been saved.", 409, "SAVED_OPPORTUNITY_CONFLICT");
  }
  if (error?.code === "42501") throw opportunityNotFoundError();
  if (error) throw databaseError();
  return mapSavedOpportunity(data);
};

export const updateSavedOpportunity = async ({ supabase, userId, opportunityId, notes }) => {
  const { data, error } = await supabase
    .from("saved_opportunities")
    .update({ notes })
    .eq("user_id", userId)
    .eq("opportunity_id", opportunityId)
    .select(savedColumns)
    .maybeSingle();

  if (error) throw databaseError();
  if (!data) throw notFoundError();
  return mapSavedOpportunity(data);
};

export const deleteSavedOpportunity = async ({ supabase, userId, opportunityId }) => {
  const { data, error } = await supabase
    .from("saved_opportunities")
    .delete()
    .eq("user_id", userId)
    .eq("opportunity_id", opportunityId)
    .select("id")
    .maybeSingle();

  if (error) throw databaseError();
  if (!data) throw notFoundError();
};
