import { pool } from "./db";
import { removeStoredCandidateDocument } from "./document-files";

export async function eraseCandidatePii(candidateId: number) {
  const client = await pool.connect();
  try {
    const candidateResult = await client.query<{ id: number; name: string; cv_file_path: string | null }>(
      "select id, name, cv_file_path from candidates where id = $1",
      [candidateId],
    );
    if (!candidateResult.rows[0]) return false;
    const filesResult = await client.query<{ file_path: string | null }>(
      `select cd.file_path from candidate_documents cd
       join pass_candidates pc on pc.id = cd.pass_candidate_id where pc.candidate_id = $1
       union all select file_path from documents where candidate_id = $1`,
      [candidateId],
    );
    const fileKeys = [candidateResult.rows[0].cv_file_path, ...filesResult.rows.map((row) => row.file_path)].filter(Boolean) as string[];

    // Erasure favours privacy safety: files are removed before database PII is anonymised.
    for (const fileKey of Array.from(new Set(fileKeys))) await removeStoredCandidateDocument(fileKey);

    await client.query("begin");
    await client.query(
      `update notifications set title = 'Candidate update', message = 'Candidate data erased', link = null
       where candidate_id = $1 or (candidate_id is null and position($2 in message) > 0)`,
      [candidateId, candidateResult.rows[0].name],
    );
    await client.query(
      `update candidates set
         name = $2, email = null, phone = null, current_title = null, current_company = null,
         experience_years = null, skills = '[]'::jsonb, current_location = null,
         willing_to_relocate = null, notice_period = null, expected_salary = null,
         expected_salary_currency = null, linkedin_url = null, cv_file_path = null,
         cv_file_name = null, cv_summary = null, in_talent_pool = false,
         talent_pool_tags = '[]'::jsonb, talent_pool_notes = null, source = null,
         source_details = null, privacy_notice_version = null, privacy_notice_accepted_at = null,
         retention_review_at = null, is_anonymized = true, anonymized_at = now(), updated_at = now()
       where id = $1`,
      [candidateId, `Erased candidate #${candidateId}`],
    );
    await client.query(
      `update candidate_links set is_active = false
       where pass_candidate_id in (select id from pass_candidates where candidate_id = $1)`, [candidateId],
    );
    await client.query(
      `delete from candidate_messages
       where pass_candidate_id in (select id from pass_candidates where candidate_id = $1)`, [candidateId],
    );
    await client.query(
      `update candidate_documents set label = 'Erased document', file_path = null, file_name = null, file_size = null,
         rejection_reason = null, status = 'erased', updated_at = now()
       where pass_candidate_id in (select id from pass_candidates where candidate_id = $1)`, [candidateId],
    );
    await client.query("update documents set title = 'Erased document', content = null, file_path = null, file_name = null, updated_at = now() where candidate_id = $1", [candidateId]);
    await client.query("update pass_candidates set ai_brief = null, selection_notes = null, rejection_reason = null, rejection_notes = null, updated_at = now() where candidate_id = $1", [candidateId]);
    await client.query("update assessment_responses set responses = '{}'::jsonb where pass_candidate_id in (select id from pass_candidates where candidate_id = $1)", [candidateId]);
    await client.query("update interviews set interview_notes = null, updated_at = now() where pass_candidate_id in (select id from pass_candidates where candidate_id = $1)", [candidateId]);
    await client.query(
      `update interview_evaluations set notes_observations = null, final_comments = null
       where interview_id in (select id from interviews where pass_candidate_id in (select id from pass_candidates where candidate_id = $1))`, [candidateId],
    );
    await client.query("update offers set benefits = null, decline_reason = null, negotiation_notes = null, updated_at = now() where pass_candidate_id in (select id from pass_candidates where candidate_id = $1)", [candidateId]);
    await client.query("update candidate_timeline_events set title = 'Candidate workflow event', description = null where pass_candidate_id in (select id from pass_candidates where candidate_id = $1)", [candidateId]);
    await client.query(
      `update onboarding_records set employee_id = null, reporting_to = null, work_location = null,
         checklist_items = '[]'::jsonb, required_documents = '[]'::jsonb, notes = null, hr_notes = null, updated_at = now()
       where pass_candidate_id in (select id from pass_candidates where candidate_id = $1)`, [candidateId],
    );
    await client.query(
      `update onboarding_links set is_active = false
       where onboarding_record_id in (select id from onboarding_records where pass_candidate_id in (select id from pass_candidates where candidate_id = $1))`, [candidateId],
    );
    await client.query(
      `update onboarding_stage_progress set stage_data = '{}'::jsonb, documents_required = '[]'::jsonb,
         documents_uploaded = '[]'::jsonb, notes = null, hr_notes = null, updated_at = now()
       where onboarding_record_id in (select id from onboarding_records where pass_candidate_id in (select id from pass_candidates where candidate_id = $1))`, [candidateId],
    );
    await client.query("update ai_conversations set content = '[candidate data erased]', tool_calls = null where candidate_id = $1", [candidateId]);
    await client.query(
      `update activity_log set actor_name = case when actor_type = 'candidate' then 'Erased candidate' else actor_name end,
         details = '{}'::jsonb where
         (target_type = 'candidate' and target_id = $1)
         or (target_type = 'pass_candidate' and target_id in (select id from pass_candidates where candidate_id = $1))
         or details->>'passCandidateId' in (select id::text from pass_candidates where candidate_id = $1)`, [candidateId],
    );
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
