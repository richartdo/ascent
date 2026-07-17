import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { listOpportunities, toOpportunityDetail } from "../src/services/opportunity.service.js";

const userId = "11111111-1111-4111-8111-111111111111";
const opportunityId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-17T12:00:00Z");

const databaseCard = {
  id: opportunityId,
  title: "Africa Engineering Prize",
  organization: "Example Academy",
  type: "competition",
  description: "A verified engineering competition for early-stage innovators.",
  country_codes: ["KE"],
  is_global: false,
  location: "Sub-Saharan Africa",
  location_mode: "hybrid",
  deadline: "2026-09-08T15:00:00Z",
  application_url: "https://example.org/apply",
  published_at: "2026-07-17T12:00:00Z",
  last_verified_at: "2026-07-17T12:00:00Z",
};

const createListQuery = (result = { data: [databaseCard], error: null, count: 1 }) => {
  const calls = [];
  const query = {
    select: vi.fn((...args) => { calls.push(["select", ...args]); return query; }),
    eq: vi.fn((...args) => { calls.push(["eq", ...args]); return query; }),
    contains: vi.fn((...args) => { calls.push(["contains", ...args]); return query; }),
    or: vi.fn((...args) => { calls.push(["or", ...args]); return query; }),
    textSearch: vi.fn((...args) => { calls.push(["textSearch", ...args]); return query; }),
    lte: vi.fn((...args) => { calls.push(["lte", ...args]); return query; }),
    gte: vi.fn((...args) => { calls.push(["gte", ...args]); return query; }),
    order: vi.fn((...args) => { calls.push(["order", ...args]); return query; }),
    range: vi.fn((...args) => { calls.push(["range", ...args]); return query; }),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return { query, calls };
};

const authenticatedApp = (supabase) => createApp({
  authenticateMiddleware: (req, _res, next) => {
    if (!req.get("authorization")) {
      next(Object.assign(new Error("Authentication is required."), { statusCode: 401, code: "AUTHENTICATION_REQUIRED" }));
      return;
    }
    req.auth = { user: { id: userId } };
    req.supabase = supabase;
    next();
  },
});

describe("opportunity discovery service", () => {
  it("applies bounded filters, published-only defense, sorting and pagination", async () => {
    const { query, calls } = createListQuery();
    const supabase = { from: vi.fn(() => query) };
    const result = await listOpportunities({
      supabase,
      now,
      filters: {
        q: "engineering innovation", type: "competition", country: "KE", isGlobal: false,
        locationMode: "hybrid", deadlineAfter: "2026-08-01T00:00:00Z",
        deadlineBefore: "2026-10-01T00:00:00Z", page: 2, limit: 10, sort: "deadline_asc",
      },
    });

    expect(calls).toContainEqual(["eq", "status", "published"]);
    expect(calls).toContainEqual(["or", "deadline.is.null,deadline.gt.2026-07-17T12:00:00.000Z"]);
    expect(calls).toContainEqual(["textSearch", "search_vector", "engineering innovation", { config: "simple", type: "websearch" }]);
    expect(calls).toContainEqual(["eq", "type", "competition"]);
    expect(calls).toContainEqual(["contains", "country_codes", ["KE"]]);
    expect(calls).toContainEqual(["eq", "is_global", false]);
    expect(calls).toContainEqual(["eq", "location_mode", "hybrid"]);
    expect(calls).toContainEqual(["range", 10, 19]);
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 1, totalPages: 1 });
  });

  it("includes opportunities with future deadlines", async () => {
    const future = { ...databaseCard, deadline: "2026-07-18T12:00:00Z" };
    const { query, calls } = createListQuery({ data: [future], error: null, count: 1 });
    const result = await listOpportunities({
      supabase: { from: () => query },
      filters: { page: 1, limit: 20, sort: "published_desc" },
      now,
    });

    expect(calls).toContainEqual(["or", "deadline.is.null,deadline.gt.2026-07-17T12:00:00.000Z"]);
    expect(result.opportunities.map(({ id }) => id)).toContain(future.id);
  });

  it("includes verified rolling opportunities with null deadlines", async () => {
    const rolling = { ...databaseCard, deadline: null };
    const { query, calls } = createListQuery({ data: [rolling], error: null, count: 1 });
    const result = await listOpportunities({
      supabase: { from: () => query },
      filters: { page: 1, limit: 20, sort: "published_desc" },
      now,
    });

    expect(calls).toContainEqual(["or", "deadline.is.null,deadline.gt.2026-07-17T12:00:00.000Z"]);
    expect(result.opportunities[0].deadline).toBeNull();
  });

  it("excludes expired opportunities from normal discovery", async () => {
    const { query, calls } = createListQuery({ data: [], error: null, count: 0 });
    const result = await listOpportunities({
      supabase: { from: () => query },
      filters: { page: 1, limit: 20, sort: "published_desc" },
      now,
    });

    expect(calls).toContainEqual(["or", "deadline.is.null,deadline.gt.2026-07-17T12:00:00.000Z"]);
    expect(result.opportunities).toEqual([]);
  });

  it("keeps deadlineBefore and deadlineAfter filters alongside the active predicate", async () => {
    const { query, calls } = createListQuery();
    await listOpportunities({
      supabase: { from: () => query },
      filters: {
        deadlineAfter: "2026-08-01T00:00:00Z",
        deadlineBefore: "2026-10-01T00:00:00Z",
        page: 1,
        limit: 20,
        sort: "deadline_asc",
      },
      now,
    });

    expect(calls).toContainEqual(["or", "deadline.is.null,deadline.gt.2026-07-17T12:00:00.000Z"]);
    expect(calls).toContainEqual(["gte", "deadline", "2026-08-01T00:00:00Z"]);
    expect(calls).toContainEqual(["lte", "deadline", "2026-10-01T00:00:00Z"]);
  });

  it("marks an expired published opportunity in detail responses", () => {
    const detail = toOpportunityDetail({
      ...databaseCard,
      deadline: "2026-07-16T12:00:00Z",
      requirements: [], eligibility: {}, benefits: [], canonical_url: "https://example.org/item",
      source_name: "Official source", source_url: "https://example.org/source", status: "published",
      created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
    }, now);
    expect(detail).toMatchObject({ deadline: "2026-07-16T12:00:00Z", isExpired: true });
  });

  it("returns compact camelCase cards without full description or eligibility", async () => {
    const { query } = createListQuery();
    const result = await listOpportunities({
      supabase: { from: () => query },
      filters: { page: 1, limit: 20, sort: "published_desc" },
    });

    expect(result.opportunities[0]).toMatchObject({ countryCodes: ["KE"], isGlobal: false });
    expect(result.opportunities[0]).toHaveProperty("descriptionPreview");
    expect(result.opportunities[0]).not.toHaveProperty("description");
    expect(result.opportunities[0]).not.toHaveProperty("eligibility");
    expect(result.opportunities[0]).not.toHaveProperty("requirements");
  });

  it("includes worldwide opportunities when a country filter is used", async () => {
    const { query, calls } = createListQuery();
    await listOpportunities({
      supabase: { from: () => query },
      filters: { country: "KE", page: 1, limit: 20, sort: "published_desc" },
    });
    expect(calls).toContainEqual(["or", "is_global.eq.true,country_codes.cs.{KE}"]);
  });
});

describe("opportunity routes", () => {
  it("requires authentication", async () => {
    const response = await request(authenticatedApp({})).get("/api/v1/opportunities");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("returns cards and pagination metadata", async () => {
    const { query } = createListQuery();
    const response = await request(authenticatedApp({ from: () => query }))
      .get("/api/v1/opportunities?page=1&limit=20")
      .set("Authorization", "Bearer test");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta).toMatchObject({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(response.body.meta.requestId).toBeTruthy();
  });

  it.each([
    "limit=51",
    "page=0",
    "type=unknown",
    "country=KEN",
    "locationMode=anywhere",
    "sort=title",
    "isGlobal=yes",
    "country=KE&isGlobal=true",
    "unknown=value",
    "deadlineAfter=2026-10-01T00:00:00Z&deadlineBefore=2026-09-01T00:00:00Z",
  ])("rejects invalid query: %s", async (queryString) => {
    const response = await request(authenticatedApp({}))
      .get(`/api/v1/opportunities?${queryString}`)
      .set("Authorization", "Bearer test");
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects repeated scalar filters", async () => {
    const response = await request(authenticatedApp({}))
      .get("/api/v1/opportunities?type=grant&type=job")
      .set("Authorization", "Bearer test");
    expect(response.status).toBe(422);
  });

  it("rejects invalid opportunity IDs before querying the database", async () => {
    const from = vi.fn();
    const response = await request(authenticatedApp({ from }))
      .get("/api/v1/opportunities/not-a-uuid")
      .set("Authorization", "Bearer test");
    expect(response.status).toBe(422);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns not found for a missing or unpublished opportunity", async () => {
    const builder = {
      select: vi.fn(() => builder), eq: vi.fn(() => builder),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const response = await request(authenticatedApp({ from: () => builder }))
      .get(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", "Bearer test");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("OPPORTUNITY_NOT_FOUND");
  });
});
