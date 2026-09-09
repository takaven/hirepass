import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { pool } from "./db";
import { storage } from "./storage";

after(async () => pool.end());

describe("Phase 2 PostgreSQL workflow integrity", () => {
  it("persists bounded workflow, exact slot timing/interviewer, releases a slot on reschedule, and stores no synthetic scores", async () => {
    const suffix = Date.now();
    const manager = await pool.query<{id:number}>("insert into managers (name,job_title,email) values ('Phase Two Owner','Hiring Owner',$1) returning id", [`p2-${suffix}@example.test`]);
    const pass = await pool.query<{id:number}>("insert into passes (pass_id,position_title,department,location,employment_type,status,enabled_stages,hiring_manager_id) values ($1,'Phase Two Role','Test','Dubai','Full-time','active',$2,$3) returning id", [`HP-P2-${suffix}`, JSON.stringify(["new","interview","hired"]), manager.rows[0].id]);
    const candidate = await pool.query<{id:number}>("insert into candidates (name,email) values ('Phase Two Candidate',$1) returning id", [`candidate-${suffix}@example.test`]);
    const application = await pool.query<{id:number}>("insert into pass_candidates (pass_id,candidate_id,status) values ($1,$2,'interview') returning id", [pass.rows[0].id, candidate.rows[0].id]);
    const slot = await pool.query<{id:number}>("insert into interview_slots (pass_id,slot_date,start_time,end_time,duration,format,interviewer_id) values ($1,'2099-02-01','09:15','10:00',45,'online',$2) returning id", [pass.rows[0].id, manager.rows[0].id]);

    const booking = await storage.bookInterviewSlotAndCreateInterview(slot.rows[0].id, application.rows[0].id, pass.rows[0].id);
    assert.ok(booking);
    assert.equal(booking.interview.duration, 45);
    assert.equal(booking.interview.endTime, "10:00");
    assert.equal(booking.interview.interviewerId, manager.rows[0].id);
    assert.equal(booking.interview.slotId, slot.rows[0].id);

    const rescheduled = await storage.rescheduleInterview(booking.interview.id, { interviewDate: "2099-02-02", startTime: "11:00", endTime: "11:30", duration: 30, interviewerId: manager.rows[0].id });
    assert.equal(rescheduled?.startTime, "11:00");
    assert.equal(rescheduled?.slotId, null);
    assert.equal((await pool.query("select is_booked,booked_by from interview_slots where id=$1", [slot.rows[0].id])).rows[0].is_booked, false);

    const evaluation = await storage.submitInterviewEvaluation({ interviewId: booking.interview.id, evaluatorId: manager.rows[0].id, recommendation: "proceed", notesObservations: "Evidence supplied by evaluator" }, application.rows[0].id);
    assert.equal(evaluation.averageScore, null);
    assert.equal(evaluation.educationalBackground, null);
    assert.equal(evaluation.technicalSkills, null);
    assert.equal((await pool.query("select interview_recommendation,interview_score from pass_candidates where id=$1", [application.rows[0].id])).rows[0].interview_recommendation, "proceed");

    const noInterviewPass = await pool.query<{id:number}>("insert into passes (pass_id,position_title,department,location,employment_type,status,enabled_stages) values ($1,'No Interview Role','Test','Dubai','Full-time','active',$2) returning id", [`HP-P2-NI-${suffix}`, JSON.stringify(["new","screening","hired"])]);
    const noInterviewApplication = await pool.query<{id:number}>("insert into pass_candidates (pass_id,candidate_id,status) values ($1,$2,'screening') returning id", [noInterviewPass.rows[0].id, candidate.rows[0].id]);
    const blockedSlot = await pool.query<{id:number}>("insert into interview_slots (pass_id,slot_date,start_time,end_time,duration,format,interviewer_id) values ($1,'2099-02-03','09:00','09:30',30,'online',$2) returning id", [noInterviewPass.rows[0].id, manager.rows[0].id]);
    assert.equal(await storage.bookInterviewSlotAndCreateInterview(blockedSlot.rows[0].id, noInterviewApplication.rows[0].id, noInterviewPass.rows[0].id), undefined);
    const unchanged = await pool.query("select is_booked,booked_by from interview_slots where id=$1", [blockedSlot.rows[0].id]);
    assert.equal(unchanged.rows[0].is_booked, false);
    assert.equal(unchanged.rows[0].booked_by, null);
  });

  it("atomically persists interview setup and rolls back the complete slot set on a later slot failure", async () => {
    const suffix = Date.now();
    const manager = await pool.query<{id:number}>("insert into managers (name,job_title,email,can_be_interviewer) values ('Setup Interviewer','Interviewer',$1,true) returning id", [`setup-${suffix}@example.test`]);
    const pass = await pool.query<{id:number}>("insert into passes (pass_id,position_title,department,location,employment_type,status,enabled_stages,interview_setup_completed) values ($1,'Atomic Setup Role','Test','Dubai','Full-time','active',$2,false) returning id", [`HP-P2-AS-${suffix}`, JSON.stringify(["new","interview","hired"])]);
    const slots = ["09:00", "10:00"].map((startTime, index) => ({ passId: pass.rows[0].id, slotDate: "2099-03-01", startTime, endTime: index ? "10:45" : "09:45", duration: 45, format: "online", meetingLink: "https://example.test/interview", interviewerId: manager.rows[0].id }));

    const committed = await storage.configureInterviewSetup(pass.rows[0].id, { interviewSetupCompleted: true, interviewDuration: 45, interviewFormat: "online" }, slots);
    assert.equal(committed.length, 2);
    assert.equal((await pool.query("select interview_setup_completed from passes where id=$1", [pass.rows[0].id])).rows[0].interview_setup_completed, true);

    await pool.query("delete from interview_slots where pass_id=$1", [pass.rows[0].id]);
    await pool.query("update passes set interview_setup_completed=false where id=$1", [pass.rows[0].id]);
    await pool.query(`create function pg_temp.reject_later_slot() returns trigger language plpgsql as $$ begin if new.start_time = '10:00' then raise exception 'injected later slot failure'; end if; return new; end $$`);
    await pool.query("create trigger phase_two_slot_failure before insert on interview_slots for each row execute function pg_temp.reject_later_slot()");
    try {
      await assert.rejects(storage.configureInterviewSetup(pass.rows[0].id, { interviewSetupCompleted: true }, slots));
    } finally {
      await pool.query("drop trigger phase_two_slot_failure on interview_slots");
    }
    assert.equal((await pool.query("select interview_setup_completed from passes where id=$1", [pass.rows[0].id])).rows[0].interview_setup_completed, false);
    assert.equal((await pool.query("select count(*)::int as count from interview_slots where pass_id=$1", [pass.rows[0].id])).rows[0].count, 0);
  });

  it("atomically creates a direct interview and advances its application", async () => {
    const suffix = Date.now();
    const manager = await pool.query<{id:number}>("insert into managers (name,job_title,email,can_be_interviewer) values ('Direct Interviewer','Interviewer',$1,true) returning id", [`direct-${suffix}@example.test`]);
    const pass = await pool.query<{id:number}>("insert into passes (pass_id,position_title,department,location,employment_type,status,enabled_stages) values ($1,'Atomic Direct Role','Test','Dubai','Full-time','active',$2) returning id", [`HP-P2-AD-${suffix}`, JSON.stringify(["new","interview","hired"])]);
    const candidate = await pool.query<{id:number}>("insert into candidates (name,email) values ('Atomic Candidate',$1) returning id", [`atomic-${suffix}@example.test`]);
    const application = await pool.query<{id:number}>("insert into pass_candidates (pass_id,candidate_id,status) values ($1,$2,'new') returning id", [pass.rows[0].id, candidate.rows[0].id]);
    const interview = { passId: pass.rows[0].id, passCandidateId: application.rows[0].id, interviewerId: manager.rows[0].id, interviewDate: "2099-04-01", startTime: "09:00", endTime: "09:45", duration: 45, format: "online", status: "scheduled" };

    await pool.query(`create function pg_temp.reject_application_advance() returns trigger language plpgsql as $$ begin if new.status = 'interview' then raise exception 'injected application advancement failure'; end if; return new; end $$`);
    await pool.query("create trigger phase_two_application_failure before update on pass_candidates for each row execute function pg_temp.reject_application_advance()");
    try {
      await assert.rejects(storage.createInterviewAndAdvanceCandidate(interview));
    } finally {
      await pool.query("drop trigger phase_two_application_failure on pass_candidates");
    }
    assert.equal((await pool.query("select count(*)::int as count from interviews where pass_candidate_id=$1", [application.rows[0].id])).rows[0].count, 0);
    assert.equal((await pool.query("select status from pass_candidates where id=$1", [application.rows[0].id])).rows[0].status, "new");

    const committed = await storage.createInterviewAndAdvanceCandidate(interview);
    assert.ok(committed.id);
    assert.equal((await pool.query("select status from pass_candidates where id=$1", [application.rows[0].id])).rows[0].status, "interview");
  });

  it("atomically commits or rolls back candidate offer responses", async () => {
    const suffix = Date.now();
    const pass = await pool.query<{id:number}>("insert into passes (pass_id,position_title,department,location,employment_type,status) values ($1,'Offer Role','Test','Dubai','Full-time','active') returning id", [`HP-P2-OF-${suffix}`]);
    const candidate = await pool.query<{id:number}>("insert into candidates (name,email) values ('Offer Candidate',$1) returning id", [`offer-${suffix}@example.test`]);
    const application = await pool.query<{id:number}>("insert into pass_candidates (pass_id,candidate_id,status) values ($1,$2,'offer') returning id", [pass.rows[0].id, candidate.rows[0].id]);
    const createOffer = async () => storage.createOffer({ passId: pass.rows[0].id, passCandidateId: application.rows[0].id, salary: 7500, salaryCurrency: "USD", status: "pending" });

    await pool.query(`create function pg_temp.reject_offer_application_change() returns trigger language plpgsql as $$ begin if new.status in ('hired','rejected') then raise exception 'injected offer application failure'; end if; return new; end $$`);
    await pool.query("create trigger phase_three_offer_application_failure before update on pass_candidates for each row execute function pg_temp.reject_offer_application_change()");
    let pendingOffer = await createOffer();
    await assert.rejects(storage.respondToCandidateOffer(pendingOffer, "accept", null));
    assert.equal((await pool.query("select status from offers where id=$1", [pendingOffer.id])).rows[0].status, "pending");
    assert.equal((await pool.query("select status from pass_candidates where id=$1", [application.rows[0].id])).rows[0].status, "offer");
    await pool.query("delete from offers where id=$1", [pendingOffer.id]);

    pendingOffer = await createOffer();
    await assert.rejects(storage.respondToCandidateOffer(pendingOffer, "decline", "Candidate supplied reason"));
    assert.equal((await pool.query("select status,decline_reason from offers where id=$1", [pendingOffer.id])).rows[0].status, "pending");
    assert.equal((await pool.query("select status,rejection_notes from pass_candidates where id=$1", [application.rows[0].id])).rows[0].status, "offer");
    await pool.query("drop trigger phase_three_offer_application_failure on pass_candidates");
    await pool.query("delete from offers where id=$1", [pendingOffer.id]);

    const accepted = await storage.respondToCandidateOffer(await createOffer(), "accept", null);
    assert.equal(accepted.status, "accepted");
    assert.equal((await pool.query("select status from pass_candidates where id=$1", [application.rows[0].id])).rows[0].status, "hired");
    await pool.query("update pass_candidates set status='offer',rejection_reason=null,rejection_notes=null,rejected_at=null where id=$1", [application.rows[0].id]);
    const declined = await storage.respondToCandidateOffer(await createOffer(), "decline", null);
    assert.equal(declined.status, "declined");
    const declinedApplication = (await pool.query("select status,rejection_notes from pass_candidates where id=$1", [application.rows[0].id])).rows[0];
    assert.equal(declinedApplication.status, "rejected");
    assert.equal(declinedApplication.rejection_notes, null);
  });
});
