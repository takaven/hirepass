import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPublicSubmissionConfirmation } from "./public-submission";
import { externalPassLandingPath } from "@shared/external-pass-links";

const candidateToken = `cand_${"F".repeat(43)}`;
const candidateUrl = `https://careers.example.test${externalPassLandingPath("candidate", candidateToken)}`;

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
    const withStatus = getPublicSubmissionConfirmation("vacancy", { candidatePassUrl: candidateUrl });
    assert.equal(withStatus.candidatePassUrl, candidateUrl);
    const parsedStatusUrl = new URL(candidateUrl);
    assert.equal(parsedStatusUrl.pathname, "/candidate-pass");
    assert.equal(parsedStatusUrl.search, "");
    assert.equal(parsedStatusUrl.hash, `#${candidateToken}`);
    assert.equal(`${parsedStatusUrl.pathname}${parsedStatusUrl.search}`.includes(candidateToken), false);
    const duplicate = getPublicSubmissionConfirmation("vacancy", { duplicateApplication: true, candidatePassUrl: candidateUrl });
    assert.equal(duplicate.title, "Application already received");
    assert.equal(duplicate.detail, "Your existing application remains on file.");
    assert.equal(duplicate.candidatePassUrl, null);
    assert.doesNotMatch(duplicate.detail, /CV (was|were) (saved|received|stored)/i);
    const reusedCandidate = getPublicSubmissionConfirmation("vacancy", { reusedCandidate: true, candidatePassUrl: candidateUrl });
    assert.equal(reusedCandidate.title, "Application received");
    assert.equal(reusedCandidate.candidatePassUrl, null);
  });
});
