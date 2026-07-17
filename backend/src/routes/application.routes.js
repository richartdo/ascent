import { Router } from "express";

import {
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  updateApplication,
  updateChecklist,
} from "../controllers/application.controller.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validate.js";
import {
  applicationIdParamsSchema,
  applicationListQuerySchema,
  createApplicationBodySchema,
  updateApplicationBodySchema,
  updateChecklistBodySchema,
} from "../schemas/application.schema.js";

export const createApplicationRouter = (authenticate) => {
  const router = Router();
  router.get("/", authenticate, validateQuery(applicationListQuerySchema), listApplications);
  router.post("/", authenticate, validateBody(createApplicationBodySchema), createApplication);
  router.get("/:applicationId", authenticate, validateParams(applicationIdParamsSchema), getApplication);
  router.patch(
    "/:applicationId",
    authenticate,
    validateParams(applicationIdParamsSchema),
    validateBody(updateApplicationBodySchema),
    updateApplication,
  );
  router.delete(
    "/:applicationId",
    authenticate,
    validateParams(applicationIdParamsSchema),
    deleteApplication,
  );
  router.patch(
    "/:applicationId/checklist",
    authenticate,
    validateParams(applicationIdParamsSchema),
    validateBody(updateChecklistBodySchema),
    updateChecklist,
  );
  return router;
};
