import { z } from "zod";

export const MODEL_SERVICE_FEATURES = Object.freeze([
  "combinedText",
  "profileCountry",
  "education",
  "opportunityType",
  "locationMode",
  "countryEligible",
  "educationCompatible",
  "typePreferred",
  "locationCompatible",
  "skillOverlapCount",
  "missingRequiredSkillCount",
]);

export const modelServiceRequestSchema = z.object({
  combinedText: z.string().trim().min(1).max(20_000),
  profileCountry: z.string().regex(/^[A-Z]{2}$/),
  education: z.enum([
    "bachelors_completed", "bachelors_in_progress", "masters_completed",
    "masters_in_progress", "secondary_completed", "secondary_in_progress",
  ]),
  opportunityType: z.enum([
    "accelerator", "competition", "fellowship", "grant", "hackathon",
    "internship", "scholarship", "training",
  ]),
  locationMode: z.enum(["remote", "hybrid", "onsite"]),
  countryEligible: z.boolean(),
  educationCompatible: z.boolean(),
  typePreferred: z.boolean(),
  locationCompatible: z.boolean(),
  skillOverlapCount: z.number().int().min(0).max(100),
  missingRequiredSkillCount: z.number().int().min(0).max(100),
}).strict();

export const modelServiceResponseSchema = z.object({
  data: z.object({
    matchScore: z.number().int().min(0).max(100),
    predictedMatch: z.boolean(),
    probability: z.number().min(0).max(1),
    modelVersion: z.string().trim().min(1).max(50),
    syntheticBaseline: z.boolean(),
    disclaimer: z.literal("This score is guidance, not a guarantee of eligibility or selection."),
  }).strict(),
  requestId: z.string().uuid(),
}).strict();
