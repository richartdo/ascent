import { Router } from "express";

import {
  deleteSavedOpportunity,
  listSavedOpportunities,
  saveOpportunity,
  updateSavedOpportunity,
} from "../controllers/savedOpportunity.controller.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validate.js";
import {
  opportunityIdParamsSchema,
  savedOpportunityListQuerySchema,
  saveOpportunityBodySchema,
  updateSavedOpportunityBodySchema,
} from "../schemas/opportunity.schema.js";

export const createSavedOpportunityRouter = (authenticate) => {
  const router = Router();
  router.get("/", authenticate, validateQuery(savedOpportunityListQuerySchema), listSavedOpportunities);
  router.post(
    "/:opportunityId",
    authenticate,
    validateParams(opportunityIdParamsSchema),
    validateBody(saveOpportunityBodySchema),
    saveOpportunity,
  );
  router.patch(
    "/:opportunityId",
    authenticate,
    validateParams(opportunityIdParamsSchema),
    validateBody(updateSavedOpportunityBodySchema),
    updateSavedOpportunity,
  );
  router.delete(
    "/:opportunityId",
    authenticate,
    validateParams(opportunityIdParamsSchema),
    deleteSavedOpportunity,
  );
  return router;
};
