import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createAuthenticationMiddleware } from "../src/middleware/authenticate.js";

const testUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "student@example.com",
  email_confirmed_at: "2026-07-17T10:00:00.000Z",
  created_at: "2026-07-17T09:00:00.000Z",
  app_metadata: { provider: "email" },
};

const buildApp = (getUser) => {
  const client = { auth: { getUser } };
  const createClient = vi.fn(() => client);
  const authenticateMiddleware = createAuthenticationMiddleware({ createClient });

  return { app: createApp({ authenticateMiddleware }), createClient, getUser };
};

describe("authentication middleware", () => {
  it("rejects a missing bearer token", async () => {
    const { app, createClient } = buildApp(vi.fn());
    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects an invalid or expired token", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid JWT" },
    });
    const { app } = buildApp(getUser);
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer expired-token");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_TOKEN");
  });

  it("returns only the safe current-user fields", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: testUser }, error: null });
    const { app, createClient } = buildApp(getUser);
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        user: {
          id: testUser.id,
          email: testUser.email,
          emailVerified: true,
          createdAt: testUser.created_at,
        },
      },
    });
    expect(response.body.data.user).not.toHaveProperty("app_metadata");
    expect(createClient).toHaveBeenCalledWith("valid-token");
    expect(getUser).toHaveBeenCalledWith("valid-token");
  });

  it("maps authentication service failures to a safe 503", async () => {
    const { app } = buildApp(vi.fn().mockRejectedValue(new Error("network details")));
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AUTH_SERVICE_UNAVAILABLE");
    expect(response.body.error.message).toBe("An unexpected error occurred.");
    expect(response.body.error).not.toHaveProperty("stack");
  });
});
