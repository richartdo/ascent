import * as opportunityService from "../services/opportunity.service.js";

export const listOpportunities = async (req, res) => {
  const { opportunities, pagination } = await opportunityService.listOpportunities({
    supabase: req.supabase,
    filters: req.validatedQuery,
  });
  res.status(200).json({ data: opportunities, meta: { ...pagination, requestId: req.id } });
};

export const getOpportunity = async (req, res) => {
  const opportunity = await opportunityService.getOpportunity({
    supabase: req.supabase,
    opportunityId: req.validatedParams.opportunityId,
  });
  res.status(200).json({ data: { opportunity } });
};
