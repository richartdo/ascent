import "dotenv/config";
import { z } from "zod";

const bodyLimitPattern = /^\d+(?:b|kb|mb)$/i;
const trimmedString = (schema = z.string()) => z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  schema,
);
const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().optional(),
);
const booleanString = (defaultValue = "false") => z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.enum(["true", "false"]).default(defaultValue).transform((value) => value === "true"),
);
const platformBoolean = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.enum(["1", "0", "true", "false"])
    .default("0")
    .transform((value) => value === "1" || value === "true"),
);

const corsOriginsSchema = trimmedString()
  .default("http://localhost:3000")
  .transform((value, context) => {
    const origins = value.split(",").map((origin) => origin.trim()).filter(Boolean);
    if (origins.length === 0) {
      context.addIssue({ code: "custom", message: "At least one CORS origin is required." });
      return z.NEVER;
    }
    for (const origin of origins) {
      try {
        const parsed = new URL(origin);
        if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) throw new Error();
      } catch {
        context.addIssue({ code: "custom", message: "CORS origins must be exact HTTP(S) origins." });
        return z.NEVER;
      }
    }
    return [...new Set(origins)];
  });

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CORS_ORIGINS: corsOriginsSchema,
  SUPABASE_URL: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().url().or(z.literal("")).optional(),
  ),
  SUPABASE_PUBLISHABLE_KEY: optionalTrimmedString,
  AI_ENABLED: booleanString(),
  OPENAI_API_KEY: optionalTrimmedString,
  OPENAI_MODEL: trimmedString(z.string().min(1)).default("gpt-5.6"),
  JSON_BODY_LIMIT: trimmedString(z.string().regex(bodyLimitPattern)).default("100kb"),
  AI_TEXT_MAX_LENGTH: z.coerce.number().int().positive().default(30000),
  VERCEL: platformBoolean,
}).superRefine((value, context) => {
  if (value.NODE_ENV !== "production") return;
  if (!value.SUPABASE_URL) context.addIssue({ code: "custom", path: ["SUPABASE_URL"], message: "Required in production." });
  if (!value.SUPABASE_PUBLISHABLE_KEY) context.addIssue({ code: "custom", path: ["SUPABASE_PUBLISHABLE_KEY"], message: "Required in production." });
  if (value.CORS_ORIGINS.includes("*")) context.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "Wildcard origins are not allowed in production." });
});

export const parseEnvironment = (source) => {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".") || "environment"))];
    throw new Error(`Invalid environment configuration for: ${fields.join(", ")}.`);
  }

  return Object.freeze(result.data);
};

export const env = parseEnvironment(process.env);
