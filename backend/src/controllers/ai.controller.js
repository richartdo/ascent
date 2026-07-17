export const createAiController = (aiService) => ({
  matchOpportunities: async (req, res) => {
    const matches = await aiService.matchOpportunities({
      supabase: req.supabase,
      userId: req.auth.user.id,
      limit: req.validatedBody.limit,
    });
    res.status(200).json({ data: { matches } });
  },
  summarizeOpportunity: async (req, res) => {
    const summary = await aiService.summarizeOpportunity({
      supabase: req.supabase,
      opportunityId: req.validatedParams.opportunityId,
    });
    res.status(200).json({ data: { summary } });
  },
  assessReadiness: async (req, res) => {
    const readiness = await aiService.assessReadiness({
      supabase: req.supabase,
      userId: req.auth.user.id,
      opportunityId: req.validatedParams.opportunityId,
    });
    res.status(200).json({ data: { readiness } });
  },
  analyzeCv: async (req, res) => {
    const analysis = await aiService.analyzeCv(req.validatedBody);
    res.status(200).json({ data: { analysis } });
  },
  generateCoverLetter: async (req, res) => {
    const coverLetter = await aiService.generateCoverLetter({
      supabase: req.supabase,
      userId: req.auth.user.id,
      opportunityId: req.validatedParams.opportunityId,
      ...req.validatedBody,
    });
    res.status(200).json({ data: { coverLetter } });
  },
  assistEssay: async (req, res) => {
    const assistance = await aiService.assistEssay(req.validatedBody);
    res.status(200).json({ data: { assistance } });
  },
});
