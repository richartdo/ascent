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

  it("documents AI_NOT_CONFIGURED for every AI operation", async () => {
    const document = await loadJson("../docs/openapi.json");
    for (const [method, path] of registeredOperations.filter(([, path]) => path.includes("/ai/"))) {
      const operation = resolveOperation(document, method, path);
      expect(operation.responses["503"].$ref).toBe("#/components/responses/AiNotConfigured");
    }
    expect(document.components.responses.AiNotConfigured.content["application/json"].example.error.code)
      .toBe("AI_NOT_CONFIGURED");
  });

  it("parses safe Postman assets containing all implemented operations", async () => {
    const collection = await loadJson("../docs/postman/Ascent-Backend.postman_collection.json");
    const environment = await loadJson("../docs/postman/Ascent-Local.postman_environment.json");
    const requests = collection.item.flatMap((folder) => folder.item);
    expect(requests).toHaveLength(27);
    expect(environment.values.map(({ key }) => key)).toEqual([
      "baseUrl", "accessToken", "opportunityId", "applicationId", "notificationId",
      "supabaseUrl", "supabasePublishableKey",
    ]);
    expect(environment.values.find(({ key }) => key === "accessToken").value).toBe("");
    expect(JSON.stringify({ collection, environment })).not.toMatch(/sk-[A-Za-z0-9]|service[_-]?role|database password/i);
  });
});
