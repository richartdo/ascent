import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import {
  deleteSavedOpportunity,
  saveOpportunity,
  updateSavedOpportunity,
} from "../src/services/savedOpportunity.service.js";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const opportunityId = "10000000-0000-4000-8000-000000000001";

const opportunityCard = {
  id: opportunityId, title: "Verified Opportunity", organization: "Official Organization",
  type: "grant", description: "A verified opportunity.", country_codes: [], is_global: true,
  location: "Worldwide", location_mode: "remote", deadline: null,
  application_url: "https://official.example/apply", published_at: "2026-07-17T12:00:00Z",
  last_verified_at: "2026-07-17T12:00:00Z",
};

const savedRow = {
  id: "30000000-0000-4000-8000-000000000001",
  user_id: userId,
  opportunity_id: opportunityId,
  notes: "Prepare documents",
  created_at: "2026-07-17T12:00:00Z",
  updated_at: "2026-07-17T12:00:00Z",
  opportunities: opportunityCard,
};

const opportunityLookup = (data = { id: opportunityId }) => {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  return builder;
};

const authenticatedApp = (supabase) => createApp({
  authenticateMiddleware: (req, _res, next) => {
    req.auth = { user: { id: userId } };
    req.supabase = supabase;
    next();
  },
});

describe("saved opportunity service", () => {
  it("saves using only the authenticated user ID", async () => {
    const captured = {};
    const savedBuilder = {
      insert: vi.fn((payload) => { captured.payload = payload; return savedBuilder; }),
      select: vi.fn(() => savedBuilder),
      single: vi.fn().mockResolvedValue({ data: savedRow, error: null }),
    };
    const from = vi.fn((table) => table === "opportunities" ? opportunityLookup() : savedBuilder);

    const result = await saveOpportunity({
      supabase: { from }, userId, opportunityId, notes: "Prepare documents",
    });

    expect(captured.payload).toEqual({
      user_id: userId, opportunity_id: opportunityId, notes: "Prepare documents",
    });
    expect(result).toMatchObject({ opportunityId, notes: "Prepare documents" });
    expect(result).not.toHaveProperty("userId");
  });

  it("returns not found when the opportunity is unavailable through published-only RLS", async () => {
    await expect(saveOpportunity({
      supabase: { from: () => opportunityLookup(null) }, userId, opportunityId,
    })).rejects.toMatchObject({ statusCode: 404, code: "OPPORTUNITY_NOT_FOUND" });
  });

  it("maps duplicate saves to a conflict without exposing database details", async () => {
    const savedBuilder = {
      insert: vi.fn(() => savedBuilder), select: vi.fn(() => savedBuilder),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: "23505", message: "private detail" } }),
    };
    const supabase = { from: (table) => table === "opportunities" ? opportunityLookup() : savedBuilder };
    await expect(saveOpportunity({ supabase, userId, opportunityId }))
      .rejects.toMatchObject({ statusCode: 409, code: "SAVED_OPPORTUNITY_CONFLICT" });
  });

  it("updates notes while constraining both user and opportunity IDs", async () => {
    const matches = [];
    const builder = {
      update: vi.fn((payload) => { expect(payload).toEqual({ notes: "New note" }); return builder; }),
      eq: vi.fn((...args) => { matches.push(args); return builder; }),
      select: vi.fn(() => builder),
      maybeSingle: vi.fn().mockResolvedValue({ data: { ...savedRow, notes: "New note" }, error: null }),
    };
    const result = await updateSavedOpportunity({
      supabase: { from: () => builder }, userId, opportunityId, notes: "New note",
    });
    expect(matches).toEqual([["user_id", userId], ["opportunity_id", opportunityId]]);
    expect(result.notes).toBe("New note");
  });

  it("deletes only the authenticated user's matching record", async () => {
    const matches = [];
    const builder = {
      delete: vi.fn(() => builder),
      eq: vi.fn((...args) => { matches.push(args); return builder; }),
      select: vi.fn(() => builder),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: savedRow.id }, error: null }),
    };
    await deleteSavedOpportunity({ supabase: { from: () => builder }, userId, opportunityId });
    expect(matches).toEqual([["user_id", userId], ["opportunity_id", opportunityId]]);
  });
});

describe("saved opportunity routes", () => {
  it("rejects user_id injection before a database call", async () => {
    const from = vi.fn();
    const response = await request(authenticatedApp({ from }))
      .post(`/api/v1/saved-opportunities/${opportunityId}`)
      .send({ user_id: otherUserId, notes: "Injected" });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(from).not.toHaveBeenCalled();
  });

  it("allows an empty save body", async () => {
    const savedBuilder = {
      insert: vi.fn(() => savedBuilder), select: vi.fn(() => savedBuilder),
      single: vi.fn().mockResolvedValue({ data: { ...savedRow, notes: null }, error: null }),
    };
    const supabase = { from: (table) => table === "opportunities" ? opportunityLookup() : savedBuilder };
    const response = await request(authenticatedApp(supabase))
      .post(`/api/v1/saved-opportunities/${opportunityId}`)
      .send({});
    expect(response.status).toBe(201);
    expect(response.body.data.savedOpportunity.opportunityId).toBe(opportunityId);
  });

  it("allows PATCH to update notes only", async () => {
    const from = vi.fn();
    const response = await request(authenticatedApp({ from }))
      .patch(`/api/v1/saved-opportunities/${opportunityId}`)
      .send({ notes: "Valid", opportunityId });
    expect(response.status).toBe(422);
    expect(from).not.toHaveBeenCalled();
  });
});
