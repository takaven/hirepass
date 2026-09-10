import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { pool } from "./db";
import { eraseCandidatePii } from "./candidate-privacy";
import { storeCandidateCvUpload } from "./document-files";
import { saveInternalCandidateCv } from "./internal-cv";
import { queueLibraryMatchReview, queueReviewForApplication } from "./ai/review";
import { storage } from "./storage";

const uploadDir = await mkdtemp(path.join(tmpdir(), "hirepass-phase-four-"));
process.env.HIREPASS_UPLOAD_DIR = uploadDir;
process.env.HIREPASS_AI_ENABLED = "true";
process.env.ANTHROPIC_API_KEY ||= "test-key";
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

    await storage.replaceAiCriteriaAndConfirm(pass.rows[0].id, null, [{ passId: pass.rows[0].id, positionId: null, title: "Pass criterion", evaluationInstruction: "Pass-level evidence", importance: "required", source: "manual", sortOrder: 0, isActive: true }], "criteria_changed");
    const confirmed = await storage.replaceAiCriteriaAndConfirm(pass.rows[0].id, position.rows[0].id, [{ passId: pass.rows[0].id, positionId: position.rows[0].id, title: "Position criterion", evaluationInstruction: "Position-specific evidence", importance: "required", source: "manual", sortOrder: 0, isActive: true }], "criteria_changed");
    const version = confirmed.version;

    const queued = await queueReviewForApplication(application.rows[0].id);
    assert.equal(queued.queued, true);
    assert.equal((queued.review as any).positionId, position.rows[0].id);
    assert.equal((queued.review as any).documentId, appDoc.rows[0].id);
    assert.equal((queued.review as any).criteriaVersion, version);
    assert.match(JSON.stringify((queued.review as any).criteriaSnapshot), /Position criterion/);
    assert.doesNotMatch(JSON.stringify((queued.review as any).criteriaSnapshot), /Pass criterion/);
    const duplicate = await Promise.all([queueReviewForApplication(application.rows[0].id), queueReviewForApplication(application.rows[0].id)]);
    assert.equal(duplicate.filter((item) => item.queued).length, 0);
    assert.equal((await pool.query("select count(*)::int as count from ai_candidate_reviews where pass_candidate_id=$1 and status in ('pending','processing','completed')", [application.rows[0].id])).rows[0].count, 1);

    const workerOne = await storage.claimPendingAiReviews(1, "worker-one");
    const workerTwo = await storage.claimPendingAiReviews(1, "worker-two");
    assert.equal(workerOne.length, 1);
    assert.equal(workerTwo.length, 0);
    await storage.updateAiReview(workerOne[0].id, {
      status: "completed",
      result: { criteria: [{ criterionId: (workerOne[0].criteriaSnapshot as any[])[0].id, status: "met", evidence: [{ source: "cv", documentId: appDoc.rows[0].id, excerpt: "application evidence" }], rationale: "Evidence found", gaps: [] }], strengths: ["Application evidence"], materialGaps: [], clarificationQuestions: [], summary: "Human decision required." },
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

  it("does not create pending review rows when AI is disabled or unconfigured", async () => {
    const suffix = Date.now();
    const pass = await pool.query<{ id: number }>("insert into passes (pass_id,position_title,department,location,employment_type,status,ai_criteria_version,ai_criteria_confirmed_at) values ($1,'No AI Role','Ops','Dubai','Full-time','active',1,now()) returning id", [`HP-P4-OFF-${suffix}`]);
    const candidate = await pool.query<{ id: number }>("insert into candidates (name,email) values ('No AI Candidate',$1) returning id", [`no-ai-${suffix}@example.test`]);
    const application = await pool.query<{ id: number }>("insert into pass_candidates (pass_id,candidate_id,status) values ($1,$2,'new') returning id", [pass.rows[0].id, candidate.rows[0].id]);
    const cv = await storeCandidateCvUpload({ candidateId: candidate.rows[0].id, fileName: "cv.pdf", mimeType: "application/pdf", fileDataBase64: pdf("no ai cv") });
    await pool.query("insert into documents (candidate_id,pass_candidate_id,doc_type,title,file_path,file_name,status,extracted_text,extraction_status) values ($1,$2,'cv','CV',$3,$4,'submitted','no ai evidence','completed')", [candidate.rows[0].id, application.rows[0].id, cv.storageKey, cv.originalName]);
    await storage.replaceAiCriteriaAndConfirm(pass.rows[0].id, null, [{ passId: pass.rows[0].id, positionId: null, title: "Criterion", evaluationInstruction: "Criterion evidence", importance: "required", source: "manual", sortOrder: 0, isActive: true }], "criteria_changed");
    const previousEnabled = process.env.HIREPASS_AI_ENABLED;
    const previousKey = process.env.ANTHROPIC_API_KEY;
    process.env.HIREPASS_AI_ENABLED = "false";
    assert.equal((await queueReviewForApplication(application.rows[0].id)).reason, "ai_disabled");
    process.env.HIREPASS_AI_ENABLED = "true";
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal((await queueReviewForApplication(application.rows[0].id)).reason, "ai_unavailable");
    process.env.HIREPASS_AI_ENABLED = previousEnabled;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previousKey;
    assert.equal((await pool.query("select count(*)::int as count from ai_candidate_reviews where pass_candidate_id=$1", [application.rows[0].id])).rows[0].count, 0);
  });

  it("rolls back criteria replacement when confirmation fails later in the transaction", async () => {
    const suffix = Date.now();
    const pass = await pool.query<{ id: number }>("insert into passes (pass_id,position_title,department,location,employment_type,status) values ($1,'Atomic Criteria Role','Ops','Dubai','Full-time','active') returning id", [`HP-P4-ATOMIC-${suffix}`]);
    const first = await storage.replaceAiCriteriaAndConfirm(pass.rows[0].id, null, [{ passId: pass.rows[0].id, positionId: null, title: "Original criterion", evaluationInstruction: "Original evidence", importance: "required", source: "manual", sortOrder: 0, isActive: true }], "criteria_changed");
    assert.equal(first.version, 1);
    await pool.query(`
      create or replace function fail_phase_four_criteria_confirm() returns trigger as $$
      begin
        if new.pass_id = 'HP-P4-ATOMIC-${suffix}' then
          raise exception 'phase four criteria confirmation failure';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    await pool.query("create trigger fail_phase_four_criteria_confirm before update on passes for each row execute function fail_phase_four_criteria_confirm()");
    try {
      await assert.rejects(
        storage.replaceAiCriteriaAndConfirm(pass.rows[0].id, null, [{ passId: pass.rows[0].id, positionId: null, title: "Replacement criterion", evaluationInstruction: "Replacement evidence", importance: "required", source: "manual", sortOrder: 0, isActive: true }], "criteria_changed"),
      );
    } finally {
      await pool.query("drop trigger if exists fail_phase_four_criteria_confirm on passes");
      await pool.query("drop function if exists fail_phase_four_criteria_confirm()");
    }
    const target = await pool.query("select ai_criteria_version from passes where id=$1", [pass.rows[0].id]);
    assert.equal(target.rows[0].ai_criteria_version, 1);
    const active = await storage.getAiCriteria(pass.rows[0].id, null);
    assert.equal(active.length, 1);
    assert.equal(active[0].title, "Original criterion");
  });

  it("queues one Candidate Library match for a reusable current CV without auto-applying", async () => {
    const suffix = Date.now();
    const pass = await pool.query<{ id: number }>("insert into passes (pass_id,position_title,department,location,employment_type,status) values ($1,'Library Match Role','Ops','Dubai','Full-time','active') returning id", [`HP-P4-LIB-${suffix}`]);
    await storage.replaceAiCriteriaAndConfirm(pass.rows[0].id, null, [{ passId: pass.rows[0].id, positionId: null, title: "Treasury evidence", evaluationInstruction: "Look for treasury evidence", importance: "required", source: "manual", sortOrder: 0, isActive: true }], "criteria_changed");
    const candidate = await pool.query<{ id: number }>("insert into candidates (name,email,in_talent_pool) values ('Library Candidate',$1,true) returning id", [`library-${suffix}@example.test`]);
    const cv = await storeCandidateCvUpload({ candidateId: candidate.rows[0].id, fileName: "library.pdf", mimeType: "application/pdf", fileDataBase64: pdf("library cv") });
    const doc = await pool.query<{ id: number }>("insert into documents (candidate_id,doc_type,title,file_path,file_name,status,extracted_text,extraction_status) values ($1,'cv','Current CV',$2,$3,'submitted','treasury evidence','completed') returning id", [candidate.rows[0].id, cv.storageKey, cv.originalName]);
    await pool.query("update candidates set cv_file_path=$2,cv_file_name=$3 where id=$1", [candidate.rows[0].id, cv.storageKey, cv.originalName]);
    const [first, second] = await Promise.all([
      queueLibraryMatchReview({ passId: pass.rows[0].id, candidateId: candidate.rows[0].id }),
      queueLibraryMatchReview({ passId: pass.rows[0].id, candidateId: candidate.rows[0].id }),
    ]);
    assert.equal([first, second].filter((result) => result.queued).length, 1);
    const reviews = await pool.query("select review_type,document_id,count(*) over()::int as total from ai_candidate_reviews where pass_id=$1 and candidate_id=$2", [pass.rows[0].id, candidate.rows[0].id]);
    assert.equal(reviews.rows[0].review_type, "library_match");
    assert.equal(reviews.rows[0].document_id, doc.rows[0].id);
    assert.equal(reviews.rows[0].total, 1);
    assert.equal((await pool.query("select count(*)::int as count from pass_candidates where pass_id=$1 and candidate_id=$2", [pass.rows[0].id, candidate.rows[0].id])).rows[0].count, 0);
    await pool.query("update candidates set is_anonymized=true where id=$1", [candidate.rows[0].id]);
    assert.equal((await queueLibraryMatchReview({ passId: pass.rows[0].id, candidateId: candidate.rows[0].id })).reason, "target_not_found");
  });

  it("deduplicates transactional email events and lets failed delivery retry without workflow rollback", async () => {
    const suffix = Date.now();
    const eventKey = `email-proof-${suffix}`;
    const first = await storage.enqueueEmail({ eventKey, recipientEmail: "candidate@example.test", subject: "Application received", bodyText: "Received", status: "pending", attemptCount: 0 });
    const second = await storage.enqueueEmail({ eventKey, recipientEmail: "candidate@example.test", subject: "Application received", bodyText: "Received", status: "pending", attemptCount: 0 });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    const claimed = await storage.claimPendingEmails(1);
    assert.equal(claimed.length, 1);
    await storage.markEmailFailed(claimed[0].id, "email_delivery_failed");
    const row = await pool.query("select status,attempt_count,last_error_code from email_outbox where id=$1", [claimed[0].id]);
    assert.equal(row.rows[0].status, "pending");
    assert.equal(row.rows[0].attempt_count, 1);
    assert.equal(row.rows[0].last_error_code, "email_delivery_failed");
  });
});
