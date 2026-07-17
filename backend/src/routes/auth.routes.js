import { Router } from "express";

import { getCurrentUser } from "../controllers/auth.controller.js";

export const createAuthRouter = (authenticate) => {
  const router = Router();
  router.get("/me", authenticate, getCurrentUser);
  return router;
};
