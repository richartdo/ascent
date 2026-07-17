import { Router } from "express";

import { createAiController } from "../controllers/ai.controller.js";
import { createRequireAiConfigured } from "../middleware/aiAvailability.js";
import { createAiRateLimiters } from "../middleware/aiRateLimit.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import {
  aiOpportunityIdParamsSchema,
  coverLetterRequestSchema,
  cvAnalysisRequestSchema,
  emptyAiRequestSchema,
  essayAssistanceRequestSchema,
  opportunityMatchesRequestSchema,
} from "../schemas/ai.schema.js";

export const createAiRouter = ({ authenticate, aiService, rateLimiters = createAiRateLimiters(), availability } = {}) => {
  const router = Router();
  const controller = createAiController(aiService);
  const requireAi = availability ?? createRequireAiConfigured({ aiService });
  const protectedRoute = [authenticate, ...rateLimiters];

  router.post("/opportunity-matches", ...protectedRoute, validateBody(opportunityMatchesRequestSchema), requireAi, controller.matchOpportunities);
  router.post("/opportunities/:opportunityId/summary", ...protectedRoute, validateParams(aiOpportunityIdParamsSchema), validateBody(emptyAiRequestSchema), requireAi, controller.summarizeOpportunity);
  router.post("/opportunities/:opportunityId/readiness", ...protectedRoute, validateParams(aiOpportunityIdParamsSchema), validateBody(emptyAiRequestSchema), requireAi, controller.assessReadiness);
  router.post("/cv-analysis", ...protectedRoute, validateBody(cvAnalysisRequestSchema), requireAi, controller.analyzeCv);
  router.post("/opportunities/:opportunityId/cover-letter", ...protectedRoute, validateParams(aiOpportunityIdParamsSchema), validateBody(coverLetterRequestSchema), requireAi, controller.generateCoverLetter);
  router.post("/essay-assistance", ...protectedRoute, validateBody(essayAssistanceRequestSchema), requireAi, controller.assistEssay);
  return router;
};
