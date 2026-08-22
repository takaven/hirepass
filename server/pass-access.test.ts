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

describe("Candidate Pass token access", () => {
  it("resolves an active token", () => {
    const result = resolvePassAccess({ isActive: true, expiresAt: "2026-08-23T12:00:00.000Z" }, candidateMessages, now);
    assert.equal(result.allowed, true);
  });

  it("rejects an inactive token", () => {
    assert.deepEqual(
      resolvePassAccess({ isActive: false, expiresAt: "2026-08-23T12:00:00.000Z" }, candidateMessages, now),
      { allowed: false, status: 404, error: "Invalid or inactive link" },
    );
  });

  it("rejects an expired token", () => {
    assert.deepEqual(
      resolvePassAccess({ isActive: true, expiresAt: "2026-08-21T12:00:00.000Z" }, candidateMessages, now),
      { allowed: false, status: 410, error: "Link has expired" },
    );
  });
});

describe("Manager Pass token access", () => {
  it("resolves an active token", () => {
    const result = resolvePassAccess({ isActive: true, expiresAt: "2026-08-23T12:00:00.000Z" }, managerMessages, now);
    assert.equal(result.allowed, true);
  });

  it("rejects an inactive token", () => {
    assert.deepEqual(
      resolvePassAccess({ isActive: false, expiresAt: "2026-08-23T12:00:00.000Z" }, managerMessages, now),
      { allowed: false, status: 404, error: "Invalid or inactive share link" },
    );
  });

  it("rejects an expired token", () => {
    assert.deepEqual(
      resolvePassAccess({ isActive: true, expiresAt: "2026-08-21T12:00:00.000Z" }, managerMessages, now),
      { allowed: false, status: 410, error: "Share link has expired" },
    );
  });
});

describe("Candidate Pass action state", () => {
  const activeLink = { isActive: true, expiresAt: "2026-08-23T12:00:00.000Z" };

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
});

describe("Manager Pass action state", () => {
  const activeLink = { isActive: true, expiresAt: "2026-08-23T12:00:00.000Z" };

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
