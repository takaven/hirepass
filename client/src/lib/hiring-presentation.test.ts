import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  allowedCandidateStatus,
  backendStatusForVisiblePhase,
  canonicalVisibleHiringPhases,
  candidateStatusOptions,
  isInterviewEnabled,
  isOperationallyOpenVacancy,
  presentCandidateSource,
  presentHiringStage,
  presentHiringStatusLabel,
  stagesFromVisibleWorkflow,
  TERMINAL_HIRING_OUTCOMES,
  uniqueVisibleHiringPhases,
  visibleStatusValue,
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

  it("exposes each visible journey phase once", () => {
    const phases = uniqueVisibleHiringPhases(["new", "screening", "shortlisted", "interview", "offer", "hired"]);
    assert.deepEqual(phases.map((phase) => phase.label), ["Applied", "Review", "Interview", "Decision"]);
    assert.equal(phases.filter((phase) => phase.label === "Review").length, 1);
  });

  it("keeps the canonical new-vacancy journey fixed", () => {
    assert.deepEqual(canonicalVisibleHiringPhases().map((phase) => phase.label), ["Applied", "Review", "Interview", "Decision"]);
  });

  it("keeps terminal outcomes separate from configurable phases", () => {
    assert.deepEqual(TERMINAL_HIRING_OUTCOMES.map((outcome) => outcome.label), ["Hired", "Not selected", "Withdrawn"]);
    assert.equal(uniqueVisibleHiringPhases().some((phase) => phase.label === "Hired"), false);
  });

  it("generates unique human-facing candidate status choices", () => {
    const options = candidateStatusOptions(["new", "screening", "shortlisted", "interview", "offer", "hired"]);
    assert.deepEqual(options.map((option) => option.label), ["Applied", "Review", "Interview", "Decision", "Hired", "Not selected", "Withdrawn"]);
    assert.equal(options.filter((option) => option.label === "Review").length, 1);
    assert.equal(options.some((option) => option.label === "Shortlisted"), false);
    assert.equal(options.some((option) => option.label === "Offer"), false);
  });

  it("maps internal review states to one visible Review selection", () => {
    assert.equal(visibleStatusValue("screening"), "screening");
    assert.equal(visibleStatusValue("shortlisted"), "screening");
    assert.equal(visibleStatusValue("assessment"), "screening");
  });

  it("preserves a valid bounded workflow when Interview is disabled", () => {
    assert.equal(isInterviewEnabled(stagesFromVisibleWorkflow({ interviewEnabled: true })), true);
    assert.deepEqual(stagesFromVisibleWorkflow({ interviewEnabled: false }), ["new", "screening", "shortlisted", "offer", "hired"]);
    assert.deepEqual(uniqueVisibleHiringPhases(stagesFromVisibleWorkflow({ interviewEnabled: false })).map((phase) => phase.label), ["Applied", "Review", "Decision"]);
    assert.equal(candidateStatusOptions(stagesFromVisibleWorkflow({ interviewEnabled: false })).some((option) => option.label === "Interview"), false);
  });

  it("does not expose Review or Decision for legacy workflows that cannot accept those statuses", () => {
    const stages = ["new", "interview", "hired"];
    const phases = uniqueVisibleHiringPhases(stages);
    const options = candidateStatusOptions(stages);

    assert.deepEqual(phases.map((phase) => phase.label), ["Applied", "Interview"]);
    assert.equal(options.some((option) => option.label === "Review"), false);
    assert.equal(options.some((option) => option.label === "Decision"), false);
    assert.equal(options.every((option) => allowedCandidateStatus(option.value, stages)), true);
  });

  it("maps legacy shortlisted-only Review to shortlisted", () => {
    const stages = ["new", "shortlisted", "interview", "hired"];
    assert.deepEqual(uniqueVisibleHiringPhases(stages).map((phase) => phase.label), ["Applied", "Review", "Interview"]);
    assert.equal(backendStatusForVisiblePhase("review", stages), "shortlisted");
    assert.equal(visibleStatusValue("shortlisted", stages), "shortlisted");
    assert.equal(candidateStatusOptions(stages).find((option) => option.label === "Review")?.value, "shortlisted");
  });

  it("maps legacy screening-only Review to screening", () => {
    const stages = ["new", "screening", "interview", "hired"];
    assert.deepEqual(uniqueVisibleHiringPhases(stages).map((phase) => phase.label), ["Applied", "Review", "Interview"]);
    assert.equal(backendStatusForVisiblePhase("review", stages), "screening");
    assert.equal(visibleStatusValue("screening", stages), "screening");
    assert.equal(candidateStatusOptions(stages).find((option) => option.label === "Review")?.value, "screening");
  });

  it("does not expose Interview for legacy workflows without interview", () => {
    const stages = ["new", "screening", "offer", "hired"];
    assert.deepEqual(uniqueVisibleHiringPhases(stages).map((phase) => phase.label), ["Applied", "Review", "Decision"]);
    assert.equal(candidateStatusOptions(stages).some((option) => option.label === "Interview"), false);
    assert.equal(candidateStatusOptions(stages).every((option) => allowedCandidateStatus(option.value, stages)), true);
  });

  it("uses one open vacancy definition for Home and Analytics", () => {
    for (const status of ["active", "open", "in_progress", "screening", "sourcing"]) {
      assert.equal(isOperationallyOpenVacancy(status), true);
    }
    for (const status of ["draft", "on_hold", "filled", "closed_hired", "closed_cancelled", "cancelled", undefined]) {
      assert.equal(isOperationallyOpenVacancy(status), false);
    }
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

  it("guards Candidate Library against duplicate Talent pool badges", () => {
    const source = readFileSync("client/src/pages/candidate-profile.tsx", "utf8");
    assert.match(source, /presentCandidateSource\(candidate\.source\) !== "Talent pool"/);
  });

  it("keeps Hiring Control language action-led and labels expiry extension", () => {
    const source = readFileSync("client/src/pages/hr-pass-control.tsx", "utf8");
    assert.match(source, /<h1[^>]*>Hiring Control<\/h1>/);
    assert.match(source, /Extend access until/);
    assert.match(source, /Send stakeholder access/);
    assert.match(source, /Send candidate access/);
    assert.doesNotMatch(source, /Internal Pass Control/);
    assert.doesNotMatch(source, /Next Pass action/);
    assert.doesNotMatch(source, /Stalled Passes/);
    assert.doesNotMatch(source, /Pass Handoff:/);
    assert.doesNotMatch(source, /text-blue-700/);
    assert.doesNotMatch(source, /bg-cyan-50/);
  });

  it("preserves the application-scoped AI review surface", () => {
    const source = readFileSync("client/src/pages/pass-candidates.tsx", "utf8");
    assert.match(source, /AI-assisted review/);
    assert.match(source, /Human decision required/);
    assert.match(source, /evidence\.excerpt/);
    assert.match(source, /Material gaps:/);
    assert.match(source, /Clarify:/);
    assert.match(source, /Suggest questions/);
  });
});
