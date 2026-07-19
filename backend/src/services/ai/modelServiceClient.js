import { aiError } from "./errors.js";
import {
  cvAnalysisInternalRequestSchema,
  cvAnalysisResponseSchema,
  modelServiceRequestSchema,
  modelServiceResponseSchema,
  opportunitySummaryRequestSchema,
  opportunitySummaryResponseSchema,
  readinessRequestSchema,
  readinessResponseSchema,
} from "./modelService.schema.js";

const unavailable = () => aiError("The AI service is temporarily unavailable.", 503, "AI_SERVICE_UNAVAILABLE");
const malformed = () => aiError("The AI service returned an invalid response.", 502, "AI_MALFORMED_RESPONSE");
const timedOut = () => aiError("The AI service timed out.", 504, "AI_TIMEOUT");
const refused = () => aiError("The AI service could not complete this request.", 422, "AI_REFUSED");

const mapUpstreamFailure = async (response) => {
  if (response.status === 502) throw malformed();
  if (response.status === 504) throw timedOut();
  if (response.status === 422) {
    try {
      const body = await response.json();
      if (body?.error?.code === "MODEL_REFUSAL") throw refused();
    } catch (error) {
      if (error?.code === "AI_REFUSED") throw error;
    }
    throw malformed();
  }
  throw unavailable();
};

export const createModelServiceClient = ({
  baseUrl,
  apiKey,
  matchingTimeoutMs,
  generationTimeoutMs,
  timeoutMs,
  fetchImpl = globalThis.fetch,
}) => {
  const request = async ({ path, input, inputSchema, outputSchema, requestId, signal, timeout }) => {
    const parsedInput = inputSchema.safeParse(input);
    if (!parsedInput.success) throw unavailable();

    const controller = new AbortController();
    let didTimeOut = false;
    const timer = setTimeout(() => {
      didTimeOut = true;
      controller.abort();
    }, timeout);
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (signal?.aborted) controller.abort();

    try {
      const headers = { "Content-Type": "application/json", "X-Request-Id": requestId };
      if (apiKey) headers["X-Model-Service-Key"] = apiKey;
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(parsedInput.data),
        signal: controller.signal,
      });
      if (!response.ok) await mapUpstreamFailure(response);
      let output;
      try {
        output = await response.json();
      } catch {
        throw malformed();
      }
      const parsedOutput = outputSchema.safeParse(output);
      if (!parsedOutput.success || parsedOutput.data.requestId !== requestId) throw malformed();
      return parsedOutput.data.data;
    } catch (error) {
      if (didTimeOut) throw timedOut();
      if (["AI_TIMEOUT", "AI_REFUSED", "AI_MALFORMED_RESPONSE", "AI_SERVICE_UNAVAILABLE"].includes(error?.code)) throw error;
      throw unavailable();
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  };

  const matchTimeout = matchingTimeoutMs ?? timeoutMs ?? 3_000;
  const generationTimeout = generationTimeoutMs ?? 75_000;
  return Object.freeze({
    match: ({ features, ...context }) => request({
      path: "/v1/match", input: features, inputSchema: modelServiceRequestSchema,
      outputSchema: modelServiceResponseSchema, timeout: matchTimeout, ...context,
    }),
    summarizeOpportunity: ({ input, ...context }) => request({
      path: "/v1/generate/opportunity-summary", input, inputSchema: opportunitySummaryRequestSchema,
      outputSchema: opportunitySummaryResponseSchema, timeout: generationTimeout, ...context,
    }),
    assessReadiness: ({ input, ...context }) => request({
      path: "/v1/generate/readiness", input, inputSchema: readinessRequestSchema,
      outputSchema: readinessResponseSchema, timeout: generationTimeout, ...context,
    }),
    analyzeCv: ({ input, ...context }) => request({
      path: "/v1/generate/cv-analysis", input, inputSchema: cvAnalysisInternalRequestSchema,
      outputSchema: cvAnalysisResponseSchema, timeout: generationTimeout, ...context,
    }),
  });
};
