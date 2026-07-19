export const aiError = (message, statusCode, code) =>
  Object.assign(new Error(message), { statusCode, code, expose: true });

export const profileRequiredError = (profileGaps = []) =>
  Object.assign(aiError(
    "Complete the required profile fields before using this feature.",
    409,
    "PROFILE_REQUIRED",
  ), profileGaps.length > 0 ? { details: { profileGaps } } : {});

export const normalizeAiProviderError = (error) => {
  if (error?.name === "AbortError" || error?.code === "ETIMEDOUT" || error?.code === "AI_TIMEOUT") {
    return aiError("The AI service timed out.", 504, "AI_TIMEOUT");
  }
  if (["AI_INVALID_RESPONSE", "AI_MALFORMED_RESPONSE", "AI_SERVICE_UNAVAILABLE"].includes(error?.code)) return error;
  return aiError("The AI service is temporarily unavailable.", 503, "AI_SERVICE_UNAVAILABLE");
};
