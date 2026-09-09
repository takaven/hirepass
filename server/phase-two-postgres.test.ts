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
  });
});
