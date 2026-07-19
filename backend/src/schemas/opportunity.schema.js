import { z } from "zod";

const opportunityTypes = [
  "scholarship", "internship", "job", "grant", "fellowship",
  "competition", "accelerator", "hackathon", "training",
];

const positiveInteger = (defaultValue, max) =>
  z.preprocess(
    (value) => (value === undefined ? defaultValue : value),
    z.coerce.number().int().min(1).max(max),
  );

const booleanQuery = z.enum(["true", "false"]).transform((value) => value === "true");
const dateTime = z.string().datetime({ offset: true });

export const opportunityIdParamsSchema = z
  .object({ opportunityId: z.string().uuid() })
  .strict();

export const opportunityListQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(120).optional(),
    type: z.enum(opportunityTypes).optional(),
    country: z
      .string()
      .regex(/^[A-Za-z]{2}$/, "Must be a two-letter country code.")
      .transform((value) => value.toUpperCase())
      .optional(),
    isGlobal: booleanQuery.optional(),
    locationMode: z.enum(["onsite", "hybrid", "remote", "unspecified"]).optional(),
    deadlineBefore: dateTime.optional(),
    deadlineAfter: dateTime.optional(),
    page: positiveInteger(1, 100000),
    limit: positiveInteger(20, 50),
    sort: z.enum(["deadline_asc", "deadline_desc", "published_desc"]).default("published_desc"),
  })
  .strict()
  .refine(({ country, isGlobal }) => !(country && isGlobal === true), {
    message: "country cannot be combined with isGlobal=true.",
    path: ["isGlobal"],
  })
  .refine(
    ({ deadlineAfter, deadlineBefore }) =>
      !deadlineAfter || !deadlineBefore || new Date(deadlineAfter) <= new Date(deadlineBefore),
    { message: "deadlineAfter must not be later than deadlineBefore.", path: ["deadlineAfter"] },
  );

export const savedOpportunityListQuerySchema = z
  .object({
    page: positiveInteger(1, 100000),
    limit: positiveInteger(20, 50),
  })
  .strict();

export const saveOpportunityBodySchema = z
  .object({ notes: z.string().trim().max(2000).nullable().optional() })
  .strict();

export const updateSavedOpportunityBodySchema = z
  .object({ notes: z.string().trim().max(2000).nullable() })
  .strict();
