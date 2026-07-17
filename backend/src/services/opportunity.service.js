const listColumns = `
  id, title, organization, type, description, country_codes, is_global,
  location, location_mode, deadline, application_url, published_at, last_verified_at
`;

const detailColumns = `
  id, title, organization, type, description, requirements, eligibility, benefits,
  country_codes, is_global, location, location_mode, deadline, application_url,
  canonical_url, source_name, source_url, status, published_at, last_verified_at,
  created_at, updated_at
`;

const mapBase = (row) => ({
  id: row.id,
  title: row.title,
  organization: row.organization,
  type: row.type,
  countryCodes: row.country_codes,
  isGlobal: row.is_global,
  location: row.location,
  locationMode: row.location_mode,
  deadline: row.deadline,
  applicationUrl: row.application_url,
  publishedAt: row.published_at,
  lastVerifiedAt: row.last_verified_at,
});

export const toOpportunityCard = (row) => ({
  ...mapBase(row),
  descriptionPreview:
    row.description.length > 240 ? `${row.description.slice(0, 237)}...` : row.description,
});

export const toOpportunityDetail = (row, now = new Date()) => ({
  ...mapBase(row),
  isExpired: row.deadline !== null && new Date(row.deadline) <= now,
  description: row.description,
  requirements: row.requirements,
  eligibility: row.eligibility,
  benefits: row.benefits,
  canonicalUrl: row.canonical_url,
  sourceName: row.source_name,
  sourceUrl: row.source_url,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const serviceError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });
const databaseError = () => serviceError("An opportunity database operation failed.", 500, "OPPORTUNITY_DATABASE_ERROR");

const applySort = (query, sort) => {
  if (sort === "deadline_asc") return query.order("deadline", { ascending: true, nullsFirst: false }).order("id");
  if (sort === "deadline_desc") return query.order("deadline", { ascending: false, nullsFirst: false }).order("id");
  return query.order("published_at", { ascending: false }).order("id");
};

export const listOpportunities = async ({ supabase, filters, now = new Date() }) => {
  const { page, limit } = filters;
  let query = supabase
    .from("opportunities")
    .select(listColumns, { count: "exact" })
    .eq("status", "published")
    .or(`deadline.is.null,deadline.gt.${now.toISOString()}`);

  if (filters.q) query = query.textSearch("search_vector", filters.q, { config: "simple", type: "websearch" });
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.country && filters.isGlobal === false) {
    query = query.contains("country_codes", [filters.country]);
  } else if (filters.country) {
    query = query.or(`is_global.eq.true,country_codes.cs.{${filters.country}}`);
  }
  if (filters.isGlobal !== undefined) query = query.eq("is_global", filters.isGlobal);
  if (filters.locationMode) query = query.eq("location_mode", filters.locationMode);
  if (filters.deadlineBefore) query = query.lte("deadline", filters.deadlineBefore);
  if (filters.deadlineAfter) query = query.gte("deadline", filters.deadlineAfter);

  query = applySort(query, filters.sort).range((page - 1) * limit, page * limit - 1);
  const { data, error, count } = await query;
  if (error) throw databaseError();

  const total = count ?? 0;
  return {
    opportunities: (data ?? []).map(toOpportunityCard),
    pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
};

export const getOpportunity = async ({ supabase, opportunityId }) => {
  const { data, error } = await supabase
    .from("opportunities")
    .select(detailColumns)
    .eq("status", "published")
    .eq("id", opportunityId)
    .maybeSingle();

  if (error) throw databaseError();
  if (!data) throw serviceError("The opportunity was not found.", 404, "OPPORTUNITY_NOT_FOUND");
  return toOpportunityDetail(data);
};
