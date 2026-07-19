import { Router } from "express";

import { createAiController } from "../controllers/ai.controller.js";
import { createRequireAiConfigured, deferredAiFeature } from "../middleware/aiAvailability.js";
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
import { AI_FEATURES } from "../services/ai/provider.js";

export const createAiRouter = ({ authenticate, aiService, rateLimiters = createAiRateLimiters(), availability, enabled } = {}) => {
  const router = Router();
  const controller = createAiController(aiService);
  const requireFeature = (feature) => availability ?? createRequireAiConfigured({ aiService, feature, enabled });
  const protectedRoute = [authenticate, ...rateLimiters];

  router.post("/opportunity-matches", ...protectedRoute, validateBody(opportunityMatchesRequestSchema), requireFeature(AI_FEATURES.MATCHING), controller.matchOpportunities);
  router.post("/opportunities/:opportunityId/summary", ...protectedRoute, validateParams(aiOpportunityIdParamsSchema), validateBody(emptyAiRequestSchema), requireFeature(AI_FEATURES.SUMMARY), controller.summarizeOpportunity);
  router.post("/opportunities/:opportunityId/readiness", ...protectedRoute, validateParams(aiOpportunityIdParamsSchema), validateBody(emptyAiRequestSchema), requireFeature(AI_FEATURES.READINESS), controller.assessReadiness);
  router.post("/cv-analysis", ...protectedRoute, validateBody(cvAnalysisRequestSchema), requireFeature(AI_FEATURES.CV), controller.analyzeCv);
  router.post("/opportunities/:opportunityId/cover-letter", ...protectedRoute, validateParams(aiOpportunityIdParamsSchema), validateBody(coverLetterRequestSchema), deferredAiFeature);
  router.post("/essay-assistance", ...protectedRoute, validateBody(essayAssistanceRequestSchema), deferredAiFeature);
  return router;
};
