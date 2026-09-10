import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  presentCandidateSource,
  presentHiringStage,
  presentHiringStatusLabel,
} from "../../../shared/hiring-workflow";

describe("hiring workflow presentation", () => {
  it("compresses internal workflow statuses into the simple V1 journey", () => {
    assert.equal(presentHiringStatusLabel("new"), "Applied");
    assert.equal(presentHiringStatusLabel("screening"), "Review");
    assert.equal(presentHiringStatusLabel("shortlisted"), "Review");
    assert.equal(presentHiringStatusLabel("assessment"), "Review");
    assert.equal(presentHiringStatusLabel("interview"), "Interview");
    assert.equal(presentHiringStatusLabel("offer"), "Decision");
    assert.deepEqual(
      ["new", "screening", "assessment", "shortlisted", "interview", "offer"].map((status) => presentHiringStage(status).label),
      ["Applied", "Review", "Review", "Review", "Interview", "Decision"],
    );
  });

  it("presents terminal outcomes separately from journey steps", () => {
    assert.deepEqual(presentHiringStage("hired"), {
      step: "decision",
      label: "Decision",
      outcome: "hired",
      outcomeLabel: "Hired",
    });
    assert.equal(presentHiringStatusLabel("rejected"), "Not selected");
    assert.equal(presentHiringStatusLabel("withdrawn"), "Withdrawn");
    assert.equal(presentHiringStatusLabel("handoff"), "Hired");
  });

  it("turns raw candidate source enums into human labels", () => {
    assert.equal(presentCandidateSource("public_application"), "Careers application");
    assert.equal(presentCandidateSource("general_submission"), "Talent pool");
    assert.equal(presentCandidateSource("manual"), "Added by hiring team");
  });
});
