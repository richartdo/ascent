import {
  coverLetterResultSchema,
  cvAnalysisResultSchema,
  essayAssistanceResultSchema,
  matchingResultSchema,
  opportunitySummaryResultSchema,
  readinessResultSchema,
} from "../../schemas/ai.schema.js";
import { normalizeAiProviderError, aiError } from "./errors.js";
import { loadMatchingCandidates, loadOpportunityContext, loadUsableProfile } from "./context.js";
import { prefilterOpportunities } from "./opportunityPrefilter.js";
import { buildCoverLetterPrompt } from "./prompts/coverLetter.prompt.js";
import { buildCvPrompt } from "./prompts/cv.prompt.js";
import { buildEssayPrompt } from "./prompts/essay.prompt.js";
import { buildMatchingPrompt } from "./prompts/matching.prompt.js";
import { buildReadinessPrompt } from "./prompts/readiness.prompt.js";
import { buildSummaryPrompt } from "./prompts/summary.prompt.js";
import { parseStructuredOutput } from "./structuredOutput.js";

const generate = async ({ provider, feature, prompt, schema }) => {
  try {
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

export const createAiService = ({ provider }) => ({
  configured: provider?.configured === true,

  async matchOpportunities({ supabase, userId, limit }) {
    const profile = await loadUsableProfile({ supabase, userId });
    const candidates = prefilterOpportunities({
      profile,
      opportunities: await loadMatchingCandidates({ supabase }),
      limit,
    });
    return Promise.all(
      candidates.map(({ opportunity, relevance }) =>
        generate({
          provider,
          feature: "opportunity_matching",
          prompt: buildMatchingPrompt({ profile, candidate: { ...opportunity, relevance } }),
          schema: matchingResultSchema,
        }),
      ),
    );
  },

  async summarizeOpportunity({ supabase, opportunityId }) {
    const opportunity = await loadOpportunityContext({ supabase, opportunityId });
    return generate({
      provider,
      feature: "opportunity_summary",
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
      feature: "readiness",
      prompt: buildReadinessPrompt({ profile, opportunity }),
      schema: readinessResultSchema,
    });
  },

  analyzeCv({ cvText }) {
    return generate({ provider, feature: "cv_analysis", prompt: buildCvPrompt({ cvText }), schema: cvAnalysisResultSchema });
  },

  async generateCoverLetter({ supabase, userId, opportunityId, tone, instructions }) {
    const [profile, opportunity] = await Promise.all([
      loadUsableProfile({ supabase, userId }),
      loadOpportunityContext({ supabase, opportunityId }),
    ]);
    return generate({
      provider,
      feature: "cover_letter",
      prompt: buildCoverLetterPrompt({ profile, opportunity, tone, instructions }),
      schema: coverLetterResultSchema,
    });
  },

  assistEssay({ mode, prompt, draft }) {
    return generate({ provider, feature: "essay_assistance", prompt: buildEssayPrompt({ mode, prompt, draft }), schema: essayAssistanceResultSchema });
  },
});
