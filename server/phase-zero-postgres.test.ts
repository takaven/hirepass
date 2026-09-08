import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { pool, verifyDatabaseReady } from "./db";
import { eraseCandidatePii } from "./candidate-privacy";
import { storeCandidateCvUpload } from "./document-files";
import { consumeRateLimit } from "./rate-limit";

const uploadDir = await mkdtemp(path.join(tmpdir(), "hirepass-real-db-"));
process.env.HIREPASS_UPLOAD_DIR = uploadDir;

after(async () => {
  await pool.end();
  await rm(uploadDir, { recursive: true, force: true });
});

describe("Phase 0 real PostgreSQL integration", () => {
  it("applies constraints, runs shared limiter SQL, and erases PII without destroying operational history", async () => {
    await verifyDatabaseReady();
    const table = await pool.query("select to_regclass('public.rate_limit_counters')::text as name");
    assert.equal(table.rows[0].name, "rate_limit_counters");

    const firstCounter = await consumeRateLimit("integration-key", new Date(), 60_000);
    const secondCounter = await consumeRateLimit("integration-key", new Date(), 60_000);
    assert.equal(firstCounter.count, 1);
    assert.equal(secondCounter.count, 2);

    const pass = await pool.query<{ id: number }>(
      "insert into passes (pass_id, position_title, department, location, employment_type) values ('HP-DB-1', 'Analyst', 'Finance', 'Dubai', 'Full-time') returning id",
    );
    const candidate = await pool.query<{ id: number }>(
      `insert into candidates (name, email, phone, cv_summary, talent_pool_notes, in_talent_pool)
       values ('Real DB Candidate', 'candidate@example.test', '+971500000000', 'Identifying CV text', 'Private pool note', true) returning id`,
    );
    const passCandidate = await pool.query<{ id: number }>(
      "insert into pass_candidates (pass_id, candidate_id, status, selection_notes) values ($1, $2, 'interview', 'Private selection note') returning id",
      [pass.rows[0].id, candidate.rows[0].id],
    );
    const interview = await pool.query<{ id: number }>(
      `insert into interviews (pass_id, pass_candidate_id, interview_date, start_time, end_time, duration, format, interview_notes)
       values ($1, $2, current_date, '10:00', '10:30', 30, 'online', 'Private interview note') returning id`,
      [pass.rows[0].id, passCandidate.rows[0].id],
    );
    await pool.query(
      "insert into interview_evaluations (interview_id, evaluator_id, technical_skills, recommendation, notes_observations, final_comments) values ($1, 1, 4, 'hire', 'Private observation', 'Private comment')",
      [interview.rows[0].id],
    );
    await pool.query("insert into offers (pass_id, pass_candidate_id, salary, status, decline_reason, negotiation_notes) values ($1, $2, 10000, 'draft', 'Private reason', 'Private negotiation')", [pass.rows[0].id, passCandidate.rows[0].id]);
    await pool.query("insert into candidate_messages (pass_candidate_id, sender_type, sender_name, message) values ($1, 'candidate', 'Real DB Candidate', 'Private message')", [passCandidate.rows[0].id]);
    await pool.query("insert into candidate_documents (pass_candidate_id, doc_type, label, status) values ($1, 'cv', 'CV', 'pending')", [passCandidate.rows[0].id]);
    await pool.query("insert into candidate_timeline_events (pass_candidate_id, stage, status, title, description) values ($1, 'interview', 'completed', 'Named event', 'Private timeline text')", [passCandidate.rows[0].id]);
    await pool.query("insert into assessment_responses (assessment_id, pass_candidate_id, responses, total_score) values (1, $1, '{\"private\":\"answer\"}'::jsonb, 8)", [passCandidate.rows[0].id]);
    await pool.query("insert into activity_log (pass_id, actor_type, actor_name, action, target_type, target_id, details) values ($1, 'candidate', 'Real DB Candidate', 'candidate_updated', 'pass_candidate', $2, jsonb_build_object('passCandidateId', $2::int, 'private', 'detail'))", [pass.rows[0].id, passCandidate.rows[0].id]);
    await pool.query("insert into notifications (type, title, message, link, candidate_id) values ('candidate_status_change', 'Candidate Status Updated', 'Real DB Candidate moved to Interview', '/private-link', $1)", [candidate.rows[0].id]);

    await assert.rejects(pool.query("insert into share_links (token, pass_id) values ('no-expiry-manager', $1)", [pass.rows[0].id]), (error: any) => error?.code === "23502");
    await assert.rejects(pool.query("insert into candidate_links (token, pass_candidate_id) values ('no-expiry-candidate', $1)", [passCandidate.rows[0].id]), (error: any) => error?.code === "23502");
    await pool.query("insert into share_links (token, pass_id, expires_at) values ('finite-manager', $1, now() + interval '1 day')", [pass.rows[0].id]);
    await pool.query("insert into candidate_links (token, pass_candidate_id, expires_at) values ('finite-candidate', $1, now() + interval '1 day')", [passCandidate.rows[0].id]);

    const storedCv = await storeCandidateCvUpload({
      candidateId: candidate.rows[0].id,
      fileName: "candidate.pdf",
      mimeType: "application/pdf",
      fileDataBase64: Buffer.from("%PDF-1.4\nreal database test\n%%EOF").toString("base64"),
    });
    await pool.query("update candidates set cv_file_path = $2, cv_file_name = 'candidate.pdf' where id = $1", [candidate.rows[0].id, storedCv.storageKey]);

    assert.equal(await eraseCandidatePii(candidate.rows[0].id), true);
    await assert.rejects(access(storedCv.absolutePath));

    const erased = await pool.query("select * from candidates where id = $1", [candidate.rows[0].id]);
    assert.equal(erased.rows[0].name, `Erased candidate #${candidate.rows[0].id}`);
    assert.equal(erased.rows[0].email, null);
    assert.equal(erased.rows[0].is_anonymized, true);
    assert.equal((await pool.query("select count(*)::int as count from candidate_messages where pass_candidate_id = $1", [passCandidate.rows[0].id])).rows[0].count, 0);
    assert.equal((await pool.query("select is_active from candidate_links where pass_candidate_id = $1", [passCandidate.rows[0].id])).rows[0].is_active, false);

    const preserved = await pool.query(
      `select pc.status, pc.selection_notes, i.interview_notes, ie.technical_skills, ie.notes_observations,
              o.status as offer_status, o.negotiation_notes, ar.total_score, ar.responses,
              te.description, al.actor_name, al.details, n.message, n.link
       from pass_candidates pc
       join interviews i on i.pass_candidate_id = pc.id
       join interview_evaluations ie on ie.interview_id = i.id
       join offers o on o.pass_candidate_id = pc.id
       join assessment_responses ar on ar.pass_candidate_id = pc.id
       join candidate_timeline_events te on te.pass_candidate_id = pc.id
       join activity_log al on al.target_id = pc.id and al.target_type = 'pass_candidate'
       join notifications n on n.candidate_id = pc.candidate_id where pc.id = $1`,
      [passCandidate.rows[0].id],
    );
    assert.equal(preserved.rowCount, 1);
    assert.equal(preserved.rows[0].status, "interview");
    assert.equal(preserved.rows[0].technical_skills, 4);
    assert.equal(preserved.rows[0].offer_status, "draft");
    assert.equal(preserved.rows[0].total_score, 8);
    for (const field of ["selection_notes", "interview_notes", "notes_observations", "negotiation_notes", "description", "link"]) assert.equal(preserved.rows[0][field], null);
    assert.deepEqual(preserved.rows[0].responses, {});
    assert.deepEqual(preserved.rows[0].details, {});
    assert.equal(preserved.rows[0].actor_name, "Erased candidate");
    assert.equal(preserved.rows[0].message, "Candidate data erased");
  });
});
