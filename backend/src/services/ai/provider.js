import { env } from "../../config/env.js";
import { createModelServiceClient } from "./modelServiceClient.js";

export const AI_FEATURES = Object.freeze({
  MATCHING: "opportunity_matching",
  SUMMARY: "opportunity_summary",
  READINESS: "readiness",
  CV: "cv_analysis",
  COVER_LETTER: "cover_letter",
  ESSAY: "essay_assistance",
});

export const unavailableAiProvider = Object.freeze({
  configured: false,
  supports() { return false; },
  async generateStructured() {
    throw new Error("The unavailable AI provider must not be invoked.");
  },
});

export const isLiveAiProvider = (provider) =>
  provider?.configured === true && typeof provider.supports === "function";

export const createConfiguredAiProvider = ({ configuration = env, fetchImpl } = {}) => {
  if (!configuration.AI_ENABLED || configuration.AI_PROVIDER !== "custom") {
    return unavailableAiProvider;
  }
  const client = createModelServiceClient({
    baseUrl: configuration.MODEL_SERVICE_URL,
    apiKey: configuration.MODEL_SERVICE_API_KEY,
    timeoutMs: configuration.MODEL_SERVICE_TIMEOUT_MS,
    fetchImpl,
  });
  return Object.freeze({
    configured: true,
    supports: (feature) => feature === AI_FEATURES.MATCHING,
    matchOpportunity: (input) => client.match(input),
  });
};
