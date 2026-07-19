export const createAiController = (aiService) => ({
  matchOpportunities: async (req, res) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once("aborted", abort);
    try {
      const matches = await aiService.matchOpportunities({
        supabase: req.supabase,
        userId: req.auth.user.id,
        limit: req.validatedBody.limit,
        requestId: req.id,
        signal: controller.signal,
      });
      res.status(200).json({ data: { matches }, meta: { requestId: req.id } });
    } finally {
      req.removeListener("aborted", abort);
    }
  },
  summarizeOpportunity: async (req, res) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once("aborted", abort);
    try {
      const summary = await aiService.summarizeOpportunity({
        supabase: req.supabase, opportunityId: req.validatedParams.opportunityId,
        requestId: req.id, signal: controller.signal,
      });
      res.status(200).json({ data: { summary }, meta: { requestId: req.id } });
    } finally { req.removeListener("aborted", abort); }
  },
  assessReadiness: async (req, res) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once("aborted", abort);
    try {
      const readiness = await aiService.assessReadiness({
        supabase: req.supabase, userId: req.auth.user.id,
        opportunityId: req.validatedParams.opportunityId, requestId: req.id,
        signal: controller.signal,
      });
      res.status(200).json({ data: { readiness }, meta: { requestId: req.id } });
    } finally { req.removeListener("aborted", abort); }
  },
  analyzeCv: async (req, res) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once("aborted", abort);
    try {
      const analysis = await aiService.analyzeCv({
        supabase: req.supabase, ...req.validatedBody, requestId: req.id,
        signal: controller.signal,
      });
      res.status(200).json({ data: { analysis }, meta: { requestId: req.id } });
    } finally { req.removeListener("aborted", abort); }
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
