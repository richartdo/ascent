import { SAFETY_INSTRUCTIONS, serializePromptInput } from "./shared.js";

export const buildCvPrompt = ({ cvText }) => ({
  instructions: `${SAFETY_INSTRUCTIONS} Analyze the CV text without claiming hiring outcomes.`,
  input: serializePromptInput({ cvText }),
});
