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

const supportedAiFeatures = new Set([
  "opportunity_matching",
  "opportunity_summary",
  "readiness",
  "cv_analysis",
]);
const aiFeaturesSchema = trimmedString()
  .default("opportunity_matching")
  .transform((value, context) => {
    const features = [...new Set(value.split(",").map((feature) => feature.trim()).filter(Boolean))];
    if (features.length === 0 || features.some((feature) => !supportedAiFeatures.has(feature))) {
      context.addIssue({ code: "custom", message: "AI_FEATURES contains an unsupported feature." });
      return z.NEVER;
    }
    return features;
  });

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

const modelServiceOriginSchema = trimmedString(z.string().min(1))
  .default("http://127.0.0.1:8000")
  .superRefine((value, context) => {
    try {
      const parsed = new URL(value);
      const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== value) throw new Error();
      if (parsed.protocol === "http:" && !loopback) throw new Error();
    } catch {
      context.addIssue({
        code: "custom",
        message: "Must be an exact HTTPS origin or an HTTP loopback origin.",
      });
    }
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
  AI_PROVIDER: trimmedString(z.enum(["disabled", "custom"])).default("disabled"),
  AI_FEATURES: aiFeaturesSchema,
  MODEL_SERVICE_URL: modelServiceOriginSchema,
  MODEL_SERVICE_API_KEY: optionalTrimmedString,
  MODEL_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(500).max(10_000).default(3000),
  GENERATION_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(120_000).default(75_000),
  MODEL_SERVICE_MAX_CANDIDATES: z.coerce.number().int().min(1).max(20).default(20),
  MODEL_SERVICE_CONCURRENCY: z.coerce.number().int().min(1).max(5).default(4),
  OPENAI_API_KEY: optionalTrimmedString,
  OPENAI_MODEL: trimmedString(z.string().min(1)).default("gpt-5.6"),
  JSON_BODY_LIMIT: trimmedString(z.string().regex(bodyLimitPattern)).default("100kb"),
  AI_TEXT_MAX_LENGTH: z.coerce.number().int().positive().default(30000),
  VERCEL: platformBoolean,
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production") {
    if (!value.SUPABASE_URL) context.addIssue({ code: "custom", path: ["SUPABASE_URL"], message: "Required in production." });
    if (!value.SUPABASE_PUBLISHABLE_KEY) context.addIssue({ code: "custom", path: ["SUPABASE_PUBLISHABLE_KEY"], message: "Required in production." });
    if (value.CORS_ORIGINS.includes("*")) context.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "Wildcard origins are not allowed in production." });
  }
  if (value.AI_ENABLED && value.AI_PROVIDER === "custom") {
    if (!value.MODEL_SERVICE_URL) context.addIssue({ code: "custom", path: ["MODEL_SERVICE_URL"], message: "Required for custom matching." });
    if (value.NODE_ENV === "production" && !value.MODEL_SERVICE_API_KEY) {
      context.addIssue({ code: "custom", path: ["MODEL_SERVICE_API_KEY"], message: "Required in production for custom matching." });
    }
  }
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
