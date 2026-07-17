import { Router } from "express";

import { getOpportunity, listOpportunities } from "../controllers/opportunity.controller.js";
import { validateParams, validateQuery } from "../middleware/validate.js";
import { opportunityIdParamsSchema, opportunityListQuerySchema } from "../schemas/opportunity.schema.js";

export const createOpportunityRouter = (authenticate) => {
  const router = Router();
  router.get("/", authenticate, validateQuery(opportunityListQuerySchema), listOpportunities);
  router.get("/:opportunityId", authenticate, validateParams(opportunityIdParamsSchema), getOpportunity);
  return router;
};
