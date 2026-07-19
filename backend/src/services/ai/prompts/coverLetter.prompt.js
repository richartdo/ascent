import { SAFETY_INSTRUCTIONS, serializePromptInput } from "./shared.js";

export const buildCoverLetterPrompt = ({ profile, opportunity, tone, instructions }) => ({
  instructions: `${SAFETY_INSTRUCTIONS} Draft from supplied facts only and state assumptions explicitly.`,
  input: serializePromptInput({ profile, opportunity, tone, userInstructions: instructions }),
});
