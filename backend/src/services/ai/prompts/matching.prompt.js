import { SAFETY_INSTRUCTIONS, serializePromptInput } from "./shared.js";

export const buildMatchingPrompt = ({ profile, candidate }) => ({
  instructions: `${SAFETY_INSTRUCTIONS} Assess relevance, not acceptance probability. Use the required matching disclaimer.`,
  input: serializePromptInput({ profile, opportunity: candidate }),
});
