import {
  coverLetterResultSchema,
  cvAnalysisResultSchema,
  essayAssistanceResultSchema,
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
import { buildCoverLetterPrompt } from "./prompts/coverLetter.prompt.js";
import { buildCvPrompt } from "./prompts/cv.prompt.js";
import { buildEssayPrompt } from "./prompts/essay.prompt.js";
import { buildReadinessPrompt } from "./prompts/readiness.prompt.js";
import { buildSummaryPrompt } from "./prompts/summary.prompt.js";
import { parseStructuredOutput } from "./structuredOutput.js";

const generate = async ({ provider, feature, prompt, schema }) => {
  try {
    if (!provider?.supports?.(feature) || typeof provider.generateStructured !== "function") {
      throw aiError("AI features are temporarily unavailable.", 503, "AI_NOT_CONFIGURED");
    }
    const output = await provider.generateStructured({ feature, prompt, schema, timeoutMs: 20_000 });
    const parsed = parseStructuredOutput({ output, schema });
    if (parsed.kind === "refusal") {
      throw aiError("The AI service could not complete this request.", 422, "AI_REFUSED");
    }
    return parsed.data;
  } catch (error) {
    if (error?.code === "AI_REFUSED") throw error;
    throw normalizeAiProviderError(error);
  }
};

const relevanceTotal = ({ relevance }) =>
  Object.values(relevance).reduce((sum, value) => sum + value, 0);

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
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await worker(items[index], controller.signal);
      } catch (error) {
        failure = error;
        controller.abort();
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
    if (failure) throw failure;
    return results;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
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
      profile,
      opportunities: await loadMatchingCandidates({ supabase, now }),
      now,
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
          const modelResult = await provider.matchOpportunity({
            features,
            requestId,
            signal: batchSignal,
          });
          return {
            candidate,
            result: matchingResultSchema.parse(buildDeterministicMatch({ candidate, features, modelResult })),
          };
        },
      });
      return ranked
        .sort((left, right) =>
          right.result.matchScore - left.result.matchScore ||
          relevanceTotal(right.candidate) - relevanceTotal(left.candidate) ||
          left.result.opportunityId.localeCompare(right.result.opportunityId))
        .map(({ result }) => result);
    } catch (error) {
      throw normalizeAiProviderError(error);
    }
  },

  async summarizeOpportunity({ supabase, opportunityId }) {
    const opportunity = await loadOpportunityContext({ supabase, opportunityId });
    return generate({
      provider,
      feature: AI_FEATURES.SUMMARY,
      prompt: buildSummaryPrompt({ opportunity }),
      schema: opportunitySummaryResultSchema,
    });
  },

  async assessReadiness({ supabase, userId, opportunityId }) {
    const [profile, opportunity] = await Promise.all([
      loadUsableProfile({ supabase, userId }),
      loadOpportunityContext({ supabase, opportunityId }),
    ]);
    return generate({
      provider,
      feature: AI_FEATURES.READINESS,
      prompt: buildReadinessPrompt({ profile, opportunity }),
      schema: readinessResultSchema,
    });
  },

  analyzeCv({ cvText }) {
    return generate({ provider, feature: AI_FEATURES.CV, prompt: buildCvPrompt({ cvText }), schema: cvAnalysisResultSchema });
  },

  async generateCoverLetter({ supabase, userId, opportunityId, tone, instructions }) {
    const [profile, opportunity] = await Promise.all([
      loadUsableProfile({ supabase, userId }),
      loadOpportunityContext({ supabase, opportunityId }),
    ]);
    return generate({
      provider,
      feature: AI_FEATURES.COVER_LETTER,
      prompt: buildCoverLetterPrompt({ profile, opportunity, tone, instructions }),
      schema: coverLetterResultSchema,
    });
  },

  assistEssay({ mode, prompt, draft }) {
    return generate({ provider, feature: AI_FEATURES.ESSAY, prompt: buildEssayPrompt({ mode, prompt, draft }), schema: essayAssistanceResultSchema });
  },
});
