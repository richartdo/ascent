import { env } from "../config/env.js";

export const createRequireAiConfigured = ({
  enabled = env.AI_ENABLED,
  apiKey = env.OPENAI_API_KEY,
  aiService,
} = {}) => (req, res, next) => {
  if (!enabled || !apiKey?.trim() || aiService?.configured !== true) {
    res.status(503).json({
      error: {
        code: "AI_NOT_CONFIGURED",
        message: "AI features are temporarily unavailable.",
        requestId: req.id,
      },
    });
    return;
  }
  next();
};
