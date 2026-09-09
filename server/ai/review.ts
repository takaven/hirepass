import { randomUUID } from "crypto";
import type { AiCandidateReview, Document, Pass, PassCandidate, Candidate } from "@shared/schema";
import { storage } from "../storage";
import { extractPdfText, AI_EXTRACTION_VERSION } from "./extraction";
import { AI_PROMPT_VERSION, AI_SCHEMA_VERSION, AI_REVIEW_RULE_VERSION, getAiConfig } from "./config";
import { deriveReviewBand, normalizeCriteriaForSnapshot } from "./criteria";
import { candidateReviewResultSchema, validateEvidence } from "./review-schema";
import { reviewCandidateWithAnthropic, type AiReviewRequest } from "./provider";

export async function resolveReviewDocument(passCandidate: PassCandidate, candidate: Candidate): Promise<Document | null> {
  const docs = await storage.getDocumentsByCandidate(candidate.id);
  const applicationCv = docs.find((doc) => doc.docType === "cv" && doc.passCandidateId === passCandidate.id && doc.filePath);
  if (applicationCv) return applicationCv;
  return docs.find((doc) => doc.docType === "cv" && doc.filePath === candidate.cvFilePath && doc.filePath) ?? null;
}

export async function queueReviewForApplication(passCandidateId: number, force = false) {
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
  const latest = await storage.getLatestAiReview(passCandidate.id);
  if (!force && latest && ["pending", "processing", "completed"].includes(latest.status) && latest.documentId === document.id && latest.criteriaVersion === criteriaVersion && latest.promptVersion === AI_PROMPT_VERSION && latest.schemaVersion === AI_SCHEMA_VERSION && latest.reviewRuleVersion === AI_REVIEW_RULE_VERSION) {
    return { queued: false, reason: "current_review_exists", review: latest };
  }
  if (latest?.status === "completed") await storage.updateAiReview(latest.id, { status: "stale", staleReason: "new_review_queued" });
  const review = await storage.createAiReview({
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
  });
  return { queued: true, review };
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

export async function processAiReview(review: AiCandidateReview) {
  const started = Date.now();
  try {
    const pass = await storage.getPass(review.passId);
    const candidate = await storage.getCandidate(review.candidateId);
    const passCandidate = review.passCandidateId ? await storage.getPassCandidate(review.passCandidateId) : null;
    const document = review.documentId ? await storage.getDocument(review.documentId) : null;
    if (!pass || !candidate || !passCandidate || !document) throw new Error("review_target_missing");
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
    const request: AiReviewRequest = {
      criteria: (review.criteriaSnapshot as any[]).map((criterion) => ({
        id: criterion.id,
        title: criterion.title,
        evaluationInstruction: criterion.evaluationInstruction,
        importance: criterion.importance,
      })),
      vacancy: {
        title: pass.positionTitle,
        department: pass.department,
        location: pass.location,
        employmentType: pass.employmentType,
        experienceMin: pass.experienceMin,
        experienceMax: pass.experienceMax,
        jobDescription: pass.jobDescriptionFinal || pass.jobDescriptionDraft,
      },
      candidate: {
        name: candidate.name,
        currentTitle: candidate.currentTitle,
        currentCompany: candidate.currentCompany,
        experienceYears: candidate.experienceYears,
        skills: candidate.skills,
      },
      documentId: document.id,
      cvText: extracted.extractedText,
    };
    const ai = await reviewCandidateWithAnthropic(request);
    if (!validateEvidence(ai.result, document.id, extracted.extractedText)) throw new Error("evidence_validation_failed");
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
      safeErrorCode: error instanceof Error ? error.message.slice(0, 100) : "review_failed",
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
