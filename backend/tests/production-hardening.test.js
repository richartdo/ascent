import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createErrorHandler } from "../src/middleware/errorHandler.js";

describe("production hardening", () => {
  it("trusts no forwarded proxy locally and exactly one hop when configured for Vercel", () => {
    expect(createApp({ trustProxy: false }).get("trust proxy")).toBe(false);
    expect(createApp({ trustProxy: 1 }).get("trust proxy")).toBe(1);
  });

  it("redacts unexpected error messages and stacks from production logs and responses", () => {
    const logger = vi.fn();
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) };
    const secret = "SUPABASE_PASSWORD=do-not-print";
    const error = new Error(secret);
    error.stack = `stack ${secret}`;

    createErrorHandler({ nodeEnv: "production", logger })(error, { id: "request-id" }, res);

    expect(logger).toHaveBeenCalledWith("request_id=request-id status=500 code=INTERNAL_ERROR");
    expect(JSON.stringify(logger.mock.calls)).not.toContain(secret);
    expect(json).toHaveBeenCalledWith({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred.", requestId: "request-id" },
    });
  });
});
