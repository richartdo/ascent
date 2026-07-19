import { randomUUID } from "node:crypto";

export const requestId = (req, res, next) => {
  req.id = randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
};
