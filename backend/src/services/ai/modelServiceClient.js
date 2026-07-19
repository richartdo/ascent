import { aiError } from "./errors.js";
import { modelServiceRequestSchema, modelServiceResponseSchema } from "./modelService.schema.js";

const unavailable = () => aiError(
  "The AI service is temporarily unavailable.",
  503,
  "AI_SERVICE_UNAVAILABLE",
);
const malformed = () => aiError(
  "The AI service returned an invalid response.",
  502,
  "AI_MALFORMED_RESPONSE",
);

export const createModelServiceClient = ({
  baseUrl,
  apiKey,
  timeoutMs,
  fetchImpl = globalThis.fetch,
}) => ({
  async match({ features, requestId, signal }) {
    const request = modelServiceRequestSchema.safeParse(features);
    if (!request.success) throw unavailable();

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (signal?.aborted) controller.abort();

    try {
      const headers = {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      };
      if (apiKey) headers["X-Model-Service-Key"] = apiKey;
      const response = await fetchImpl(`${baseUrl}/v1/match`, {
        method: "POST",
        headers,
        body: JSON.stringify(request.data),
        signal: controller.signal,
      });
      if (!response.ok) throw unavailable();

      let output;
      try {
        output = await response.json();
      } catch {
        throw malformed();
      }
      const parsed = modelServiceResponseSchema.safeParse(output);
      if (!parsed.success) throw malformed();
      return parsed.data.data;
    } catch (error) {
      if (timedOut) throw aiError("The AI service timed out.", 504, "AI_TIMEOUT");
      if (["AI_MALFORMED_RESPONSE", "AI_SERVICE_UNAVAILABLE"].includes(error?.code)) throw error;
      throw unavailable();
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  },
});
