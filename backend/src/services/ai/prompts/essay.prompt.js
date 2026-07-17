import { SAFETY_INSTRUCTIONS, serializePromptInput } from "./shared.js";

export const buildEssayPrompt = ({ mode, prompt, draft }) => ({
  instructions: `${SAFETY_INSTRUCTIONS} Assist the user's authorship; do not claim selection or funding outcomes.`,
  input: serializePromptInput({ mode, prompt, draft }),
});
