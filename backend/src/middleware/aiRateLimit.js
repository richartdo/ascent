import { ipKeyGenerator, rateLimit } from "express-rate-limit";

const handler = (req, res) => {
  res.status(429).json({
    error: {
      code: "RATE_LIMITED",
      message: "Too many AI requests. Please try again later.",
      requestId: req.id,
    },
  });
};

const baseOptions = { windowMs: 15 * 60 * 1000, standardHeaders: "draft-8", legacyHeaders: false, handler };

// The in-memory stores are suitable for the MVP. Horizontally scaled deployments
// will need a shared rate-limit store so all instances enforce the same counters.
export const createAiRateLimiters = ({ perIpLimit = 30, perUserLimit = 10 } = {}) => [
  rateLimit({ ...baseOptions, limit: perIpLimit, keyGenerator: (req) => ipKeyGenerator(req.ip) }),
  rateLimit({ ...baseOptions, limit: perUserLimit, keyGenerator: (req) => req.auth.user.id }),
];
