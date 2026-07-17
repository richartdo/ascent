import { z } from "zod";

const currentYear = new Date().getUTCFullYear();

export const profilePatchSchema = z
  .object({
    persona: z.enum(["student", "recent_graduate", "young_founder"]).nullable().optional(),
    fullName: z.string().trim().min(1).max(120).nullable().optional(),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, "Must be a two-letter country code.")
      .transform((value) => value.toUpperCase())
      .nullable()
      .optional(),
    city: z.string().trim().min(1).max(120).nullable().optional(),
    educationLevel: z
      .enum(["secondary", "undergraduate", "postgraduate", "graduate", "other"])
      .nullable()
      .optional(),
    institution: z.string().trim().min(1).max(180).nullable().optional(),
    fieldOfStudy: z.string().trim().min(1).max(180).nullable().optional(),
    graduationYear: z
      .number()
      .int()
      .min(currentYear - 20)
      .max(currentYear + 15)
      .nullable()
      .optional(),
    skills: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    interests: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    careerGoals: z.string().trim().min(1).max(2000).nullable().optional(),
    preferredOpportunityTypes: z
      .array(
        z.enum([
          "scholarship",
          "internship",
          "job",
          "grant",
          "fellowship",
          "competition",
          "accelerator",
          "hackathon",
          "training",
        ]),
      )
      .max(9)
      .optional(),
    preferredLocations: z.array(z.string().trim().min(1).max(120)).max(25).optional(),
    remotePreference: z
      .enum(["remote_only", "remote_preferred", "no_preference"])
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one profile field is required.",
  });
