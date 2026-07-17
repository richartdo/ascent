import { z } from "zod";

import { aiError } from "./errors.js";

const refusalSchema = z
  .object({ type: z.literal("refusal"), refusal: z.string().trim().min(1).max(2000) })
  .strict();

export const parseStructuredOutput = ({ output, schema }) => {
  const refusal = refusalSchema.safeParse(output);
  if (refusal.success) return { kind: "refusal", reason: refusal.data.refusal };

  const result = schema.safeParse(output);
  if (!result.success) {
    throw aiError("The AI service returned an invalid response.", 502, "AI_INVALID_RESPONSE");
  }

  return { kind: "result", data: result.data };
};
