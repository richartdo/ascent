import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";

const userId = "11111111-1111-4111-8111-111111111111";

const databaseProfile = {
  id: userId,
  persona: "student",
  full_name: "Amina Yusuf",
  country_code: "KE",
  city: null,
  education_level: "undergraduate",
  institution: null,
  field_of_study: null,
  graduation_year: null,
  skills: ["JavaScript"],
  interests: [],
  career_goals: null,
  preferred_opportunity_types: [],
  preferred_locations: [],
  remote_preference: "no_preference",
  profile_completion: 40,
  created_at: "2026-07-17T10:00:00.000Z",
  updated_at: "2026-07-17T10:00:00.000Z",
};

const createSupabaseMock = ({ existing = null, saved = databaseProfile, readError = null } = {}) => {
  const captured = {};
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: readError }),
      })),
    })),
    insert: vi.fn((payload) => {
      captured.payload = payload;
      return {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: saved, error: null }),
        })),
      };
    }),
    update: vi.fn((payload) => {
      captured.payload = payload;
      return {
        eq: vi.fn((field, value) => {
          captured.match = { field, value };
          return {
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: saved, error: null }),
            })),
          };
        }),
      };
    }),
  }));

  return { supabase: { from }, from, captured };
};

const buildApp = (supabase) => {
  const authenticateMiddleware = (req, _res, next) => {
    req.auth = { user: { id: userId } };
    req.supabase = supabase;
    next();
  };

  return createApp({ authenticateMiddleware });
};

describe("profile endpoints", () => {
  it("returns null when the authenticated user has no profile", async () => {
    const { supabase } = createSupabaseMock();
    const response = await request(buildApp(supabase)).get("/api/v1/profile");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { profile: null } });
  });

  it("returns the authenticated user's profile in camelCase", async () => {
    const { supabase } = createSupabaseMock({ existing: databaseProfile });
    const response = await request(buildApp(supabase)).get("/api/v1/profile");

    expect(response.status).toBe(200);
    expect(response.body.data.profile).toMatchObject({
      id: userId,
      fullName: "Amina Yusuf",
      countryCode: "KE",
      educationLevel: "undergraduate",
      profileCompletion: 40,
    });
    expect(response.body.data.profile).not.toHaveProperty("full_name");
  });

  it("inserts only validated fields using the authenticated user ID", async () => {
    const saved = {
      ...databaseProfile,
      country_code: "KE",
      interests: ["AI", "Entrepreneurship"],
      profile_completion: 20,
    };
    const { supabase, captured } = createSupabaseMock({ saved });
    const response = await request(buildApp(supabase))
      .patch("/api/v1/profile")
      .send({ countryCode: "ke", interests: ["AI", "Entrepreneurship"] });

    expect(response.status).toBe(200);
    expect(captured.payload).toEqual({
      id: userId,
      country_code: "KE",
      interests: ["AI", "Entrepreneurship"],
    });
    expect(response.body.data.profile.countryCode).toBe("KE");
  });

  it("updates an existing profile without writing protected columns", async () => {
    const saved = { ...databaseProfile, city: "Nairobi" };
    const { supabase, captured } = createSupabaseMock({
      existing: databaseProfile,
      saved,
    });
    const response = await request(buildApp(supabase))
      .patch("/api/v1/profile")
      .send({ city: "Nairobi" });

    expect(response.status).toBe(200);
    expect(captured.payload).toEqual({ city: "Nairobi" });
    expect(captured.payload).not.toHaveProperty("id");
    expect(captured.payload).not.toHaveProperty("profile_completion");
    expect(captured.match).toEqual({ field: "id", value: userId });
  });

  it("rejects user IDs and unknown fields from the request body", async () => {
    const { supabase, from } = createSupabaseMock();
    const response = await request(buildApp(supabase))
      .patch("/api/v1/profile")
      .send({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mallory" });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects an empty profile update", async () => {
    const { supabase } = createSupabaseMock();
    const response = await request(buildApp(supabase)).patch("/api/v1/profile").send({});

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("does not expose database error details", async () => {
    const { supabase } = createSupabaseMock({ readError: { message: "sensitive database detail" } });
    const response = await request(buildApp(supabase)).get("/api/v1/profile");

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("PROFILE_DATABASE_ERROR");
    expect(response.body.error.message).toBe("An unexpected error occurred.");
  });
});
