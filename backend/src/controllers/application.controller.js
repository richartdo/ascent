import * as applicationService from "../services/application.service.js";

export const listApplications = async (req, res) => {
  const { applications, pagination } = await applicationService.listApplications({
    supabase: req.supabase,
    userId: req.auth.user.id,
    filters: req.validatedQuery,
  });
  res.status(200).json({ data: applications, meta: { ...pagination, requestId: req.id } });
};

export const createApplication = async (req, res) => {
  const application = await applicationService.createApplication({
    supabase: req.supabase,
    userId: req.auth.user.id,
    input: req.validatedBody,
  });
  res.status(201).json({ data: { application } });
};

export const getApplication = async (req, res) => {
  const application = await applicationService.getApplication({
    supabase: req.supabase,
    userId: req.auth.user.id,
    applicationId: req.validatedParams.applicationId,
  });
  res.status(200).json({ data: { application } });
};

export const updateApplication = async (req, res) => {
  const application = await applicationService.updateApplication({
    supabase: req.supabase,
    userId: req.auth.user.id,
    applicationId: req.validatedParams.applicationId,
    changes: req.validatedBody,
  });
  res.status(200).json({ data: { application } });
};

export const updateChecklist = async (req, res) => {
  const application = await applicationService.updateChecklist({
    supabase: req.supabase,
    userId: req.auth.user.id,
    applicationId: req.validatedParams.applicationId,
    checklist: req.validatedBody.checklist,
  });
  res.status(200).json({ data: { application } });
};

export const deleteApplication = async (req, res) => {
  await applicationService.deleteApplication({
    supabase: req.supabase,
    userId: req.auth.user.id,
    applicationId: req.validatedParams.applicationId,
  });
  res.status(200).json({ data: { deleted: true } });
};
