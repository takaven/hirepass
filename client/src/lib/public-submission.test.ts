import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPublicSubmissionConfirmation } from "./public-submission";

describe("public submission confirmation", () => {
  it("distinguishes general, new-vacancy and duplicate-vacancy outcomes", () => {
    assert.deepEqual(getPublicSubmissionConfirmation("general", {}), {
      title: "CV submitted",
      detail: "Your details and CV were received. The hiring team will contact you if there is a suitable next step.",
      candidatePassUrl: null,
    });
    assert.deepEqual(getPublicSubmissionConfirmation("vacancy", {}), {
      title: "Application received",
      detail: "Your application and CV were received. The hiring team will contact you if there is a suitable next step.",
      candidatePassUrl: null,
    });
    const withStatus = getPublicSubmissionConfirmation("vacancy", { candidatePassUrl: "https://careers.example.test/candidate-pass/token" });
    assert.equal(withStatus.candidatePassUrl, "https://careers.example.test/candidate-pass/token");
    const duplicate = getPublicSubmissionConfirmation("vacancy", { duplicateApplication: true, candidatePassUrl: "https://careers.example.test/candidate-pass/token" });
    assert.equal(duplicate.title, "Application already received");
    assert.equal(duplicate.detail, "Your existing application remains on file.");
    assert.equal(duplicate.candidatePassUrl, null);
    assert.doesNotMatch(duplicate.detail, /CV (was|were) (saved|received|stored)/i);
    const reusedCandidate = getPublicSubmissionConfirmation("vacancy", { reusedCandidate: true, candidatePassUrl: "https://careers.example.test/candidate-pass/token" });
    assert.equal(reusedCandidate.title, "Application received");
    assert.equal(reusedCandidate.candidatePassUrl, null);
  });
});
