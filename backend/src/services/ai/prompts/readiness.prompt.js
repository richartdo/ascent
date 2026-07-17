import { SAFETY_INSTRUCTIONS, serializePromptInput } from "./shared.js";

export const buildReadinessPrompt = ({ profile, opportunity }) => ({
  instructions: `${SAFETY_INSTRUCTIONS} Assess preparation gaps, not the probability of acceptance.`,
  input: serializePromptInput({ profile, opportunity }),
});
