import * as savedOpportunityService from "../services/savedOpportunity.service.js";

export const listSavedOpportunities = async (req, res) => {
  const { savedOpportunities, pagination } = await savedOpportunityService.listSavedOpportunities({
    supabase: req.supabase,
    userId: req.auth.user.id,
    pagination: req.validatedQuery,
  });
  res.status(200).json({ data: savedOpportunities, meta: { ...pagination, requestId: req.id } });
};

export const saveOpportunity = async (req, res) => {
  const savedOpportunity = await savedOpportunityService.saveOpportunity({
    supabase: req.supabase,
    userId: req.auth.user.id,
    opportunityId: req.validatedParams.opportunityId,
    notes: req.validatedBody.notes,
  });
  res.status(201).json({ data: { savedOpportunity } });
};

export const updateSavedOpportunity = async (req, res) => {
  const savedOpportunity = await savedOpportunityService.updateSavedOpportunity({
    supabase: req.supabase,
    userId: req.auth.user.id,
    opportunityId: req.validatedParams.opportunityId,
    notes: req.validatedBody.notes,
  });
  res.status(200).json({ data: { savedOpportunity } });
};

export const deleteSavedOpportunity = async (req, res) => {
  await savedOpportunityService.deleteSavedOpportunity({
    supabase: req.supabase,
    userId: req.auth.user.id,
    opportunityId: req.validatedParams.opportunityId,
  });
  res.status(200).json({ data: { deleted: true } });
};
