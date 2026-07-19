import * as profileService from "../services/profile.service.js";

export const getProfile = async (req, res) => {
  const profile = await profileService.getProfile({
    supabase: req.supabase,
    userId: req.auth.user.id,
  });

  res.status(200).json({ data: { profile } });
};

export const updateProfile = async (req, res) => {
  const profile = await profileService.updateProfile({
    supabase: req.supabase,
    userId: req.auth.user.id,
    changes: req.validatedBody,
  });

  res.status(200).json({ data: { profile } });
};
