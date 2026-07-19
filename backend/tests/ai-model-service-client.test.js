import { describe, expect, it, vi } from "vitest";

import { createModelServiceClient } from "../src/services/ai/modelServiceClient.js";

const requestId = "11111111-1111-4111-8111-111111111111";
const features = {
  combinedText: "Climate data fellowship",
  profileCountry: "KE",
  education: "bachelors_in_progress",
  opportunityType: "fellowship",
  locationMode: "hybrid",
  countryEligible: true,
  educationCompatible: true,
  typePreferred: true,
  locationCompatible: true,
  skillOverlapCount: 2,
  missingRequiredSkillCount: 0,
};
const success = {
  data: {
    matchScore: 82,
    predictedMatch: true,
    probability: 0.82,
    modelVersion: "1.0.0",
    syntheticBaseline: true,
    disclaimer: "This score is guidance, not a guarantee of eligibility or selection.",
  },
  requestId,
};
const response = (body, { ok = true, status = 200 } = {}) => ({
  ok, status, json: vi.fn().mockResolvedValue(body),
});

describe("model-service client", () => {
  it("uses the configured endpoint, key, method and request ID", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(success));
    const client = createModelServiceClient({
      baseUrl: "http://127.0.0.1:8000", apiKey: "internal-placeholder", timeoutMs: 3000, fetchImpl,
    });
    await expect(client.match({ features, requestId })).resolves.toEqual(success.data);
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:8000/v1/match", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
        "X-Model-Service-Key": "internal-placeholder",
      }),
    }));
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(features);
  });

  it("omits the internal-key header when no development key is configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(success));
    const client = createModelServiceClient({ baseUrl: "http://127.0.0.1:8000", apiKey: "", timeoutMs: 3000, fetchImpl });
    await client.match({ features, requestId });
    expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty("X-Model-Service-Key");
  });

  it("aborts timed-out requests", async () => {
    const fetchImpl = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error("private body"), { name: "AbortError" })));
    }));
    const client = createModelServiceClient({ baseUrl: "http://127.0.0.1:8000", apiKey: "", timeoutMs: 5, fetchImpl });
    await expect(client.match({ features, requestId })).rejects.toMatchObject({ code: "AI_TIMEOUT", statusCode: 504 });
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it.each([401, 500, 503])("sanitizes upstream HTTP %s", async (status) => {
    const client = createModelServiceClient({
      baseUrl: "http://127.0.0.1:8000", apiKey: "", timeoutMs: 3000,
      fetchImpl: vi.fn().mockResolvedValue(response({ private: "detail" }, { ok: false, status })),
    });
    await expect(client.match({ features, requestId })).rejects.toMatchObject({
      code: "AI_SERVICE_UNAVAILABLE", statusCode: 503,
    });
  });

  it("sanitizes connection failures", async () => {
    const client = createModelServiceClient({
      baseUrl: "http://127.0.0.1:8000", apiKey: "", timeoutMs: 3000,
      fetchImpl: vi.fn().mockRejectedValue(new Error("private connection detail")),
    });
    await expect(client.match({ features, requestId })).rejects.toMatchObject({ code: "AI_SERVICE_UNAVAILABLE" });
  });

  it("rejects malformed JSON and contract-invalid scores or probabilities", async () => {
    const malformedFetch = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockRejectedValue(new SyntaxError()) });
    const malformedClient = createModelServiceClient({ baseUrl: "http://127.0.0.1:8000", apiKey: "", timeoutMs: 3000, fetchImpl: malformedFetch });
    await expect(malformedClient.match({ features, requestId })).rejects.toMatchObject({ code: "AI_MALFORMED_RESPONSE", statusCode: 502 });

    for (const data of [{ ...success.data, matchScore: 101 }, { ...success.data, probability: -0.1 }]) {
      const client = createModelServiceClient({
        baseUrl: "http://127.0.0.1:8000", apiKey: "", timeoutMs: 3000,
        fetchImpl: vi.fn().mockResolvedValue(response({ ...success, data })),
      });
      await expect(client.match({ features, requestId })).rejects.toMatchObject({ code: "AI_MALFORMED_RESPONSE" });
    }
  });

  it("does not log features, keys, or upstream responses", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createModelServiceClient({
      baseUrl: "http://127.0.0.1:8000", apiKey: "private-key", timeoutMs: 3000,
      fetchImpl: vi.fn().mockRejectedValue(new Error("private combinedText")),
    });
    await expect(client.match({ features: { ...features, combinedText: "private combinedText" }, requestId })).rejects.toBeDefined();
    expect(logger).not.toHaveBeenCalled();
    logger.mockRestore();
  });
});
