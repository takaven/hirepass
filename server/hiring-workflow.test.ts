import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowedCandidateStatus, configuredStages, HIRING_STAGE_LABELS, nextConfiguredStage, validateConfiguredStages } from "@shared/hiring-workflow";
import { resolveManagerPassState } from "./manager-pass-state";

describe("bounded hiring workflows", () => {
  it("keeps the full workflow and accepts only canonical ordered subsets", () => {
    assert.equal(HIRING_STAGE_LABELS.new, "Applied");
    assert.equal(HIRING_STAGE_LABELS.screening, "Review");
    assert.deepEqual(configuredStages(undefined), ["new", "screening", "shortlisted", "interview", "offer", "hired"]);
    assert.equal(validateConfiguredStages(["new", "interview", "hired"]), true);
    assert.equal(validateConfiguredStages(["new", "custom", "hired"]), false);
    assert.equal(validateConfiguredStages(["new", "offer", "interview", "hired"]), false);
    assert.equal(allowedCandidateStatus("screening", ["new", "interview", "hired"]), false);
    assert.equal(allowedCandidateStatus("rejected", ["new", "interview", "hired"]), true);
  });

  it("advances reduced workflows without disabled stages", () => {
    assert.equal(nextConfiguredStage("new", ["new", "interview", "hired"]), "interview");
    assert.equal(nextConfiguredStage("interview", ["new", "interview", "hired"]), "hired");
  });

  it("supports a no-HR owner and waits for real interview completion before evaluation", () => {
    const base = { link: { isActive: true, expiresAt: "2099-01-01" }, pass: { jdStatus: "approved", enabledStages: ["new", "interview", "hired"], interviewSetupCompleted: false }, candidates: [{ id: 1, status: "new" }] };
    assert.equal(resolveManagerPassState(base).nextDecision.kind, "REVIEW_CANDIDATE");
    const setup = { ...base, pass: { ...base.pass, interviewSetupCompleted: true }, candidates: [{ id: 1, status: "interview" }], interviews: [{ id: 1, passCandidateId: 1, status: "scheduled", interviewDate: "2099-01-01" }] };
    assert.equal(resolveManagerPassState(setup).actionState, "UPCOMING");
    const completed = { ...setup, interviews: [{ ...setup.interviews[0], status: "completed" }] };
    assert.equal(resolveManagerPassState(completed).nextDecision.kind, "SUBMIT_EVALUATION");
    assert.equal(resolveManagerPassState(completed).summary.includes("HR"), false);
  });
});
