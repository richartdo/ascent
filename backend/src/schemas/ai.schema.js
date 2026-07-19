import { z } from "zod";

import { env } from "../config/env.js";

export const AI_SCHEMA_VERSION = "1.0";
export const MATCH_DISCLAIMER = "This assessment is guidance, not an eligibility guarantee.";
export const SUMMARY_DISCLAIMER = "This summary is guidance; verify all details with the official opportunity source.";
export const READINESS_DISCLAIMER = "This readiness assessment is guidance, not a guarantee of eligibility or selection.";
export const CV_DISCLAIMER = "This analysis is guidance and does not guarantee application or employment success.";
export const COVER_LETTER_DISCLAIMER = "This draft requires your review and does not guarantee application success.";
export const ESSAY_DISCLAIMER = "This assistance requires your review and does not guarantee selection or funding.";

const boundedText = (maximum) => z.string().trim().min(1).max(maximum);
const boundedList = (maximumItems, maximumLength = 300) =>
  z.array(boundedText(maximumLength)).max(maximumItems);
const outcomeGuaranteePattern = /\b(?:guaranteed|guarantees|certain to|will (?:be )?(?:eligible|selected|accepted|funded|successful)|will receive funding)\b/i;
const rejectOutcomeGuarantees = (schema) => schema.superRefine((value, context) => {
  const visit = (candidate, path = []) => {
    if (typeof candidate === "string" && outcomeGuaranteePattern.test(candidate)) {
      context.addIssue({
        code: "custom",
        path,
        message: "Outcome guarantees are not allowed.",
      });
      return;
    }
    if (Array.isArray(candidate)) candidate.forEach((item, index) => visit(item, [...path, index]));
    else if (candidate && typeof candidate === "object") {
      Object.entries(candidate).forEach(([key, item]) => visit(item, [...path, key]));
    }
  };
  visit(value);
});
const opportunityIdParamsSchema = z.object({ opportunityId: z.string().uuid() }).strict();

export { opportunityIdParamsSchema as aiOpportunityIdParamsSchema };

export const opportunityMatchesRequestSchema = z
  .object({ limit: z.number().int().min(1).max(25).default(10) })
  .strict();
export const emptyAiRequestSchema = z.preprocess(
  (value) => (value === undefined ? {} : value),
  z.object({}).strict(),
);
export const cvAnalysisRequestSchema = z
  .object({
    cvText: boundedText(Math.min(env.AI_TEXT_MAX_LENGTH, 20_000)),
    opportunityId: z.string().uuid().optional(),
  })
  .strict();
export const coverLetterRequestSchema = z
  .object({
    tone: z.enum(["professional", "warm", "concise"]).default("professional"),
    instructions: boundedText(1000).optional(),
  })
  .strict();
export const essayAssistanceRequestSchema = z
  .object({
    mode: z.enum(["brainstorm", "outline", "feedback", "revise"]),
    prompt: boundedText(3000),
    draft: boundedText(env.AI_TEXT_MAX_LENGTH).optional(),
  })
  .strict();

export const matchingResultSchema = rejectOutcomeGuarantees(z
  .object({
    schemaVersion: z.literal(AI_SCHEMA_VERSION),
    opportunityId: z.string().uuid(),
    matchScore: z.number().int().min(0).max(100),
    eligibilityAssessment: z.enum(["likely", "uncertain", "unlikely"]),
    reasons: boundedList(10),
    matchedCriteria: boundedList(10),
    gaps: boundedList(10),
    disclaimer: z.literal(MATCH_DISCLAIMER),
  })
  .strict());

export const opportunitySummaryResultSchema = rejectOutcomeGuarantees(z
  .object({
    schemaVersion: z.literal(AI_SCHEMA_VERSION),
    opportunityId: z.string().uuid(),
    summary: boundedText(1500),
    eligibilityHighlights: boundedList(10),
    benefits: boundedList(10),
    deadlineNotes: boundedText(500),
    missingInformation: boundedList(10),
    disclaimer: z.literal(SUMMARY_DISCLAIMER),
  })
  .strict());

export const readinessResultSchema = rejectOutcomeGuarantees(z
  .object({
    schemaVersion: z.literal(AI_SCHEMA_VERSION),
    opportunityId: z.string().uuid(),
    readinessScore: z.number().int().min(0).max(100),
    assessment: z.enum(["ready", "needs_preparation", "substantial_gaps"]),
    eligibilityAssessment: z.enum(["likely", "uncertain", "unlikely"]),
    components: z.object({
      profileCompleteness: z.object({ earned: z.number().int().min(0).max(30), maximum: z.literal(30) }).strict(),
      eligibilityCompatibility: z.object({ earned: z.number().int().min(0).max(30), maximum: z.literal(30) }).strict(),
      preferenceFit: z.object({ earned: z.number().int().min(0).max(20), maximum: z.literal(20) }).strict(),
      skillEvidence: z.object({ earned: z.number().int().min(0).max(20), maximum: z.literal(20) }).strict(),
    }).strict(),
    explanation: boundedText(1200),
    strengths: boundedList(10),
    gaps: boundedList(10),
    actions: boundedList(10),
    missingInformation: boundedList(10),
    disclaimer: z.literal(READINESS_DISCLAIMER),
  })
  .strict());

export const cvAnalysisResultSchema = rejectOutcomeGuarantees(z
  .object({
    schemaVersion: z.literal(AI_SCHEMA_VERSION),
    analysisScope: z.enum(["general", "opportunity_specific"]),
    opportunityId: z.string().uuid().nullable(),
    strengths: boundedList(12),
    relevantEvidence: boundedList(12),
    gaps: boundedList(12),
    suggestions: boundedList(12),
    missingInformation: boundedList(12),
    disclaimer: z.literal(CV_DISCLAIMER),
  })
  .strict());

export const coverLetterResultSchema = rejectOutcomeGuarantees(z
  .object({
    schemaVersion: z.literal(AI_SCHEMA_VERSION),
    opportunityId: z.string().uuid(),
    coverLetter: boundedText(env.AI_TEXT_MAX_LENGTH),
    assumptions: boundedList(8),
    disclaimer: z.literal(COVER_LETTER_DISCLAIMER),
  })
  .strict());

export const essayAssistanceResultSchema = rejectOutcomeGuarantees(z
  .object({
    schemaVersion: z.literal(AI_SCHEMA_VERSION),
    mode: z.enum(["brainstorm", "outline", "feedback", "revise"]),
    assistance: boundedText(env.AI_TEXT_MAX_LENGTH),
    suggestions: boundedList(12),
    disclaimer: z.literal(ESSAY_DISCLAIMER),
  })
  .strict());

export const aiResultSchemas = Object.freeze({
  opportunityMatching: matchingResultSchema,
  opportunitySummary: opportunitySummaryResultSchema,
  readiness: readinessResultSchema,
  cvAnalysis: cvAnalysisResultSchema,
  coverLetter: coverLetterResultSchema,
  essayAssistance: essayAssistanceResultSchema,
});
