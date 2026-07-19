import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { corsMiddleware } from "./config/cors.js";
import { env } from "./config/env.js";
import { apiRateLimiter } from "./middleware/rateLimit.js";
import { requestId } from "./middleware/requestId.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { authenticate } from "./middleware/authenticate.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { createProfileRouter } from "./routes/profile.routes.js";
import { createOpportunityRouter } from "./routes/opportunity.routes.js";
import { createSavedOpportunityRouter } from "./routes/savedOpportunity.routes.js";
import { createApplicationRouter } from "./routes/application.routes.js";
import { createNotificationRouter } from "./routes/notification.routes.js";
import { createAiRouter } from "./routes/ai.routes.js";
import { createAiService } from "./services/ai/ai.service.js";
import { createConfiguredAiProvider } from "./services/ai/provider.js";

export const createApp = ({
  authenticateMiddleware = authenticate,
  aiService = createAiService({ provider: createConfiguredAiProvider() }),
  aiRateLimiters,
  aiAvailability,
  aiEnabled = env.AI_ENABLED,
  trustProxy = env.VERCEL ? 1 : false,
} = {}) => {
  const app = express();

  app.disable("x-powered-by");
  if (trustProxy) app.set("trust proxy", trustProxy);
  app.use(requestId);
  app.use(helmet());
  app.use(corsMiddleware);

  morgan.token("request-id", (req) => req.id);
  morgan.token("safe-path", (req) => req.originalUrl.split("?")[0]);
  app.use(
    morgan(
      ":method :safe-path :status :res[content-length] - :response-time ms request_id=:request-id",
      { skip: () => env.NODE_ENV === "test" },
    ),
  );

  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  app.use(apiRateLimiter);

  app.use("/api/v1", healthRouter);
  app.use("/api/v1/auth", createAuthRouter(authenticateMiddleware));
  app.use("/api/v1/profile", createProfileRouter(authenticateMiddleware));
  app.use("/api/v1/opportunities", createOpportunityRouter(authenticateMiddleware));
  app.use("/api/v1/saved-opportunities", createSavedOpportunityRouter(authenticateMiddleware));
  app.use("/api/v1/applications", createApplicationRouter(authenticateMiddleware));
  app.use("/api/v1/notifications", createNotificationRouter(authenticateMiddleware));
  app.use("/api/v1/ai", createAiRouter({
    authenticate: authenticateMiddleware,
    aiService,
    rateLimiters: aiRateLimiters,
    availability: aiAvailability,
    enabled: aiEnabled,
  }));

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export const app = createApp();
export default app;
