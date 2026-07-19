import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const loadJson = async (relative) => JSON.parse(await readFile(fileURLToPath(new URL(relative, import.meta.url)), "utf8"));

const registeredOperations = [
  ["get", "/api/v1/health"], ["get", "/api/v1/auth/me"],
  ["get", "/api/v1/profile"], ["patch", "/api/v1/profile"],
  ["get", "/api/v1/opportunities"], ["get", "/api/v1/opportunities/{opportunityId}"],
  ["get", "/api/v1/saved-opportunities"], ["post", "/api/v1/saved-opportunities/{opportunityId}"],
  ["patch", "/api/v1/saved-opportunities/{opportunityId}"], ["delete", "/api/v1/saved-opportunities/{opportunityId}"],
  ["get", "/api/v1/applications"], ["post", "/api/v1/applications"],
  ["get", "/api/v1/applications/{applicationId}"], ["patch", "/api/v1/applications/{applicationId}"],
  ["delete", "/api/v1/applications/{applicationId}"], ["patch", "/api/v1/applications/{applicationId}/checklist"],
  ["get", "/api/v1/notifications"], ["get", "/api/v1/notifications/unread-count"],
  ["patch", "/api/v1/notifications/{notificationId}/read"], ["patch", "/api/v1/notifications/{notificationId}/dismiss"],
  ["post", "/api/v1/notifications/read-all"], ["post", "/api/v1/ai/opportunity-matches"],
  ["post", "/api/v1/ai/opportunities/{opportunityId}/summary"], ["post", "/api/v1/ai/opportunities/{opportunityId}/readiness"],
  ["post", "/api/v1/ai/cv-analysis"], ["post", "/api/v1/ai/opportunities/{opportunityId}/cover-letter"],
  ["post", "/api/v1/ai/essay-assistance"],
];

const resolveOperation = (document, method, path) => {
  const operation = document.paths[path]?.[method];
  if (!operation?.$ref) return operation;
  return operation.$ref.slice(2).split("/").reduce((value, key) => value[key], document);
};

describe("OpenAPI and API-client assets", () => {
  it("parses OpenAPI 3.1 and documents every registered route", async () => {
    const document = await loadJson("../docs/openapi.json");
    expect(document.openapi).toBe("3.1.0");
    expect(registeredOperations).toHaveLength(27);
    for (const [method, path] of registeredOperations) {
      expect(resolveOperation(document, method, path), `${method.toUpperCase()} ${path}`).toBeDefined();
    }
  });

  it("documents fail-closed and dependency-unavailable responses for every AI operation", async () => {
    const document = await loadJson("../docs/openapi.json");
    for (const [method, path] of registeredOperations.filter(([, path]) => path.includes("/ai/"))) {
      const operation = resolveOperation(document, method, path);
      const deferred = path.endsWith("cover-letter") || path.endsWith("essay-assistance");
      expect(operation.responses["503"].$ref).toBe(deferred
        ? "#/components/responses/AiNotConfigured"
        : "#/components/responses/AiMatchingUnavailable");
    }
    expect(document.components.responses.AiNotConfigured.content["application/json"].example.error.code)
      .toBe("AI_NOT_CONFIGURED");
  });

  it("documents success and sanitized failures for all four approved AI capabilities", async () => {
    const document = await loadJson("../docs/openapi.json");
    for (const path of [
      "/api/v1/ai/opportunity-matches",
      "/api/v1/ai/opportunities/{opportunityId}/summary",
      "/api/v1/ai/opportunities/{opportunityId}/readiness",
      "/api/v1/ai/cv-analysis",
    ]) {
      const operation = resolveOperation(document, "post", path);
      expect(operation.responses["200"], path).toBeDefined();
      expect(operation.responses["502"].$ref).toBe("#/components/responses/AiMalformedResponse");
      expect(operation.responses["504"].$ref).toBe("#/components/responses/AiTimeout");
    }
    expect(document.components.schemas.CvRequest.properties.opportunityId.format).toBe("uuid");
    expect(document.components.schemas.CvRequest.required).toEqual(["cvText"]);
    expect(document.components.schemas.ReadinessResult.properties.components).toBeDefined();
  });

  it("documents matching success and sanitized model dependency failures", async () => {
    const document = await loadJson("../docs/openapi.json");
    const operation = resolveOperation(document, "post", "/api/v1/ai/opportunity-matches");
    expect(operation.responses["200"]).toBeDefined();
    expect(operation.responses["502"].$ref).toBe("#/components/responses/AiMalformedResponse");
    expect(operation.responses["504"].$ref).toBe("#/components/responses/AiTimeout");
    expect(document.components.schemas.AiMatchesResponse.properties.data.properties.matches.items.$ref)
      .toBe("#/components/schemas/MatchingResult");
  });

  it("parses safe Postman assets containing all implemented operations", async () => {
    const collection = await loadJson("../docs/postman/Ascent-Backend.postman_collection.json");
    const environment = await loadJson("../docs/postman/Ascent-Local.postman_environment.json");
    const requests = collection.item.flatMap((folder) => folder.item);
    expect(requests).toHaveLength(30);
    expect(environment.values.map(({ key }) => key)).toEqual([
      "baseUrl", "accessToken", "opportunityId", "applicationId", "notificationId",
      "supabaseUrl", "supabasePublishableKey", "modelServiceUrl", "modelServiceApiKey",
    ]);
    expect(environment.values.find(({ key }) => key === "accessToken").value).toBe("");
    expect(environment.values.find(({ key }) => key === "modelServiceApiKey")).toMatchObject({ value: "", type: "secret" });
    expect(JSON.stringify({ collection, environment })).not.toMatch(/sk-[A-Za-z0-9]|service[_-]?role|database password/i);
  });
});
