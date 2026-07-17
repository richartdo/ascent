import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";

describe("Ascent API", () => {
  it("returns the standardized health response", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        status: "ok",
        service: "ascent-api",
      },
    });
    expect(response.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["content-security-policy"]).toBeDefined();
    expect(response.headers["ratelimit-policy"]).toBeDefined();
  });

  it("allows the configured frontend origin", async () => {
    const response = await request(app)
      .get("/api/v1/health")
      .set("Origin", "http://localhost:3000");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
  });

  it("returns a consistent not-found error", async () => {
    const response = await request(app).get("/api/v1/missing");

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Route GET /api/v1/missing was not found.",
    });
    expect(response.body.error.requestId).toBe(response.headers["x-request-id"]);
  });

  it("rejects an unapproved browser origin", async () => {
    const response = await request(app)
      .get("/api/v1/health")
      .set("Origin", "https://unapproved.example");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CORS_ORIGIN_DENIED");
    expect(response.body.error.requestId).toBe(response.headers["x-request-id"]);
  });

  it("returns a safe error for malformed JSON", async () => {
    const response = await request(app)
      .post("/api/v1/missing")
      .set("Content-Type", "application/json")
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
    expect(response.body.error).not.toHaveProperty("stack");
  });
});
