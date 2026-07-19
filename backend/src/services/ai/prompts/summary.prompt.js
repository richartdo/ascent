import { SAFETY_INSTRUCTIONS, serializePromptInput } from "./shared.js";

export const buildSummaryPrompt = ({ opportunity }) => ({
  instructions: `${SAFETY_INSTRUCTIONS} Summarize only the supplied server-loaded opportunity. Direct the user to its official source.`,
  input: serializePromptInput({ opportunity }),
});
