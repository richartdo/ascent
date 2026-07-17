import "dotenv/config";
import { z } from "zod";

const bodyLimitPattern = /^\d+(?:b|kb|mb)$/i;

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  SUPABASE_URL: z.string().url().or(z.literal("")).optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  AI_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-5.6"),
  JSON_BODY_LIMIT: z.string().regex(bodyLimitPattern).default("100kb"),
  AI_TEXT_MAX_LENGTH: z.coerce.number().int().positive().default(30000),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = Object.freeze(result.data);
