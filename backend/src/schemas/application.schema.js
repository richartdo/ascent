import { z } from "zod";

export const applicationStatuses = [
  "planning",
  "preparing",
  "submitted",
  "under_review",
  "shortlisted",
  "accepted",
  "rejected",
  "withdrawn",
];

const positiveInteger = (defaultValue, max) =>
  z.preprocess(
    (value) => (value === undefined ? defaultValue : value),
    z.coerce.number().int().min(1).max(max),
  );

export const applicationIdParamsSchema = z
  .object({ applicationId: z.string().uuid() })
  .strict();

export const applicationListQuerySchema = z
  .object({
    status: z.enum(applicationStatuses).optional(),
    page: positiveInteger(1, 100000),
    limit: positiveInteger(20, 50),
    sort: z.enum(["updated_desc", "deadline_asc", "created_desc"]).default("updated_desc"),
  })
  .strict();

export const createApplicationBodySchema = z
  .object({
    opportunityId: z.string().uuid(),
    status: z.enum(applicationStatuses).default("planning"),
    notes: z.string().trim().max(5000).nullable().optional(),
    nextStep: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

export const updateApplicationBodySchema = z
  .object({
    status: z.enum(applicationStatuses).optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    nextStep: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one application field is required.",
  });

const checklistItemSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(160),
    completed: z.boolean(),
    completedAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export const updateChecklistBodySchema = z
  .object({
    checklist: z
      .array(checklistItemSchema)
      .max(25)
      .superRefine((items, context) => {
        const seenIds = new Set();
        items.forEach((item, index) => {
          if (seenIds.has(item.id)) {
            context.addIssue({
              code: "custom",
              message: "Checklist item IDs must be unique.",
              path: [index, "id"],
            });
          }
          seenIds.add(item.id);
          if (!item.completed && item.completedAt !== undefined && item.completedAt !== null) {
            context.addIssue({
              code: "custom",
              message: "completedAt must be null when an item is incomplete.",
              path: [index, "completedAt"],
            });
          }
        });
      }),
  })
  .strict();
