import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { pool } from "./db";
import { eraseCandidatePii } from "./candidate-privacy";
import { reuseCandidateForPass, submitPublicCandidate } from "./public-intake";

const uploadDir = await mkdtemp(path.join(tmpdir(), "hirepass-phase-one-"));
process.env.HIREPASS_UPLOAD_DIR = uploadDir;
const pdf = (label: string) => Buffer.from(`%PDF-1.4\n${label}\n%%EOF`).toString("base64");
const base = (email: string, label: string) => ({
  name: "Phase One Candidate", email, fileName: `${label}.pdf`, mimeType: "application/pdf",
  fileDataBase64: pdf(label), privacyNoticeVersion: "test-v1",
});

after(async () => { await pool.end(); await rm(uploadDir, { recursive: true, force: true }); });

describe("Phase 1 public intake and Candidate Library persistence", () => {
  it("reuses candidates safely, retains every submitted CV, prevents duplicate applications, and erases every CV", async () => {
    const suffix = Date.now();
    const openPass = await pool.query<{id:number}>("insert into passes (pass_id,position_title,department,location,employment_type,status) values ($1,'Phase One Open','Test','Dubai','Full-time','active') returning id", [`HP-P1-${suffix}`]);
    const secondPass = await pool.query<{id:number}>("insert into passes (pass_id,position_title,department,location,employment_type,status) values ($1,'Phase One Reuse','Test','Dubai','Full-time','active') returning id", [`HP-P1B-${suffix}`]);
    const closedPass = await pool.query<{id:number}>("insert into passes (pass_id,position_title,department,location,employment_type,status) values ($1,'Phase One Closed','Test','Dubai','Full-time','closed') returning id", [`HP-P1C-${suffix}`]);

    const general = await submitPublicCandidate(base(`Person-${suffix}@Example.Test`, "general"));
    const repeated = await submitPublicCandidate(base(`person-${suffix}@example.test`, "updated"));
    assert.equal(repeated.candidateId, general.candidateId);
    assert.equal((await pool.query("select count(*)::int count from candidates where lower(email)=$1", [`person-${suffix}@example.test`])).rows[0].count, 1);
    assert.equal((await pool.query("select count(*)::int count from pass_candidates where candidate_id=$1", [general.candidateId])).rows[0].count, 0);
    assert.equal((await pool.query("select source,in_talent_pool,privacy_notice_version from candidates where id=$1", [general.candidateId])).rows[0].source, "general_submission");

    const application = await submitPublicCandidate({ ...base(`PERSON-${suffix}@EXAMPLE.TEST`, "application"), passId: openPass.rows[0].id });
    assert.equal(application.candidateId, general.candidateId);
    const duplicate = await submitPublicCandidate({ ...base(`person-${suffix}@example.test`, "duplicate"), passId: openPass.rows[0].id });
    assert.equal(duplicate.duplicateApplication, true);
    assert.equal((await pool.query("select count(*)::int count from pass_candidates where candidate_id=$1 and pass_id=$2", [general.candidateId, openPass.rows[0].id])).rows[0].count, 1);
    assert.equal((await pool.query("select count(*)::int count from documents where candidate_id=$1", [general.candidateId])).rows[0].count, 3);
    await assert.rejects(submitPublicCandidate({ ...base(`closed-${suffix}@example.test`, "closed"), passId: closedPass.rows[0].id }), /no longer accepting/);
    assert.equal((await pool.query("select count(*)::int count from candidates where lower(email)=$1", [`closed-${suffix}@example.test`])).rows[0].count, 0);

    await reuseCandidateForPass(general.candidateId, secondPass.rows[0].id);
    assert.equal((await pool.query("select count(*)::int count from pass_candidates where candidate_id=$1", [general.candidateId])).rows[0].count, 2);

    const raceEmail = `race-${suffix}@example.test`;
    const raced = await Promise.all([submitPublicCandidate(base(raceEmail.toUpperCase(), "race-a")), submitPublicCandidate(base(raceEmail, "race-b"))]);
    assert.equal(raced[0].candidateId, raced[1].candidateId);
    assert.equal((await pool.query("select count(*)::int count from candidates where lower(email)=$1", [raceEmail])).rows[0].count, 1);

    const stored = await pool.query<{file_path:string}>("select file_path from documents where candidate_id=$1 order by id", [general.candidateId]);
    assert.equal(stored.rowCount, 3);
    for (const row of stored.rows) await access(path.join(uploadDir, ...row.file_path.split("/")));
    const current = await pool.query("select cv_file_path from candidates where id=$1", [general.candidateId]);
    assert.equal(current.rows[0].cv_file_path, stored.rows[2].file_path);

    assert.equal(await eraseCandidatePii(general.candidateId), true);
    for (const row of stored.rows) await assert.rejects(access(path.join(uploadDir, ...row.file_path.split("/"))));
    assert.equal((await pool.query("select count(*)::int count from documents where candidate_id=$1 and file_path is null and status='erased'", [general.candidateId])).rows[0].count, 3);
    assert.equal((await pool.query("select count(*)::int count from pass_candidates where candidate_id=$1", [general.candidateId])).rows[0].count, 2);
  });
});
