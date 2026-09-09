import { z } from "zod";

export const evidenceSchema = z.object({
  source: z.enum(["cv", "profile", "application"]),
  documentId: z.number().int().positive().optional(),
  pageNumber: z.number().int().positive().optional(),
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

export function normalizeEvidenceText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function validateEvidence(result: CandidateReviewResult, documentId: number, cvText: string) {
  const normalizedCv = normalizeEvidenceText(cvText);
  for (const criterion of result.criteria) {
    for (const evidence of criterion.evidence) {
      if (evidence.source === "cv") {
        if (evidence.documentId !== documentId) return false;
        if (!normalizedCv.includes(normalizeEvidenceText(evidence.excerpt))) return false;
      }
    }
  }
  return true;
}
