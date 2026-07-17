import { Router } from "express";

import {
  dismissNotification,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controllers/notification.controller.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validate.js";
import {
  emptyNotificationBodySchema,
  notificationIdParamsSchema,
  notificationListQuerySchema,
} from "../schemas/notification.schema.js";

export const createNotificationRouter = (authenticate) => {
  const router = Router();
  router.get("/", authenticate, validateQuery(notificationListQuerySchema), listNotifications);
  router.get("/unread-count", authenticate, getUnreadCount);
  router.post(
    "/read-all",
    authenticate,
    validateBody(emptyNotificationBodySchema),
    markAllNotificationsRead,
  );
  router.patch(
    "/:notificationId/read",
    authenticate,
    validateParams(notificationIdParamsSchema),
    validateBody(emptyNotificationBodySchema),
    markNotificationRead,
  );
  router.patch(
    "/:notificationId/dismiss",
    authenticate,
    validateParams(notificationIdParamsSchema),
    validateBody(emptyNotificationBodySchema),
    dismissNotification,
  );
  return router;
};
