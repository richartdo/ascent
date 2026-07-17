import { applicationStatuses } from "../schemas/application.schema.js";

const opportunityColumns = "id, title, organization, deadline, application_url, status";
const applicationColumns = `
  id, user_id, opportunity_id, status, checklist, notes, next_step, started_at,
  submitted_at, status_updated_at, created_at, updated_at,
  opportunities (${opportunityColumns})
`;

const transitions = {
  planning: ["preparing", "withdrawn"],
  preparing: ["planning", "submitted", "withdrawn"],
  submitted: ["under_review", "shortlisted", "accepted", "rejected", "withdrawn"],
  under_review: ["shortlisted", "accepted", "rejected", "withdrawn"],
  shortlisted: ["accepted", "rejected", "withdrawn"],
  accepted: ["under_review"],
  rejected: ["under_review"],
  withdrawn: ["preparing"],
};

const serviceError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });
const databaseError = () => serviceError("An application database operation failed.", 500, "APPLICATION_DATABASE_ERROR");
const notFoundError = () => serviceError("The application was not found.", 404, "APPLICATION_NOT_FOUND");
const opportunityNotFoundError = () => serviceError("The opportunity was not found.", 404, "OPPORTUNITY_NOT_FOUND");

const checklistProgress = (checklist) => ({
  completed: checklist.filter((item) => item.completed).length,
  total: checklist.length,
});

const mapApplication = (row, { includeDetails = true } = {}) => {
  const opportunity = row.opportunities;
  const application = {
    id: row.id,
    opportunityId: row.opportunity_id,
    opportunityTitle: opportunity?.title ?? null,
    organization: opportunity?.organization ?? null,
    deadline: opportunity?.deadline ?? null,
    applicationUrl: opportunity?.application_url ?? null,
    opportunityStatus: opportunity?.status ?? null,
    status: row.status,
    nextStep: row.next_step,
    checklistProgress: checklistProgress(row.checklist),
    updatedAt: row.updated_at,
  };

  if (!includeDetails) return application;
  return {
    ...application,
    checklist: row.checklist,
    notes: row.notes,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    statusUpdatedAt: row.status_updated_at,
    createdAt: row.created_at,
  };
};

const applySort = (query, sort) => {
  if (sort === "deadline_asc") {
    return query
      .order("deadline", { referencedTable: "opportunities", ascending: true, nullsFirst: false })
      .order("id");
  }
  if (sort === "created_desc") return query.order("created_at", { ascending: false }).order("id");
  return query.order("updated_at", { ascending: false }).order("id");
};

export const isValidApplicationTransition = (previousStatus, nextStatus) =>
  previousStatus === nextStatus || transitions[previousStatus]?.includes(nextStatus) === true;

export const normalizeChecklist = ({ checklist, existingChecklist = [], now = new Date() }) => {
  const existingById = new Map(existingChecklist.map((item) => [item.id, item]));
  return checklist.map(({ id, title, completed }) => {
    const existing = existingById.get(id);
    return {
      id,
      title,
      completed,
      completedAt: completed
        ? existing?.completed && existing.completedAt
          ? existing.completedAt
          : now.toISOString()
        : null,
    };
  });
};

export const listApplications = async ({ supabase, userId, filters }) => {
  const { page, limit } = filters;
  let query = supabase
    .from("applications")
    .select(applicationColumns, { count: "exact" })
    .eq("user_id", userId);
  if (filters.status) query = query.eq("status", filters.status);
  query = applySort(query, filters.sort).range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await query;
  if (error) throw databaseError();
  const total = count ?? 0;
  return {
    applications: (data ?? []).map((row) => mapApplication(row, { includeDetails: false })),
    pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
};

export const createApplication = async ({ supabase, userId, input }) => {
  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunities")
    .select("id")
    .eq("id", input.opportunityId)
    .eq("status", "published")
    .maybeSingle();
  if (opportunityError) throw databaseError();
  if (!opportunity) throw opportunityNotFoundError();

  const payload = {
    user_id: userId,
    opportunity_id: input.opportunityId,
    status: input.status,
  };
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.nextStep !== undefined) payload.next_step = input.nextStep;

  const { data, error } = await supabase
    .from("applications")
    .insert(payload)
    .select(applicationColumns)
    .single();
  if (error?.code === "23505") {
    throw serviceError("The opportunity is already being tracked.", 409, "APPLICATION_CONFLICT");
  }
  if (error?.code === "42501") throw opportunityNotFoundError();
  if (error) throw databaseError();
  return mapApplication(data);
};

export const getApplication = async ({ supabase, userId, applicationId }) => {
  const { data, error } = await supabase
    .from("applications")
    .select(applicationColumns)
    .eq("user_id", userId)
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw databaseError();
  if (!data) throw notFoundError();
  return mapApplication(data);
};

export const updateApplication = async ({ supabase, userId, applicationId, changes }) => {
  const { data: existing, error: readError } = await supabase
    .from("applications")
    .select("id, status")
    .eq("user_id", userId)
    .eq("id", applicationId)
    .maybeSingle();
  if (readError) throw databaseError();
  if (!existing) throw notFoundError();

  if (changes.status && !isValidApplicationTransition(existing.status, changes.status)) {
    throw serviceError("The requested application status transition is invalid.", 422, "INVALID_APPLICATION_TRANSITION");
  }

  const payload = {};
  if (changes.status !== undefined) payload.status = changes.status;
  if (changes.notes !== undefined) payload.notes = changes.notes;
  if (changes.nextStep !== undefined) payload.next_step = changes.nextStep;
  const { data, error } = await supabase
    .from("applications")
    .update(payload)
    .eq("user_id", userId)
    .eq("id", applicationId)
    .select(applicationColumns)
    .maybeSingle();
  if (error?.code === "23514") {
    throw serviceError("The requested application status transition is invalid.", 422, "INVALID_APPLICATION_TRANSITION");
  }
  if (error) throw databaseError();
  if (!data) throw notFoundError();
  return mapApplication(data);
};

export const updateChecklist = async ({ supabase, userId, applicationId, checklist, now = new Date() }) => {
  const { data: existing, error: readError } = await supabase
    .from("applications")
    .select("id, checklist")
    .eq("user_id", userId)
    .eq("id", applicationId)
    .maybeSingle();
  if (readError) throw databaseError();
  if (!existing) throw notFoundError();

  const normalizedChecklist = normalizeChecklist({
    checklist,
    existingChecklist: existing.checklist,
    now,
  });
  const { data, error } = await supabase
    .from("applications")
    .update({ checklist: normalizedChecklist })
    .eq("user_id", userId)
    .eq("id", applicationId)
    .select(applicationColumns)
    .maybeSingle();
  if (error) throw databaseError();
  if (!data) throw notFoundError();
  return mapApplication(data);
};

export const deleteApplication = async ({ supabase, userId, applicationId }) => {
  const { data, error } = await supabase
    .from("applications")
    .delete()
    .eq("user_id", userId)
    .eq("id", applicationId)
    .select("id")
    .maybeSingle();
  if (error) throw databaseError();
  if (!data) throw notFoundError();
};

export const acceptedInitialStatuses = Object.freeze([...applicationStatuses]);
