export const SAFETY_INSTRUCTIONS = [
  "Return only the requested structured result.",
  "Use cautious, evidence-based language.",
  "Never guarantee eligibility, selection, funding, employment, or application success.",
  "Do not infer sensitive attributes or unsupported eligibility facts.",
].join(" ");

export const serializePromptInput = (input) => JSON.stringify(input);
