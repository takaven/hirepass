import { pool } from "./db";
import type { PoolClient } from "pg";
import { removeStoredCandidateDocument, storeCandidateCvUpload } from "./document-files";

const OPEN_STATUSES = ["sourcing", "screening", "active"];

export class PublicIntakeError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type PublicIntakeInput = {
  passId?: number;
  name: string;
  email: string;
  phone?: string;
  currentTitle?: string;
  currentCompany?: string;
  currentLocation?: string;
  linkedinUrl?: string;
  skills?: string[];
  fileName: string;
  mimeType?: string;
  fileDataBase64: string;
  privacyNoticeVersion: string;
};

export async function submitPublicCandidate(input: PublicIntakeInput) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const storedCv = await storeCandidateCvUpload({ candidateId: 0, fileName: input.fileName, mimeType: input.mimeType, fileDataBase64: input.fileDataBase64 });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [normalizedEmail]);
    let pass: { id: number; position_title: string; status: string | null } | undefined;
    if (input.passId) {
      const passResult = await client.query("select id, position_title, status from passes where id = $1 for update", [input.passId]);
      pass = passResult.rows[0];
      if (!pass) throw new PublicIntakeError(404, "Position not found");
      if (!OPEN_STATUSES.includes(pass.status || "")) throw new PublicIntakeError(409, "This position is no longer accepting applications");
    }

    const matches = await client.query<{ id: number }>(
      "select id from candidates where lower(trim(email)) = $1 and is_anonymized = false order by id for update",
      [normalizedEmail],
    );
    if (matches.rowCount && matches.rowCount > 1) throw new PublicIntakeError(409, "This email matches multiple candidate records; contact the hiring team");
    let candidateId = matches.rows[0]?.id;
    if (candidateId) {
      await client.query(
        `update candidates set name=$2, phone=coalesce($3, phone), current_title=coalesce($4, current_title),
         current_company=coalesce($5, current_company), current_location=coalesce($6, current_location),
         linkedin_url=coalesce($7, linkedin_url), skills=coalesce($8::jsonb, skills),
         in_talent_pool=case when $9 then true else in_talent_pool end,
         privacy_notice_version=$10, privacy_notice_accepted_at=now(), updated_at=now() where id=$1`,
        [candidateId, input.name, input.phone || null, input.currentTitle || null, input.currentCompany || null,
          input.currentLocation || null, input.linkedinUrl || null, input.skills?.length ? JSON.stringify(input.skills) : null,
          !input.passId, input.privacyNoticeVersion],
      );
    } else {
      const created = await client.query<{ id: number }>(
        `insert into candidates (name,email,phone,current_title,current_company,current_location,linkedin_url,skills,source,in_talent_pool,privacy_notice_version,privacy_notice_accepted_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,now()) returning id`,
        [input.name, normalizedEmail, input.phone || null, input.currentTitle || null, input.currentCompany || null,
          input.currentLocation || null, input.linkedinUrl || null, JSON.stringify(input.skills || []),
          input.passId ? "public_application" : "general_submission", !input.passId, input.privacyNoticeVersion],
      );
      candidateId = created.rows[0].id;
    }

    let applicationId: number | null = null;
    if (pass) {
      await client.query("select pg_advisory_xact_lock($1, $2)", [candidateId, pass.id]);
      const existing = await client.query<{ id: number }>("select id from pass_candidates where candidate_id=$1 and pass_id=$2", [candidateId, pass.id]);
      if (existing.rows[0]) {
        await client.query("rollback");
        await removeStoredCandidateDocument(storedCv.storageKey);
        return { candidateId, applicationId: existing.rows[0].id, reusedCandidate: true, duplicateApplication: true };
      }
      const application = await client.query<{ id: number }>("insert into pass_candidates (pass_id,candidate_id,status) values ($1,$2,'new') returning id", [pass.id, candidateId]);
      applicationId = application.rows[0].id;
    }

    await client.query(
      `insert into documents (pass_id,candidate_id,pass_candidate_id,doc_type,title,file_path,file_name,status)
       values ($1,$2,$3,'cv',$4,$5,$6,'submitted')`,
      [pass?.id || null, candidateId, applicationId, pass ? `CV submitted for ${pass.position_title}` : "General submission CV", storedCv.storageKey, storedCv.originalName],
    );
    await client.query("update candidates set cv_file_path=$2, cv_file_name=$3, updated_at=now() where id=$1", [candidateId, storedCv.storageKey, storedCv.originalName]);
    await client.query("commit");
    return { candidateId, applicationId, reusedCandidate: Boolean(matches.rows[0]), duplicateApplication: false };
  } catch (error) {
    await client?.query("rollback").catch(() => undefined);
    await removeStoredCandidateDocument(storedCv.storageKey);
    throw error;
  } finally {
    client?.release();
  }
}

export async function reuseCandidateForPass(candidateId: number, passId: number) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1, $2)", [candidateId, passId]);
    const candidate = await client.query("select id from candidates where id=$1 and is_anonymized=false", [candidateId]);
    if (!candidate.rows[0]) throw new PublicIntakeError(404, "Candidate not found");
    const pass = await client.query<{id:number;status:string|null}>("select id,status from passes where id=$1", [passId]);
    if (!pass.rows[0]) throw new PublicIntakeError(404, "Vacancy not found");
    if (!OPEN_STATUSES.includes(pass.rows[0].status || "")) throw new PublicIntakeError(409, "This vacancy is not open");
    const existing = await client.query("select id from pass_candidates where candidate_id=$1 and pass_id=$2", [candidateId, passId]);
    if (existing.rows[0]) throw new PublicIntakeError(409, "Candidate already has an application for this vacancy");
    const result = await client.query("insert into pass_candidates (pass_id,candidate_id,status) values ($1,$2,'new') returning id", [passId, candidateId]);
    await client.query("commit");
    return result.rows[0];
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
