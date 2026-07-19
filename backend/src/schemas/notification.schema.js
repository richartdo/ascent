import { z } from "zod";

const positiveInteger = (defaultValue, max) =>
  z.preprocess(
    (value) => (value === undefined ? defaultValue : value),
    z.coerce.number().int().min(1).max(max),
  );

export const notificationIdParamsSchema = z
  .object({ notificationId: z.string().uuid() })
  .strict();

export const notificationListQuerySchema = z
  .object({
    unreadOnly: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    type: z.enum(["deadline", "application", "system"]).optional(),
    page: positiveInteger(1, 100000),
    limit: positiveInteger(20, 50),
  })
  .strict();

export const emptyNotificationBodySchema = z.preprocess(
  (value) => value ?? {},
  z.object({}).strict(),
);
