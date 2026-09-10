import { randomUUID } from "crypto";
import type { AiCandidateReview, Document, Pass, PassCandidate, Candidate } from "@shared/schema";
import { storage } from "../storage";
import { extractPdfText, AI_EXTRACTION_VERSION } from "./extraction";
import { AI_PROMPT_VERSION, AI_SCHEMA_VERSION, AI_REVIEW_RULE_VERSION, getAiConfig } from "./config";
import { deriveReviewBand, normalizeCriteriaForSnapshot } from "./criteria";
import { candidateReviewResultSchema, resolveProfileEvidenceFields, validateCriterionCoverage, validateEvidence, validateProtectedOutput, type CandidateReviewResult } from "./review-schema";
import { reviewCandidateWithAnthropic, type AiReviewRequest } from "./provider";

export async function resolveReviewDocument(passCandidate: PassCandidate, candidate: Candidate): Promise<Document | null> {
  const docs = await storage.getDocumentsByCandidate(candidate.id);
  const applicationCv = docs.find((doc) => doc.docType === "cv" && doc.passCandidateId === passCandidate.id && doc.filePath);
  if (applicationCv) return applicationCv;
  return docs.find((doc) => doc.docType === "cv" && doc.filePath === candidate.cvFilePath && doc.filePath) ?? null;
}

export async function queueReviewForApplication(passCandidateId: number, force = false) {
  const config = getAiConfig();
  if (!config.enabled) return { queued: false, reason: "ai_disabled" };
  if (!config.configured) return { queued: false, reason: "ai_unavailable" };
  const passCandidate = await storage.getPassCandidate(passCandidateId);
  if (!passCandidate) return { queued: false, reason: "application_not_found" };
  const pass = await storage.getPass(passCandidate.passId);
  const candidate = await storage.getCandidate(passCandidate.candidateId);
  if (!pass || !candidate || candidate.isAnonymized) return { queued: false, reason: "target_not_found" };
  const position = passCandidate.positionId ? await storage.getPassPosition(passCandidate.positionId) : null;
  if (passCandidate.positionId && !position) return { queued: false, reason: "position_not_found" };
  const criteriaVersion = passCandidate.positionId ? position!.aiCriteriaVersion : pass.aiCriteriaVersion;
  const confirmedAt = passCandidate.positionId ? position!.aiCriteriaConfirmedAt : pass.aiCriteriaConfirmedAt;
  if (!confirmedAt || criteriaVersion <= 0) return { queued: false, reason: "criteria_not_confirmed" };
  const criteria = await storage.getAiCriteria(pass.id, passCandidate.positionId ?? null);
  if (!criteria.length) return { queued: false, reason: "criteria_missing" };
  const document = await resolveReviewDocument(passCandidate, candidate);
  if (!document?.filePath) return { queued: false, reason: "document_missing" };
  const queued = await storage.createAiReviewIfCurrentMissing({
    reviewType: "application",
    passId: pass.id,
    positionId: passCandidate.positionId ?? null,
    passCandidateId: passCandidate.id,
    candidateId: candidate.id,
    documentId: document.id,
    criteriaVersion,
    criteriaSnapshot: normalizeCriteriaForSnapshot(criteria),
    status: "pending",
    promptVersion: AI_PROMPT_VERSION,
    schemaVersion: AI_SCHEMA_VERSION,
    reviewRuleVersion: AI_REVIEW_RULE_VERSION,
  }, force);
  return queued.created ? { queued: true, review: queued.review } : { queued: false, reason: "current_review_exists", review: queued.review };
}

export async function queueLibraryMatchReview(input: { passId: number; candidateId: number; positionId?: number | null }, force = false) {
  const config = getAiConfig();
  if (!config.enabled) return { queued: false, reason: "ai_disabled" };
  if (!config.configured) return { queued: false, reason: "ai_unavailable" };
  const pass = await storage.getPass(input.passId);
  const candidate = await storage.getCandidate(input.candidateId);
  if (!pass || !candidate || candidate.isAnonymized) return { queued: false, reason: "target_not_found" };
  const attached = (await storage.getPassCandidates(pass.id)).some((application) => application.candidateId === candidate.id);
  if (attached) return { queued: false, reason: "already_attached" };
  const position = input.positionId ? await storage.getPassPosition(input.positionId) : null;
  if (input.positionId && !position) return { queued: false, reason: "position_not_found" };
  if (position && position.passId !== pass.id) return { queued: false, reason: "position_not_found" };
  const criteriaVersion = position ? position.aiCriteriaVersion : pass.aiCriteriaVersion;
  const confirmedAt = position ? position.aiCriteriaConfirmedAt : pass.aiCriteriaConfirmedAt;
  if (!confirmedAt || criteriaVersion <= 0) return { queued: false, reason: "criteria_not_confirmed" };
  const criteria = await storage.getAiCriteria(pass.id, input.positionId ?? null);
  if (!criteria.length) return { queued: false, reason: "criteria_missing" };
  const docs = await storage.getDocumentsByCandidate(candidate.id);
  const document = candidate.cvFilePath
    ? docs.find((doc) => doc.docType === "cv" && doc.filePath === candidate.cvFilePath && doc.filePath)
    : null;
  if (!document?.filePath) return { queued: false, reason: "current_cv_unavailable" };
  const queued = await storage.createAiReviewIfCurrentMissing({
    reviewType: "library_match",
    passId: pass.id,
    positionId: input.positionId ?? null,
    passCandidateId: null,
    candidateId: candidate.id,
    documentId: document.id,
    criteriaVersion,
    criteriaSnapshot: normalizeCriteriaForSnapshot(criteria),
    status: "pending",
    promptVersion: AI_PROMPT_VERSION,
    schemaVersion: AI_SCHEMA_VERSION,
    reviewRuleVersion: AI_REVIEW_RULE_VERSION,
  }, force);
  return queued.created ? { queued: true, review: queued.review } : { queued: false, reason: "current_review_exists", review: queued.review };
}

async function ensureExtractedText(document: Document) {
  if (document.extractionStatus === "completed" && document.extractedText) return document;
  if (!document.filePath) return document;
  const extraction = await extractPdfText(document.filePath);
  const updated = await storage.updateDocument(document.id, {
    extractedText: extraction.text,
    extractionStatus: extraction.status,
    extractionVersion: AI_EXTRACTION_VERSION,
    extractionErrorCode: extraction.errorCode ?? null,
    extractedAt: new Date(),
  } as Partial<Document>);
  return updated ?? document;
}

export function buildAiReviewRequest(input: {
  review: AiCandidateReview;
  pass: Pass;
  position?: any | null;
  candidate: Candidate;
  documentId: number;
  cvText: string;
}): AiReviewRequest {
  const profileEvidence = {
    currentTitle: input.candidate.currentTitle,
    currentCompany: input.candidate.currentCompany,
    experienceYears: input.candidate.experienceYears,
    skills: input.candidate.skills,
  };
  return {
    criteria: (input.review.criteriaSnapshot as any[]).map((criterion) => ({
      id: criterion.id,
      title: criterion.title,
      evaluationInstruction: criterion.evaluationInstruction,
      importance: criterion.importance,
    })),
    vacancy: {
      title: input.position?.positionTitle || input.pass.positionTitle,
      department: input.pass.department,
      location: input.pass.location,
      employmentType: input.pass.employmentType,
      experienceMin: input.position?.experienceMin ?? input.pass.experienceMin,
      experienceMax: input.position?.experienceMax ?? input.pass.experienceMax,
      requirements: input.position?.requirements,
      qualifications: input.position?.qualifications,
      jobDescription: input.position?.jobDescriptionFinal || input.pass.jobDescriptionFinal || input.pass.jobDescriptionDraft,
    },
    candidate: profileEvidence,
    documentId: input.documentId,
    cvText: input.cvText,
  };
}

export async function processAiReview(review: AiCandidateReview) {
  const started = Date.now();
  try {
    const pass = await storage.getPass(review.passId);
    const candidate = await storage.getCandidate(review.candidateId);
    const passCandidate = review.passCandidateId ? await storage.getPassCandidate(review.passCandidateId) : null;
    const document = review.documentId ? await storage.getDocument(review.documentId) : null;
    if (!pass || !candidate || (review.reviewType === "application" && !passCandidate) || !document) throw new Error("review_target_missing");
    const position = review.positionId ? await storage.getPassPosition(review.positionId) : null;
    const currentVersion = position ? position.aiCriteriaVersion : pass.aiCriteriaVersion;
    const currentConfirmedAt = position ? position.aiCriteriaConfirmedAt : pass.aiCriteriaConfirmedAt;
    if (!currentConfirmedAt || currentVersion !== review.criteriaVersion) {
      await storage.updateAiReview(review.id, { status: "stale", staleReason: "criteria_changed", completedAt: new Date() });
      return;
    }
    const extracted = await ensureExtractedText(document);
    if (extracted.extractionStatus !== "completed" || !extracted.extractedText) {
      const result = candidateReviewResultSchema.parse({
        criteria: (review.criteriaSnapshot as any[]).map((criterion) => ({
          criterionId: criterion.id,
          status: "not_evidenced",
          evidence: [],
          rationale: "CV text could not be extracted for AI-assisted review.",
          gaps: ["Manual CV review required"],
        })),
        strengths: [],
        materialGaps: ["No extractable CV text was available"],
        clarificationQuestions: ["Ask the candidate or hiring team to confirm the relevant experience manually."],
        summary: "AI review could not evaluate this application because the CV text was unavailable.",
      });
      await storage.updateAiReview(review.id, {
        status: "completed",
        result,
        reviewBand: "insufficient_evidence",
        provider: "local",
        model: "pdf-extraction",
        safeErrorCode: extracted.extractionErrorCode || "text_unavailable",
        latencyMs: Date.now() - started,
        completedAt: new Date(),
      });
      return;
    }
    const request = buildAiReviewRequest({ review, pass, position, candidate, documentId: document.id, cvText: extracted.extractedText });
    const profileEvidence = request.candidate;
    const ai = await reviewCandidateWithRepair(request, review.criteriaSnapshot as any[]);
    if (!validateReviewResult(ai.result, review.criteriaSnapshot as any[], document.id, extracted.extractedText, profileEvidence)) throw new Error("ai_output_invalid");
    const refreshedPass = await storage.getPass(review.passId);
    const refreshedPosition = review.positionId ? await storage.getPassPosition(review.positionId) : null;
    const refreshedVersion = refreshedPosition ? refreshedPosition.aiCriteriaVersion : refreshedPass?.aiCriteriaVersion;
    const latest = passCandidate
      ? await storage.getLatestAiReview(passCandidate.id)
      : await storage.getLatestLibraryMatch(review.passId, review.candidateId, review.positionId ?? null);
    const stillCurrent = latest?.id === review.id &&
      latest.documentId === document.id &&
      latest.criteriaVersion === refreshedVersion &&
      latest.promptVersion === AI_PROMPT_VERSION &&
      latest.schemaVersion === AI_SCHEMA_VERSION &&
      latest.reviewRuleVersion === AI_REVIEW_RULE_VERSION;
    if (!stillCurrent) {
      await storage.updateAiReview(review.id, { status: "stale", staleReason: "superseded_before_completion", completedAt: new Date() });
      return;
    }
    const band = deriveReviewBand(ai.result.criteria.map((criterion) => {
      const source = (review.criteriaSnapshot as any[]).find((item) => item.id === criterion.criterionId);
      return { importance: source?.importance || "required", status: criterion.status };
    }));
    await storage.updateAiReview(review.id, {
      status: "completed",
      result: ai.result,
      reviewBand: band,
      provider: ai.provider,
      model: ai.model,
      inputTokens: ai.inputTokens ?? null,
      outputTokens: ai.outputTokens ?? null,
      latencyMs: Date.now() - started,
      completedAt: new Date(),
      safeErrorCode: null,
    });
  } catch (error) {
    await storage.updateAiReview(review.id, {
      status: "failed",
      safeErrorCode: safeAiErrorCode(error),
      latencyMs: Date.now() - started,
      completedAt: new Date(),
    });
  }
}

export async function processPendingAiReviews() {
  const config = getAiConfig();
  if (!config.configured) return { processed: 0 };
  const workerId = randomUUID();
  const reviews = await storage.claimPendingAiReviews(Math.min(config.maxBatch, 2), workerId);
  for (const review of reviews) await processAiReview(review);
  return { processed: reviews.length };
}

export function validateReviewResult(result: CandidateReviewResult, criteriaSnapshot: Array<{ id: number; importance?: string }>, documentId: number, cvText: string, profile: Record<string, unknown>) {
  return validateCriterionCoverage(result, criteriaSnapshot) &&
    validateEvidence(result, documentId, cvText, profile) &&
    validateProtectedOutput(result);
}

export function aiValidationFailureReason(result: CandidateReviewResult, criteriaSnapshot: Array<{ id: number; importance?: string }>, documentId: number, cvText: string, profile: Record<string, unknown>) {
  if (!validateCriterionCoverage(result, criteriaSnapshot)) return "criterion_coverage_invalid";
  if (!validateEvidence(result, documentId, cvText, profile)) return "evidence_invalid";
  if (!validateProtectedOutput(result)) return "protected_output_invalid";
  return null;
}

function repairInstruction(reason: string) {
  if (reason === "schema_invalid") return "Your previous tool output did not satisfy the required output contract. Return only values within the declared schema constraints.";
  if (reason === "criterion_coverage_invalid") return "Return each confirmed criterion exactly once using its supplied criterionId. Do not add, duplicate, or omit criteria.";
  if (reason === "evidence_invalid") return "One or more evidence excerpts could not be verified against the supplied source. For CV evidence, use a short verbatim excerpt copied from the supplied CV and the supplied CV document ID. If no exact supporting excerpt exists, return no evidence and use not_evidenced.";
  if (reason === "protected_output_invalid") return "Do not use protected or irrelevant personal characteristics in rationale, gaps, strengths, summary, or questions. Evaluate only the confirmed role criteria.";
  return "Return a valid evidence-backed review using only the supplied role criteria and source evidence.";
}

export async function reviewCandidateWithRepair(
  request: AiReviewRequest,
  criteriaSnapshot: Array<{ id: number; importance?: string }>,
  reviewer: typeof reviewCandidateWithAnthropic = reviewCandidateWithAnthropic,
) {
  let lastError: unknown;
  let nextRepairInstruction: string | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const ai = await reviewer(request, nextRepairInstruction);
      const schema = candidateReviewResultSchema.safeParse(ai.result);
      if (!schema.success) {
        nextRepairInstruction = repairInstruction("schema_invalid");
        throw new Error("schema_invalid");
      }
      const parsed = resolveProfileEvidenceFields(schema.data, request.candidate);
      const reason = aiValidationFailureReason(parsed, criteriaSnapshot, request.documentId, request.cvText, request.candidate);
      if (reason) {
        nextRepairInstruction = repairInstruction(reason);
        throw new Error(reason);
      }
      return { ...ai, result: parsed };
    } catch (error) {
      lastError = error;
      if (safeAiErrorCode(error) === "ai_not_configured") break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("ai_output_invalid");
}

export function safeAiErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("timeout")) return "ai_timeout";
  if (message.includes("rate")) return "ai_rate_limited";
  if (message.includes("configured")) return "ai_not_configured";
  if (message.includes("validation") || message.includes("malformed") || message.includes("invalid") || message.includes("evidence")) return "ai_output_invalid";
  return "ai_provider_unavailable";
}
