import { z } from "zod";
import type { AiReviewCriterion } from "@shared/schema";

export const criterionImportance = ["required", "preferred", "informational"] as const;
export const criterionSource = ["manual", "ai_suggested"] as const;

export const criterionInputSchema = z.object({
  title: z.string().trim().min(3).max(255),
  evaluationInstruction: z.string().trim().min(3).max(2000),
  importance: z.enum(criterionImportance),
  source: z.enum(criterionSource).default("manual"),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const criterionSuggestionSchema = z.array(criterionInputSchema.extend({
  source: z.literal("ai_suggested"),
})).min(1).max(12);

const unsafeCriterionPattern = /\b(race|racial|ethnicity|ethnic|religion|religious|muslim|christian|hindu|jewish|gender|male|female|sex|sexual orientation|gay|lesbian|disability|disabled|health|healthy|age|young|older|married|marital|family status|pregnant|political|union|trade union|appearance|attractive|nationality|culture fit|cultural fit)\b/i;

export function validateCriterionSafety(input: { title: string; evaluationInstruction: string }) {
  const combined = `${input.title} ${input.evaluationInstruction}`;
  if (unsafeCriterionPattern.test(combined)) {
    return "Criterion appears to reference protected or irrelevant personal characteristics";
  }
  return null;
}

export function normalizeCriteriaForSnapshot(criteria: AiReviewCriterion[]) {
  return criteria
    .filter((criterion) => criterion.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((criterion) => ({
      id: criterion.id,
      title: criterion.title,
      evaluationInstruction: criterion.evaluationInstruction,
      importance: criterion.importance,
      source: criterion.source,
      sortOrder: criterion.sortOrder,
    }));
}

export function deriveReviewBand(criteria: Array<{ importance: string; status: string }>) {
  const required = criteria.filter((criterion) => criterion.importance === "required");
  const considered = criteria.filter((criterion) => criterion.importance !== "informational");
  if (required.some((criterion) => criterion.status === "not_met")) return "required_gap_evidenced";
  if (considered.length === 0 || considered.every((criterion) => criterion.status === "not_evidenced" || criterion.status === "not_applicable")) return "insufficient_evidence";
  if (required.some((criterion) => criterion.status === "not_evidenced" || criterion.status === "partially_met")) return "clarify_required";
  if (considered.some((criterion) => criterion.status === "partially_met" || criterion.status === "not_evidenced")) return "clarify_required";
  return "strong_evidence";
}
