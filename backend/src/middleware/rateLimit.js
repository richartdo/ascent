import { rateLimit } from "express-rate-limit";

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
        requestId: req.id,
      },
    });
  },
});
