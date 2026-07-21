import {
  AI_SCHEMA_VERSION,
  CV_DISCLAIMER,
  MATCH_DISCLAIMER,
  READINESS_DISCLAIMER,
  SUMMARY_DISCLAIMER,
  cvAnalysisResultSchema,
  matchingResultSchema,
  opportunitySummaryResultSchema,
  readinessResultSchema,
} from "../../schemas/ai.schema.js";
import { env } from "../../config/env.js";
import { normalizeAiProviderError, aiError } from "./errors.js";
import { loadMatchingCandidates, loadOpportunityContext, loadUsableMatchingProfile, loadUsableProfile } from "./context.js";
import { prefilterOpportunities } from "./opportunityPrefilter.js";
import { buildDeterministicMatch, mapOpportunityFeatures } from "./opportunityFeatureMapper.js";
import { AI_FEATURES } from "./provider.js";
import { mapOpportunityForGeneration, mapProfileForGeneration } from "./generationInputMapper.js";
import { calculateReadiness } from "./readinessScoring.js";

const requireProviderMethod = (provider, feature, method) => {
  if (!provider?.supports?.(feature) || typeof provider[method] !== "function") {
    throw aiError("AI features are temporarily unavailable.", 503, "AI_NOT_CONFIGURED");
  }
};

const relevanceTotal = ({ relevance }) => Object.values(relevance).reduce((sum, value) => sum + value, 0);

const mapWithConcurrency = async ({ items, concurrency, signal, worker }) => {
  const controller = new AbortController();
  let nextIndex = 0;
  let failure;
  const abort = () => {
    failure ??= aiError("The AI service is temporarily unavailable.", 503, "AI_SERVICE_UNAVAILABLE");
    controller.abort();
  };
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const results = new Array(items.length);
  const run = async () => {
    while (!failure && nextIndex < items.length) {
      const index = nextIndex++;
      try { results[index] = await worker(items[index], controller.signal); }
      catch (error) { failure = error; controller.abort(); }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
    if (failure) throw failure;
    return results;
  } finally { signal?.removeEventListener("abort", abort); }
};

export const createAiService = ({
  provider,
  maxCandidates = env.MODEL_SERVICE_MAX_CANDIDATES,
  concurrency = env.MODEL_SERVICE_CONCURRENCY,
} = {}) => ({
  configured: provider?.configured === true,
  supports: (feature) => provider?.configured === true && provider.supports?.(feature) === true,

  async matchOpportunities({ supabase, userId, limit, requestId, signal, now = new Date() }) {
    const profile = await loadUsableMatchingProfile({ supabase, userId, now });
    const candidates = prefilterOpportunities({
      profile, opportunities: await loadMatchingCandidates({ supabase, now }), now,
      limit: Math.min(limit, maxCandidates),
    });
    if (candidates.length === 0) return [];
    try {
      const ranked = await mapWithConcurrency({
        items: candidates,
        concurrency,
        signal,
        worker: async (candidate, batchSignal) => {
          const features = mapOpportunityFeatures({ profile, candidate, now });
          const modelResult = await provider.matchOpportunity({ features, requestId, signal: batchSignal });
          return {
            candidate,
            result: matchingResultSchema.parse(buildDeterministicMatch({ candidate, features, modelResult })),
          };
        },
      });
      return ranked
        .sort((left, right) => right.result.matchScore - left.result.matchScore ||
          relevanceTotal(right.candidate) - relevanceTotal(left.candidate) ||
          left.result.opportunityId.localeCompare(right.result.opportunityId))
        .map(({ result }) => ({ ...result, disclaimer: MATCH_DISCLAIMER }));
    } catch (error) { throw normalizeAiProviderError(error); }
  },

  async summarizeOpportunity({ supabase, opportunityId, requestId, signal }) {
    requireProviderMethod(provider, AI_FEATURES.SUMMARY, "summarizeOpportunity");
    const opportunity = await loadOpportunityContext({ supabase, opportunityId });
    try {
      const generated = await provider.summarizeOpportunity({
        input: { opportunity: mapOpportunityForGeneration(opportunity) }, requestId, signal,
      });
      return opportunitySummaryResultSchema.parse({
        schemaVersion: AI_SCHEMA_VERSION,
        opportunityId,
        summary: generated.overview,
        eligibilityHighlights: generated.eligibilityHighlights,
        benefits: generated.benefits,
        deadlineNotes: generated.deadlineNotes,
        missingInformation: generated.missingInformation,
        disclaimer: SUMMARY_DISCLAIMER,
      });
    } catch (error) { throw normalizeAiProviderError(error); }
  },

  async assessReadiness({ supabase, userId, opportunityId, requestId, signal, now = new Date() }) {
    requireProviderMethod(provider, AI_FEATURES.READINESS, "assessReadiness");
    const [profile, opportunity] = await Promise.all([
      loadUsableProfile({ supabase, userId }),
      loadOpportunityContext({ supabase, opportunityId }),
    ]);
    const deterministic = calculateReadiness({ profile, opportunity, now });
    try {
      const generated = await provider.assessReadiness({
        input: {
          profile: mapProfileForGeneration(profile),
          opportunity: mapOpportunityForGeneration(opportunity),
        },
        requestId,
        signal,
      });
      return readinessResultSchema.parse({
        schemaVersion: AI_SCHEMA_VERSION,
        opportunityId,
        readinessScore: deterministic.readinessScore,
        assessment: deterministic.assessment,
        eligibilityAssessment: deterministic.eligibilityAssessment,
        components: deterministic.components,
        explanation: generated.readinessAssessment,
        strengths: generated.strengths,
        gaps: [...deterministic.hardIncompatibilities, ...generated.gaps].slice(0, 10),
        actions: generated.nextActions,
        missingInformation: deterministic.missingInformation,
        disclaimer: READINESS_DISCLAIMER,
      });
    } catch (error) { throw normalizeAiProviderError(error); }
  },

  async analyzeCv({ supabase, cvText, opportunityId, requestId, signal }) {
    requireProviderMethod(provider, AI_FEATURES.CV, "analyzeCv");
    const opportunity = opportunityId
      ? await loadOpportunityContext({ supabase, opportunityId })
      : null;
    try {
      const generated = await provider.analyzeCv({
        input: {
          cvText,
          ...(opportunity ? { opportunity: mapOpportunityForGeneration(opportunity) } : {}),
        },
        requestId,
        signal,
      });
      return cvAnalysisResultSchema.parse({
        schemaVersion: AI_SCHEMA_VERSION,
        analysisScope: opportunity ? "opportunity_specific" : "general",
        opportunityId: opportunity?.id ?? null,
        strengths: generated.strengths,
        relevantEvidence: generated.relevantEvidence,
        gaps: generated.gaps,
        suggestions: generated.suggestions,
        missingInformation: generated.missingInformation,
        inputCoverage: generated.inputCoverage,
        disclaimer: CV_DISCLAIMER,
      });
    } catch (error) { throw normalizeAiProviderError(error); }
  },
});
