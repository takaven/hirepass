import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { pool } from "./db";
import { eraseCandidatePii } from "./candidate-privacy";
import { storeCandidateCvUpload } from "./document-files";
import { saveInternalCandidateCv } from "./internal-cv";
import { queueReviewForApplication } from "./ai/review";
import { storage } from "./storage";

const uploadDir = await mkdtemp(path.join(tmpdir(), "hirepass-phase-four-"));
process.env.HIREPASS_UPLOAD_DIR = uploadDir;
const pdf = (label: string) => Buffer.from(`%PDF-1.4\n${label}\n%%EOF`).toString("base64");

after(async () => { await pool.end(); await rm(uploadDir, { recursive: true, force: true }); });

describe("Phase 4 AI intelligence PostgreSQL integration", () => {
  it("persists pass and position scoped criteria, queues exact-target reviews, claims safely, and erases AI-derived PII", async () => {
    const suffix = Date.now();
    const pass = await pool.query<{ id: number }>("insert into passes (pass_id,position_title,department,location,employment_type,status) values ($1,'AI Pass Role','Ops','Dubai','Full-time','active') returning id", [`HP-P4-${suffix}`]);
    const position = await pool.query<{ id: number }>("insert into pass_positions (pass_id,position_title,requirements) values ($1,'AI Position Role','SWIFT operations') returning id", [pass.rows[0].id]);
    const candidate = await pool.query<{ id: number }>("insert into candidates (name,email) values ('AI Candidate',$1) returning id", [`ai-${suffix}@example.test`]);
    const application = await pool.query<{ id: number }>("insert into pass_candidates (pass_id,candidate_id,position_id,status) values ($1,$2,$3,'new') returning id", [pass.rows[0].id, candidate.rows[0].id, position.rows[0].id]);
    const currentCv = await storeCandidateCvUpload({ candidateId: candidate.rows[0].id, fileName: "current.pdf", mimeType: "application/pdf", fileDataBase64: pdf("current cv") });
    await pool.query("insert into documents (candidate_id,doc_type,title,file_path,file_name,status,extracted_text,extraction_status) values ($1,'cv','Candidate CV',$2,$3,'submitted','current evidence','completed')", [candidate.rows[0].id, currentCv.storageKey, currentCv.originalName]);
    await pool.query("update candidates set cv_file_path=$2,cv_file_name=$3 where id=$1", [candidate.rows[0].id, currentCv.storageKey, currentCv.originalName]);
    const applicationCv = await storeCandidateCvUpload({ candidateId: candidate.rows[0].id, fileName: "application.pdf", mimeType: "application/pdf", fileDataBase64: pdf("application cv") });
    const appDoc = await pool.query<{ id: number }>("insert into documents (pass_id,candidate_id,pass_candidate_id,doc_type,title,file_path,file_name,status,extracted_text,extraction_status) values ($1,$2,$3,'cv','Application CV',$4,$5,'submitted','application evidence','completed') returning id", [pass.rows[0].id, candidate.rows[0].id, application.rows[0].id, applicationCv.storageKey, applicationCv.originalName]);

    await storage.replaceAiCriteria(pass.rows[0].id, null, [{ passId: pass.rows[0].id, positionId: null, title: "Pass criterion", evaluationInstruction: "Pass-level evidence", importance: "required", source: "manual", sortOrder: 0, isActive: true }]);
    await storage.confirmPassCriteriaTarget(pass.rows[0].id, null);
    await storage.replaceAiCriteria(pass.rows[0].id, position.rows[0].id, [{ passId: pass.rows[0].id, positionId: position.rows[0].id, title: "Position criterion", evaluationInstruction: "Position-specific evidence", importance: "required", source: "manual", sortOrder: 0, isActive: true }]);
    const version = await storage.confirmPassCriteriaTarget(pass.rows[0].id, position.rows[0].id);

    const queued = await queueReviewForApplication(application.rows[0].id);
    assert.equal(queued.queued, true);
    assert.equal((queued.review as any).positionId, position.rows[0].id);
    assert.equal((queued.review as any).documentId, appDoc.rows[0].id);
    assert.equal((queued.review as any).criteriaVersion, version);
    assert.match(JSON.stringify((queued.review as any).criteriaSnapshot), /Position criterion/);
    assert.doesNotMatch(JSON.stringify((queued.review as any).criteriaSnapshot), /Pass criterion/);

    const workerOne = await storage.claimPendingAiReviews(1, "worker-one");
    const workerTwo = await storage.claimPendingAiReviews(1, "worker-two");
    assert.equal(workerOne.length, 1);
    assert.equal(workerTwo.length, 0);
    await storage.updateAiReview(workerOne[0].id, {
      status: "completed",
      result: { criteria: [{ criterionId: 2, status: "met", evidence: [{ source: "cv", documentId: appDoc.rows[0].id, excerpt: "application evidence" }], rationale: "Evidence found", gaps: [] }], strengths: ["Application evidence"], materialGaps: [], clarificationQuestions: [], summary: "Human decision required." },
      reviewBand: "strong_evidence",
      provider: "test",
      model: "test",
      completedAt: new Date(),
    });

    await saveInternalCandidateCv(candidate.rows[0].id, { fileName: "new-current.pdf", mimeType: "application/pdf", fileDataBase64: pdf("new current") });
    assert.equal((await pool.query("select status from ai_candidate_reviews where id=$1", [workerOne[0].id])).rows[0].status, "completed");

    await storage.markAiReviewsStale(pass.rows[0].id, position.rows[0].id, "criteria_changed");
    assert.equal((await pool.query("select status,stale_reason from ai_candidate_reviews where id=$1", [workerOne[0].id])).rows[0].status, "stale");

    assert.equal(await eraseCandidatePii(candidate.rows[0].id), true);
    assert.equal((await pool.query("select count(*)::int as count from ai_candidate_reviews where candidate_id=$1", [candidate.rows[0].id])).rows[0].count, 0);
    assert.equal((await pool.query("select count(*)::int as count from documents where candidate_id=$1 and extracted_text is null", [candidate.rows[0].id])).rows[0].count > 0, true);
    assert.equal((await pool.query("select count(*)::int as count from pass_candidates where candidate_id=$1", [candidate.rows[0].id])).rows[0].count, 1);
  });
});
