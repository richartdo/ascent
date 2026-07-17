import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import {
  createApplication,
  deleteApplication,
  isValidApplicationTransition,
  listApplications,
  normalizeChecklist,
  updateApplication,
} from "../src/services/application.service.js";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const opportunityId = "10000000-0000-4000-8000-000000000001";
const applicationId = "40000000-0000-4000-8000-000000000001";
const checklistId = "50000000-0000-4000-8000-000000000001";

const databaseApplication = {
  id: applicationId,
  user_id: userId,
  opportunity_id: opportunityId,
  status: "planning",
  checklist: [],
  notes: null,
  next_step: null,
  started_at: "2026-07-17T12:00:00Z",
  submitted_at: null,
  status_updated_at: "2026-07-17T12:00:00Z",
  created_at: "2026-07-17T12:00:00Z",
  updated_at: "2026-07-17T12:00:00Z",
  opportunities: {
    id: opportunityId,
    title: "Verified Scholarship",
    organization: "Official Foundation",
    deadline: "2026-10-01T00:00:00Z",
    application_url: "https://official.example/apply",
    status: "published",
  },
};

const lookupBuilder = (data, error = null) => {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  return builder;
};

const insertBuilder = ({ data = databaseApplication, error = null, captured = {} } = {}) => {
  const builder = {
    insert: vi.fn((payload) => { captured.payload = payload; return builder; }),
    select: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
  return builder;
};

const authenticatedApp = (supabase, { requireHeader = false } = {}) => createApp({
  authenticateMiddleware: (req, _res, next) => {
    if (requireHeader && !req.get("authorization")) {
      next(Object.assign(new Error("Authentication is required."), {
        statusCode: 401,
        code: "AUTHENTICATION_REQUIRED",
      }));
      return;
    }
    req.auth = { user: { id: userId } };
    req.supabase = supabase;
    next();
  },
});

describe("application behavior", () => {
  it("supports the approved status transitions and controlled corrections", () => {
    expect(isValidApplicationTransition("planning", "preparing")).toBe(true);
    expect(isValidApplicationTransition("preparing", "submitted")).toBe(true);
    expect(isValidApplicationTransition("accepted", "under_review")).toBe(true);
    expect(isValidApplicationTransition("withdrawn", "preparing")).toBe(true);
    expect(isValidApplicationTransition("accepted", "planning")).toBe(false);
    expect(isValidApplicationTransition("planning", "accepted")).toBe(false);
  });

  it("sets and preserves server-managed checklist completion timestamps", () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const completed = normalizeChecklist({
      checklist: [{ id: checklistId, title: "Transcript", completed: true, completedAt: "2000-01-01T00:00:00Z" }],
      existingChecklist: [{ id: checklistId, title: "Transcript", completed: false, completedAt: null }],
      now,
    });
    expect(completed[0].completedAt).toBe(now.toISOString());

    const preserved = normalizeChecklist({ checklist: completed, existingChecklist: completed, now: new Date("2026-07-19T12:00:00Z") });
    expect(preserved[0].completedAt).toBe(now.toISOString());

    const reopened = normalizeChecklist({
      checklist: [{ ...completed[0], completed: false }], existingChecklist: completed, now,
    });
    expect(reopened[0].completedAt).toBeNull();
  });

  it("creates an application with authenticated ownership only", async () => {
    const captured = {};
    const supabase = {
      from: vi.fn((table) => table === "opportunities"
        ? lookupBuilder({ id: opportunityId })
        : insertBuilder({ captured })),
    };
    const result = await createApplication({
      supabase,
      userId,
      input: { opportunityId, status: "planning", notes: "Prepare", nextStep: "Request transcript" },
    });
    expect(captured.payload).toEqual({
      user_id: userId,
      opportunity_id: opportunityId,
      status: "planning",
      notes: "Prepare",
      next_step: "Request transcript",
    });
    expect(result).not.toHaveProperty("userId");
  });

  it("returns conflict for duplicate application tracking", async () => {
    const supabase = {
      from: (table) => table === "opportunities"
        ? lookupBuilder({ id: opportunityId })
        : insertBuilder({ data: null, error: { code: "23505" } }),
    };
    await expect(createApplication({
      supabase, userId, input: { opportunityId, status: "planning" },
    })).rejects.toMatchObject({ statusCode: 409, code: "APPLICATION_CONFLICT" });
  });

  it("returns not found for a missing or unpublished opportunity", async () => {
    await expect(createApplication({
      supabase: { from: () => lookupBuilder(null) },
      userId,
      input: { opportunityId, status: "planning" },
    })).rejects.toMatchObject({ statusCode: 404, code: "OPPORTUNITY_NOT_FOUND" });
  });

  it("lists only the authenticated user's applications with tracker-card fields", async () => {
    const matches = [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((...args) => { matches.push(args); return query; }),
      order: vi.fn(() => query),
      range: vi.fn(() => query),
      then: (resolve) => Promise.resolve({ data: [databaseApplication], error: null, count: 1 }).then(resolve),
    };
    const result = await listApplications({
      supabase: { from: () => query }, userId,
      filters: { page: 1, limit: 20, sort: "updated_desc" },
    });
    expect(matches).toContainEqual(["user_id", userId]);
    expect(result.applications[0]).toMatchObject({
      opportunityTitle: "Verified Scholarship",
      checklistProgress: { completed: 0, total: 0 },
    });
    expect(result.applications[0]).not.toHaveProperty("notes");
  });

  it("updates notes and next step through an ownership-constrained query", async () => {
    const matches = [];
    const updated = { ...databaseApplication, notes: "Received", next_step: "Recommendation" };
    const readBuilder = lookupBuilder({ id: applicationId, status: "planning" });
    const updateBuilder = {
      update: vi.fn((payload) => {
        expect(payload).toEqual({ notes: "Received", next_step: "Recommendation" });
        return updateBuilder;
      }),
      eq: vi.fn((...args) => { matches.push(args); return updateBuilder; }),
      select: vi.fn(() => updateBuilder),
      maybeSingle: vi.fn().mockResolvedValue({ data: updated, error: null }),
    };
    let call = 0;
    const result = await updateApplication({
      supabase: { from: () => (call++ === 0 ? readBuilder : updateBuilder) },
      userId, applicationId, changes: { notes: "Received", nextStep: "Recommendation" },
    });
    expect(matches).toEqual([["user_id", userId], ["id", applicationId]]);
    expect(result).toMatchObject({ notes: "Received", nextStep: "Recommendation" });
  });

  it("rejects invalid status transitions before writing", async () => {
    const from = vi.fn(() => lookupBuilder({ id: applicationId, status: "planning" }));
    await expect(updateApplication({
      supabase: { from }, userId, applicationId, changes: { status: "accepted" },
    })).rejects.toMatchObject({ statusCode: 422, code: "INVALID_APPLICATION_TRANSITION" });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("deletes only a matching owned application", async () => {
    const matches = [];
    const builder = {
      delete: vi.fn(() => builder),
      eq: vi.fn((...args) => { matches.push(args); return builder; }),
      select: vi.fn(() => builder),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: applicationId }, error: null }),
    };
    await deleteApplication({ supabase: { from: () => builder }, userId, applicationId });
    expect(matches).toEqual([["user_id", userId], ["id", applicationId]]);
  });
});

describe("application routes and validation", () => {
  it("requires authentication", async () => {
    const response = await request(authenticatedApp({}, { requireHeader: true })).get("/api/v1/applications");
    expect(response.status).toBe(401);
  });

  it("defaults a new application to planning", async () => {
    const captured = {};
    const supabase = {
      from: (table) => table === "opportunities"
        ? lookupBuilder({ id: opportunityId })
        : insertBuilder({ captured }),
    };
    const response = await request(authenticatedApp(supabase))
      .post("/api/v1/applications")
      .send({ opportunityId });
    expect(response.status).toBe(201);
    expect(captured.payload.status).toBe("planning");
  });

  it("accepts submitted-or-later initial statuses for existing-history import", async () => {
    const captured = {};
    const supabase = {
      from: (table) => table === "opportunities"
        ? lookupBuilder({ id: opportunityId })
        : insertBuilder({ data: { ...databaseApplication, status: "under_review", submitted_at: "2026-07-17T12:00:00Z" }, captured }),
    };
    const response = await request(authenticatedApp(supabase))
      .post("/api/v1/applications")
      .send({ opportunityId, status: "under_review" });
    expect(response.status).toBe(201);
    expect(captured.payload.status).toBe("under_review");
  });

  it("rejects userId, opportunityId changes, timestamps and unknown fields", async () => {
    const from = vi.fn();
    const response = await request(authenticatedApp({ from }))
      .patch(`/api/v1/applications/${applicationId}`)
      .send({ userId: otherUserId, opportunityId, submittedAt: "2026-07-17T12:00:00Z" });
    expect(response.status).toBe(422);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects invalid application UUIDs", async () => {
    const response = await request(authenticatedApp({ from: vi.fn() }))
      .get("/api/v1/applications/not-a-uuid");
    expect(response.status).toBe(422);
  });

  it("rejects checklists larger than 25 items", async () => {
    const checklist = Array.from({ length: 26 }, (_, index) => ({
      id: `50000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      title: `Item ${index}`,
      completed: false,
      completedAt: null,
    }));
    const response = await request(authenticatedApp({ from: vi.fn() }))
      .patch(`/api/v1/applications/${applicationId}/checklist`)
      .send({ checklist });
    expect(response.status).toBe(422);
  });

  it("rejects duplicate checklist item IDs", async () => {
    const item = { id: checklistId, title: "Transcript", completed: false, completedAt: null };
    const response = await request(authenticatedApp({ from: vi.fn() }))
      .patch(`/api/v1/applications/${applicationId}/checklist`)
      .send({ checklist: [item, { ...item, title: "Duplicate" }] });
    expect(response.status).toBe(422);
    expect(response.body.error.details.some(({ message }) => message.includes("unique"))).toBe(true);
  });
});
