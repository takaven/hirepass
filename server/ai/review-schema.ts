import { z } from "zod";

export const evidenceSchema = z.object({
  source: z.enum(["cv", "profile"]),
  documentId: z.number().int().positive().optional(),
  field: z.string().max(100).optional(),
  excerpt: z.string().trim().min(1).max(500),
});

export const criterionResultSchema = z.object({
  criterionId: z.number().int().positive(),
  status: z.enum(["met", "partially_met", "not_met", "not_evidenced", "not_applicable"]),
  evidence: z.array(evidenceSchema).max(5).default([]),
  rationale: z.string().trim().min(1).max(1000),
  gaps: z.array(z.string().trim().min(1).max(300)).max(5).default([]),
});

export const candidateReviewResultSchema = z.object({
  criteria: z.array(criterionResultSchema).min(1),
  strengths: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  materialGaps: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  clarificationQuestions: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  summary: z.string().trim().min(1).max(1200),
}).strict();

export type CandidateReviewResult = z.infer<typeof candidateReviewResultSchema>;

const protectedOutputPattern = /\b(race|racial|ethnicity|ethnic|religion|religious|muslim|christian|hindu|jewish|gender|male|female|sex|sexual orientation|gay|lesbian|disability|disabled|health|healthy|age|young|older|married|marital|family status|pregnant|political|union|trade union|appearance|attractive|nationality|culture fit|cultural fit)\b/i;
const allowedProfileEvidenceFields = new Set(["currentTitle", "currentCompany", "experienceYears", "skills"]);

export function normalizeEvidenceText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function validateCriterionCoverage(result: CandidateReviewResult, criteriaSnapshot: Array<{ id: number; importance?: string }>) {
  const expected = new Set(criteriaSnapshot.map((criterion) => criterion.id));
  const seen = new Set<number>();
  for (const criterion of result.criteria) {
    if (!expected.has(criterion.criterionId)) return false;
    if (seen.has(criterion.criterionId)) return false;
    seen.add(criterion.criterionId);
    const source = criteriaSnapshot.find((item) => item.id === criterion.criterionId);
    if (source?.importance === "required" && criterion.status === "not_applicable") return false;
  }
  return seen.size === expected.size;
}

export function validateProtectedOutput(result: CandidateReviewResult) {
  return !protectedOutputPattern.test(JSON.stringify(result));
}

export function validateEvidence(result: CandidateReviewResult, documentId: number, cvText: string, profile: Record<string, unknown> = {}) {
  const normalizedCv = normalizeEvidenceText(cvText);
  for (const criterion of result.criteria) {
    for (const evidence of criterion.evidence) {
      if (evidence.source === "cv") {
        if (evidence.documentId !== documentId) return false;
        if (!normalizedCv.includes(normalizeEvidenceText(evidence.excerpt))) return false;
      } else if (evidence.source === "profile") {
        if (!evidence.field || !allowedProfileEvidenceFields.has(evidence.field)) return false;
        const raw = profile[evidence.field];
        const fieldText = Array.isArray(raw) ? raw.join(" ") : raw == null ? "" : String(raw);
        if (!normalizeEvidenceText(fieldText).includes(normalizeEvidenceText(evidence.excerpt))) return false;
      }
    }
  }
  return true;
}
