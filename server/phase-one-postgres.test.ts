import assert from "node:assert/strict";
import { createServer } from "node:http";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import express from "express";
import { pool } from "./db";
import { eraseCandidatePii } from "./candidate-privacy";
import { storeCandidateCvUpload } from "./document-files";
import { saveInternalCandidateCv } from "./internal-cv";
import { reuseCandidateForPass, submitPublicCandidate } from "./public-intake";
import { registerRoutes } from "./routes";

const uploadDir = await mkdtemp(path.join(tmpdir(), "hirepass-phase-one-"));
process.env.HIREPASS_UPLOAD_DIR = uploadDir;
const pdf = (label: string) => Buffer.from(`%PDF-1.4\n${label}\n%%EOF`).toString("base64");
const base = (email: string, label: string) => ({
  name: "Phase One Candidate", email, fileName: `${label}.pdf`, mimeType: "application/pdf",
  fileDataBase64: pdf(label), privacyNoticeVersion: "test-v1",
});
async function storedFiles(directory = uploadDir): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? storedFiles(entryPath) : [entryPath];
  }));
  return nested.flat().sort();
}

async function withPublicRouteServer(callback: (baseUrl: string) => Promise<void>) {
  const previous = {
    publicBase: process.env.HIREPASS_PUBLIC_BASE_URL,
    privacyVersion: process.env.HIREPASS_PRIVACY_NOTICE_VERSION,
    emailEnabled: process.env.HIREPASS_EMAIL_ENABLED,
    aiEnabled: process.env.HIREPASS_AI_ENABLED,
  };
  process.env.HIREPASS_PUBLIC_BASE_URL = "https://careers.example.test";
  process.env.HIREPASS_PRIVACY_NOTICE_VERSION = "test-v1";
  process.env.HIREPASS_EMAIL_ENABLED = "false";
  process.env.HIREPASS_AI_ENABLED = "false";
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  const server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error?: Error) => error ? reject(error) : resolve()));
    if (previous.publicBase === undefined) delete process.env.HIREPASS_PUBLIC_BASE_URL; else process.env.HIREPASS_PUBLIC_BASE_URL = previous.publicBase;
    if (previous.privacyVersion === undefined) delete process.env.HIREPASS_PRIVACY_NOTICE_VERSION; else process.env.HIREPASS_PRIVACY_NOTICE_VERSION = previous.privacyVersion;
    if (previous.emailEnabled === undefined) delete process.env.HIREPASS_EMAIL_ENABLED; else process.env.HIREPASS_EMAIL_ENABLED = previous.emailEnabled;
    if (previous.aiEnabled === undefined) delete process.env.HIREPASS_AI_ENABLED; else process.env.HIREPASS_AI_ENABLED = previous.aiEnabled;
  }
}

async function submitPublicApplication(baseUrl: string, passId: number, email: string, label: string) {
  const response = await fetch(`${baseUrl}/api/public/passes/${passId}/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...base(email, label), name: `Applicant ${label}`, privacyAcknowledged: true }),
  });
  const body = await response.json() as any;
  return { response, body };
}

after(async () => { await pool.end(); await rm(uploadDir, { recursive: true, force: true }); });

describe("Phase 1 public intake and Candidate Library persistence", () => {
  it("returns immediate Candidate Pass status links only for brand-new candidate applications", async () => {
    const suffix = Date.now();
    const firstPass = await pool.query<{id:number}>("insert into passes (pass_id,position_title,department,location,employment_type,status) values ($1,'Secure Public Route','Test','Dubai','Full-time','active') returning id", [`HP-P1-SEC-${suffix}`]);
    const secondPass = await pool.query<{id:number}>("insert into passes (pass_id,position_title,department,location,employment_type,status) values ($1,'Secure Reuse Route','Test','Dubai','Full-time','active') returning id", [`HP-P1-SECB-${suffix}`]);
    const email = `secure-${suffix}@example.test`;

    await withPublicRouteServer(async (baseUrl) => {
      const created = await submitPublicApplication(baseUrl, firstPass.rows[0].id, email, "created");
      assert.equal(created.response.status, 201);
      assert.equal(created.body.duplicateApplication, false);
      assert.equal(created.body.reusedCandidate, false);
      assert.match(created.body.candidatePassUrl, /^https:\/\/careers\.example\.test\/candidate-pass\//);
      const createdLinks = await pool.query<{ count: number; expires_at: Date; token: string }>(
        `select count(*)::int count, max(expires_at) expires_at, max(token) token
         from candidate_links where pass_candidate_id=$1`,
        [created.body.applicationId],
      );
      assert.equal(createdLinks.rows[0].count, 1);
      assert.ok(createdLinks.rows[0].expires_at);
      const issuedToken = createdLinks.rows[0].token;
      assert.ok(issuedToken);

      const duplicate = await submitPublicApplication(baseUrl, firstPass.rows[0].id, email, "duplicate");
      assert.equal(duplicate.response.status, 200);
      assert.equal(duplicate.body.duplicateApplication, true);
      assert.equal(duplicate.body.candidatePassUrl, null);
      assert.doesNotMatch(JSON.stringify(duplicate.body), /candidate-pass\//);
      assert.equal(JSON.stringify(duplicate.body).includes(issuedToken), false);
      const duplicateLinks = await pool.query<{ count: number }>("select count(*)::int count from candidate_links where pass_candidate_id=$1", [created.body.applicationId]);
      assert.equal(duplicateLinks.rows[0].count, 1);

      const reused = await submitPublicApplication(baseUrl, secondPass.rows[0].id, email, "reused");
      assert.equal(reused.response.status, 201);
      assert.equal(reused.body.duplicateApplication, false);
      assert.equal(reused.body.reusedCandidate, true);
      assert.equal(reused.body.candidatePassUrl, null);
      assert.doesNotMatch(JSON.stringify(reused.body), /candidate-pass\//);
      assert.equal(JSON.stringify(reused.body).includes(issuedToken), false);
      const reusedLinks = await pool.query<{ count: number }>("select count(*)::int count from candidate_links where pass_candidate_id=$1", [reused.body.applicationId]);
      assert.equal(reusedLinks.rows[0].count, 0);
      const candidateLinks = await pool.query<{ count: number }>("select count(*)::int count from candidate_links where pass_candidate_id in (select id from pass_candidates where candidate_id=$1)", [created.body.candidateId]);
      assert.equal(candidateLinks.rows[0].count, 1);
    });
  });

  it("reuses candidates safely, retains every submitted CV, prevents duplicate applications, and erases every CV", async () => {
    const suffix = Date.now();
    const openPass = await pool.query<{id:number}>("insert into passes (pass_id,position_title,department,location,employment_type,status) values ($1,'Phase One Open','Test','Dubai','Full-time','active') returning id", [`HP-P1-${suffix}`]);
    const secondPass = await pool.query<{id:number}>("insert into passes (pass_id,position_title,department,location,employment_type,status) values ($1,'Phase One Reuse','Test','Dubai','Full-time','active') returning id", [`HP-P1B-${suffix}`]);
    const closedPass = await pool.query<{id:number}>("insert into passes (pass_id,position_title,department,location,employment_type,status) values ($1,'Phase One Closed','Test','Dubai','Full-time','closed') returning id", [`HP-P1C-${suffix}`]);

    const general = await submitPublicCandidate({ ...base(`Person-${suffix}@Example.Test`, "general"), name: "Trusted Candidate", phone: "+971500000001", currentTitle: "Trusted Role" });
    const original = await pool.query("select * from candidates where id=$1", [general.candidateId]);
    const repeated = await submitPublicCandidate({ ...base(`person-${suffix}@example.test`, "updated"), name: "Unverified Replacement", phone: "+971599999999", currentTitle: "Unverified Role", privacyNoticeVersion: "test-v2" });
    assert.equal(repeated.candidateId, general.candidateId);
    assert.equal((await pool.query("select count(*)::int count from candidates where lower(email)=$1", [`person-${suffix}@example.test`])).rows[0].count, 1);
    assert.equal((await pool.query("select count(*)::int count from pass_candidates where candidate_id=$1", [general.candidateId])).rows[0].count, 0);
    assert.equal((await pool.query("select source,in_talent_pool,privacy_notice_version from candidates where id=$1", [general.candidateId])).rows[0].source, "general_submission");
    const preserved = await pool.query("select name,phone,current_title,cv_file_path,privacy_notice_version from candidates where id=$1", [general.candidateId]);
    assert.equal(preserved.rows[0].name, "Trusted Candidate");
    assert.equal(preserved.rows[0].phone, "+971500000001");
    assert.equal(preserved.rows[0].current_title, "Trusted Role");
    assert.equal(preserved.rows[0].cv_file_path, original.rows[0].cv_file_path);
    assert.equal(preserved.rows[0].privacy_notice_version, "test-v2");

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
    assert.equal(current.rows[0].cv_file_path, stored.rows[0].file_path);
    const provenance = await pool.query("select title,pass_id,pass_candidate_id from documents where candidate_id=$1 order by id", [general.candidateId]);
    assert.deepEqual(provenance.rows.map((row) => row.title), ["General submission CV", "General submission CV", "CV submitted for Phase One Open"]);
    assert.equal(provenance.rows[0].pass_id, null);
    assert.equal(provenance.rows[2].pass_candidate_id, application.applicationId);

    assert.equal(await eraseCandidatePii(general.candidateId), true);
    for (const row of stored.rows) await assert.rejects(access(path.join(uploadDir, ...row.file_path.split("/"))));
    assert.equal((await pool.query("select count(*)::int count from documents where candidate_id=$1 and file_path is null and status='erased'", [general.candidateId])).rows[0].count, 3);
    assert.equal((await pool.query("select count(*)::int count from pass_candidates where candidate_id=$1", [general.candidateId])).rows[0].count, 2);
  });

  it("rolls back internal CV history and removes the file when the current-pointer update fails", async () => {
    const suffix = Date.now();
    const candidate = await pool.query<{id:number}>("insert into candidates (name,email) values ('Atomic Candidate',$1) returning id", [`atomic-${suffix}@example.test`]);
    const prior = await storeCandidateCvUpload({ candidateId: candidate.rows[0].id, fileName: "prior.pdf", mimeType: "application/pdf", fileDataBase64: pdf("prior") });
    await pool.query("insert into documents (candidate_id,doc_type,title,file_path,file_name,status) values ($1,'cv','Candidate CV',$2,$3,'submitted')", [candidate.rows[0].id, prior.storageKey, prior.originalName]);
    await pool.query("update candidates set cv_file_path=$2,cv_file_name=$3 where id=$1", [candidate.rows[0].id, prior.storageKey, prior.originalName]);
    const filesBefore = await storedFiles();

    await pool.query(`create function phase_one_reject_cv_pointer() returns trigger language plpgsql as $$
      begin if new.cv_file_path <> old.cv_file_path then raise exception 'simulated pointer failure'; end if; return new; end $$`);
    await pool.query("create trigger phase_one_reject_cv_pointer before update on candidates for each row execute function phase_one_reject_cv_pointer()");
    try {
      await assert.rejects(saveInternalCandidateCv(candidate.rows[0].id, { fileName: "failed.pdf", mimeType: "application/pdf", fileDataBase64: pdf("failed") }), /simulated pointer failure/);
    } finally {
      await pool.query("drop trigger phase_one_reject_cv_pointer on candidates");
      await pool.query("drop function phase_one_reject_cv_pointer()");
    }

    const rows = await pool.query("select file_path,file_name from documents where candidate_id=$1", [candidate.rows[0].id]);
    assert.equal(rows.rowCount, 1);
    assert.equal(rows.rows[0].file_path, prior.storageKey);
    const pointer = await pool.query("select cv_file_path,cv_file_name from candidates where id=$1", [candidate.rows[0].id]);
    assert.equal(pointer.rows[0].cv_file_path, prior.storageKey);
    assert.deepEqual(await storedFiles(), filesBefore);
    await access(prior.absolutePath);
  });
});
