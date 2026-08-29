import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePassAccess } from "./pass-access";
import { resolveCandidatePassState } from "./candidate-pass-state";
import { isPassScopedCandidate, isPassScopedInterview, resolveManagerPassState } from "./manager-pass-state";

const managerMessages = {
  inactive: "Invalid or inactive share link",
  expired: "Share link has expired",
};

const candidateMessages = {
  inactive: "Invalid or inactive link",
  expired: "Link has expired",
};

const now = new Date("2026-08-22T12:00:00.000Z");
const futureExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
const pastExpiry = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

describe("Candidate Pass token access", () => {
  it("resolves an active token", () => {
    const result = resolvePassAccess({ isActive: true, expiresAt: futureExpiry }, candidateMessages, now);
    assert.equal(result.allowed, true);
  });

  it("rejects an inactive token", () => {
    assert.deepEqual(
      resolvePassAccess({ isActive: false, expiresAt: futureExpiry }, candidateMessages, now),
      { allowed: false, status: 404, error: "Invalid or inactive link" },
    );
  });

  it("rejects an expired token", () => {
    assert.deepEqual(
      resolvePassAccess({ isActive: true, expiresAt: pastExpiry }, candidateMessages, now),
      { allowed: false, status: 410, error: "Link has expired" },
    );
  });
});

describe("Manager Pass token access", () => {
  it("resolves an active token", () => {
    const result = resolvePassAccess({ isActive: true, expiresAt: futureExpiry }, managerMessages, now);
    assert.equal(result.allowed, true);
  });

  it("rejects an inactive token", () => {
    assert.deepEqual(
      resolvePassAccess({ isActive: false, expiresAt: futureExpiry }, managerMessages, now),
      { allowed: false, status: 404, error: "Invalid or inactive share link" },
    );
  });

  it("rejects an expired token", () => {
    assert.deepEqual(
      resolvePassAccess({ isActive: true, expiresAt: pastExpiry }, managerMessages, now),
      { allowed: false, status: 410, error: "Share link has expired" },
    );
  });
});

describe("Candidate Pass action state", () => {
  const activeLink = { isActive: true, expiresAt: futureExpiry };

  it("marks an actionable candidate as ACTION_REQUIRED", () => {
    const state = resolveCandidatePassState({
      link: activeLink,
      passCandidate: { status: "shortlisted" },
      pass: {},
      interviewSlots: [{ id: 1 }],
      now,
    });

    assert.equal(state.actionState, "ACTION_REQUIRED");
    assert.equal(state.hiringStage, "Interview");
    assert.equal(state.nextAction.kind, "CHOOSE_INTERVIEW_SLOT");
  });

  it("marks a candidate with no current action as WAITING", () => {
    const state = resolveCandidatePassState({
      link: activeLink,
      passCandidate: { status: "screening" },
      pass: {},
      messages: [],
      documents: [],
      interviews: [],
      interviewSlots: [],
      now,
    });

    assert.equal(state.actionState, "WAITING");
    assert.equal(state.nextAction.kind, "NONE");
    assert.equal(state.waitingOn, "Hiring team");
    assert.equal(state.yourAction, "No action required");
    assert.equal(state.expectedMovement, "Expected movement: the hiring team will update this Pass when the next step is ready.");
  });

  it("marks a candidate with a future interview as UPCOMING", () => {
    const state = resolveCandidatePassState({
      link: activeLink,
      passCandidate: { status: "interview" },
      pass: {},
      interviews: [{ status: "scheduled", interviewDate: "2026-08-24T12:00:00.000Z" }],
      interviewSlots: [],
      now,
    });

    assert.equal(state.actionState, "UPCOMING");
    assert.equal(state.hiringStage, "Interview");
    assert.match(state.latestUpdate, /Interview details available/);
  });

  it("marks a hired candidate journey as COMPLETED", () => {
    const state = resolveCandidatePassState({
      link: activeLink,
      passCandidate: { status: "hired" },
      pass: {},
      now,
    });

    assert.equal(state.actionState, "COMPLETED");
    assert.equal(state.hiringStage, "Handoff");
  });

  it("updates the dominant action after a candidate books an interview slot", () => {
    const before = resolveCandidatePassState({
      link: activeLink,
      passCandidate: { status: "shortlisted" },
      pass: {},
      interviewSlots: [{ id: 1 }],
      now,
    });
    const after = resolveCandidatePassState({
      link: activeLink,
      passCandidate: { status: "interview" },
      pass: {},
      interviews: [{ status: "scheduled", interviewDate: "2026-08-24T12:00:00.000Z" }],
      interviewSlots: [],
      now,
    });

    assert.equal(before.actionState, "ACTION_REQUIRED");
    assert.equal(before.nextAction.kind, "CHOOSE_INTERVIEW_SLOT");
    assert.equal(after.actionState, "UPCOMING");
    assert.notEqual(after.nextAction.kind, "CHOOSE_INTERVIEW_SLOT");
  });

  it("derives a candidate-safe meaningful latest update from workflow activity", () => {
    const state = resolveCandidatePassState({
      link: activeLink,
      passCandidate: { id: 101, status: "offer" },
      pass: {},
      activity: [{
        action: "manager_final_decision_submitted",
        actorType: "manager",
        actorName: "Private Manager Name",
        targetType: "pass_candidate",
        targetId: 101,
        details: { passCandidateId: 101, decision: "hire", internalScore: 94 },
        createdAt: "2026-08-22T10:32:00.000Z",
      }],
      now,
    });

    assert.equal(state.latestUpdate, "Hiring Manager submitted a decision · today, 10:32");
    assert.equal(state.latestUpdateAt, "2026-08-22T10:32:00.000Z");
    assert.equal(state.passHandoff, "Pass Handoff: Hiring Manager -> HR");
    assert.equal(state.latestUpdate.includes("Private Manager Name"), false);
    assert.equal(state.latestUpdate.includes("internalScore"), false);
  });

  it("uses an explicit checkpoint when an expected movement date exists", () => {
    const state = resolveCandidatePassState({
      link: activeLink,
      passCandidate: { status: "screening" },
      pass: { targetHireDate: "2026-08-29T00:00:00.000Z" },
      messages: [],
      documents: [],
      interviews: [],
      interviewSlots: [],
      now,
    });

    assert.match(state.expectedMovement, /2026-08-29/);
  });

  it("shows Hiring Manager ownership when manager action is outstanding", () => {
    const state = resolveCandidatePassState({
      link: activeLink,
      passCandidate: { id: 101, status: "interview" },
      pass: {},
      interviews: [{ status: "completed", interviewDate: "2026-08-21T12:00:00.000Z" }],
      interviewSlots: [],
      managerPassState: {
        actionState: "ACTION_REQUIRED",
        nextDecision: { label: "Submit interview evaluation", description: "Record structured feedback." },
      },
      now,
    });

    assert.equal(state.actionState, "WAITING");
    assert.equal(state.waitingOn, "Hiring Manager");
    assert.equal(state.nextAction.kind, "NONE");
    assert.equal(state.next, "Submit interview evaluation");
  });

  it("does not report Hiring Manager ownership when no manager action is outstanding", () => {
    const state = resolveCandidatePassState({
      link: activeLink,
      passCandidate: { id: 101, status: "interview" },
      pass: {},
      interviews: [{ status: "completed", interviewDate: "2026-08-21T12:00:00.000Z" }],
      interviewSlots: [],
      managerPassState: {
        actionState: "COMPLETED",
        nextDecision: { label: "No decision required", description: "HR will handle the next step." },
      },
      now,
    });

    assert.notEqual(state.waitingOn, "Hiring Manager");
  });

  it("does not use another candidate's newer offer activity as the latest update", () => {
    const state = resolveCandidatePassState({
      link: activeLink,
      passCandidate: { id: 101, status: "screening" },
      pass: {},
      activity: [
        {
          action: "candidate_offer_response_submitted",
          targetType: "offer",
          targetId: 888,
          details: { passCandidateId: 202 },
          createdAt: "2026-08-22T11:45:00.000Z",
        },
        {
          action: "candidate_assessment_completed",
          targetType: "pass_candidate",
          targetId: 101,
          details: { passCandidateId: 101 },
          createdAt: "2026-08-22T09:00:00.000Z",
        },
      ],
      now,
    });

    assert.match(state.latestUpdate, /Assessment completion recorded/);
    assert.equal(state.latestUpdate.includes("Offer response"), false);
  });

  it("does not use another candidate's newer candidate-link activity as the latest update", () => {
    const state = resolveCandidatePassState({
      link: activeLink,
      passCandidate: { id: 101, status: "screening" },
      pass: {},
      activity: [
        {
          action: "candidate_pass_issued",
          targetType: "candidate_link",
          targetId: 999,
          details: { passCandidateId: 202 },
          createdAt: "2026-08-22T11:45:00.000Z",
        },
        {
          action: "candidate_document_submitted",
          targetType: "candidate_document",
          targetId: 777,
          details: { passCandidateId: 101 },
          createdAt: "2026-08-22T09:00:00.000Z",
        },
      ],
      now,
    });

    assert.match(state.latestUpdate, /Document received/);
    assert.equal(state.latestUpdate.includes("Candidate Pass issued"), false);
  });

  it("uses completed-interview wording only for past interviews", () => {
    const completed = resolveCandidatePassState({
      link: activeLink,
      passCandidate: { id: 101, status: "interview" },
      pass: {},
      interviews: [{ status: "completed", interviewDate: "2026-08-21T12:00:00.000Z" }],
      interviewSlots: [],
      now,
    });
    const future = resolveCandidatePassState({
      link: activeLink,
      passCandidate: { id: 101, status: "interview" },
      pass: {},
      interviews: [{ status: "scheduled", interviewDate: "2026-08-24T12:00:00.000Z" }],
      interviewSlots: [],
      now,
    });

    assert.match(completed.latestUpdate, /Interview completed/);
    assert.equal(future.latestUpdate.includes("Interview completed"), false);
  });
});

describe("Manager Pass action state", () => {
  const activeLink = { isActive: true, expiresAt: futureExpiry };

  it("marks a pending manager decision as ACTION_REQUIRED", () => {
    const state = resolveManagerPassState({
      link: activeLink,
      pass: { id: 10, jdStatus: "approved", interviewSetupCompleted: true, positionTitle: "Operations Lead" },
      candidates: [{ id: 101, passId: 10, status: "screening", candidate: { name: "Fictional Candidate" } }],
      now,
    });

    assert.equal(state.actionState, "ACTION_REQUIRED");
    assert.equal(state.nextDecision.kind, "REVIEW_CANDIDATE");
    assert.equal(state.nextDecision.candidateId, 101);
  });

  it("marks no pending manager decision as WAITING", () => {
    const state = resolveManagerPassState({
      link: activeLink,
      pass: { id: 10, jdStatus: "approved", interviewSetupCompleted: true, positionTitle: "Operations Lead" },
      candidates: [],
      interviews: [],
      now,
    });

    assert.equal(state.actionState, "WAITING");
    assert.equal(state.nextDecision.kind, "NONE");
    assert.equal(state.waitingOn, "HR");
    assert.equal(state.expectedMovement, "Expected movement: HR will update this Pass when the next step is ready.");
  });

  it("uses natural expected movement copy for manager-owned candidate states", () => {
    const state = resolveCandidatePassState({
      link: activeLink,
      passCandidate: { id: 101, status: "interview" },
      pass: {},
      interviews: [{ status: "completed", interviewDate: "2026-08-21T12:00:00.000Z" }],
      interviewSlots: [],
      managerPassState: {
        actionState: "ACTION_REQUIRED",
        nextDecision: { label: "Submit interview evaluation", description: "Record structured feedback." },
      },
      now,
    });

    assert.equal(state.expectedMovement, "Expected movement: the hiring manager will submit interview evaluation.");
    assert.equal(state.expectedMovement.includes("completes review candidate"), false);
    assert.equal(state.expectedMovement.includes("hiring team completes hiring team"), false);
  });

  it("marks an upcoming interview event as UPCOMING", () => {
    const state = resolveManagerPassState({
      link: activeLink,
      pass: { id: 10, jdStatus: "approved", interviewSetupCompleted: true, positionTitle: "Operations Lead" },
      candidates: [{ id: 101, passId: 10, status: "shortlisted", candidate: { name: "Fictional Candidate" } }],
      interviews: [{ id: 55, status: "scheduled", interviewDate: "2026-08-24T12:00:00.000Z", passCandidateId: 101 }],
      now,
    });

    assert.equal(state.actionState, "UPCOMING");
    assert.equal(state.hiringStage, "Interview");
  });

  it("marks completed manager obligations as COMPLETED", () => {
    const state = resolveManagerPassState({
      link: activeLink,
      pass: { id: 10, jdStatus: "approved", interviewSetupCompleted: true, positionTitle: "Operations Lead" },
      candidates: [{ id: 101, passId: 10, status: "offer", candidate: { name: "Fictional Candidate" } }],
      now,
    });

    assert.equal(state.actionState, "COMPLETED");
    assert.equal(state.nextDecision.kind, "NONE");
  });

  it("updates the dominant decision after a manager submits a candidate decision", () => {
    const before = resolveManagerPassState({
      link: activeLink,
      pass: { id: 10, jdStatus: "approved", interviewSetupCompleted: true, positionTitle: "Operations Lead" },
      candidates: [{ id: 101, passId: 10, status: "screening", candidate: { name: "Fictional Candidate" } }],
      now,
    });
    const after = resolveManagerPassState({
      link: activeLink,
      pass: { id: 10, jdStatus: "approved", interviewSetupCompleted: false, positionTitle: "Operations Lead" },
      candidates: [{ id: 101, passId: 10, status: "shortlisted", candidate: { name: "Fictional Candidate" } }],
      now,
    });

    assert.equal(before.nextDecision.kind, "REVIEW_CANDIDATE");
    assert.equal(after.nextDecision.kind, "SET_INTERVIEW_AVAILABILITY");
  });

  it("shows manager Pass handoff after manager work is complete", () => {
    const state = resolveManagerPassState({
      link: activeLink,
      pass: { id: 10, jdStatus: "approved", interviewSetupCompleted: true, positionTitle: "Operations Lead" },
      candidates: [{ id: 101, passId: 10, status: "offer", candidate: { name: "Fictional Candidate" } }],
      now,
    });

    assert.equal(state.actionState, "COMPLETED");
    assert.equal(state.passHandoff, "Pass Handoff: Hiring Manager -> HR");
    assert.equal(state.waitingOn, "HR");
  });

  it("keeps manager candidate actions scoped to the pass", () => {
    assert.equal(isPassScopedCandidate(10, { passId: 10 }), true);
    assert.equal(isPassScopedCandidate(10, { passId: 11 }), false);
    assert.equal(isPassScopedCandidate(10, null), false);
  });

  it("keeps manager interview actions scoped to the pass", () => {
    assert.equal(isPassScopedInterview(10, { passId: 10 }), true);
    assert.equal(isPassScopedInterview(10, { passId: 11 }), false);
    assert.equal(isPassScopedInterview(10, undefined), false);
  });
});
