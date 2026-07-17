import { Router } from "express";

import { getProfile, updateProfile } from "../controllers/profile.controller.js";
import { validateBody } from "../middleware/validate.js";
import { profilePatchSchema } from "../schemas/profile.schema.js";

export const createProfileRouter = (authenticate) => {
  const router = Router();
  router.get("/", authenticate, getProfile);
  router.patch("/", authenticate, validateBody(profilePatchSchema), updateProfile);
  return router;
};
