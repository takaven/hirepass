import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPublicSubmissionConfirmation } from "./public-submission";

describe("public submission confirmation", () => {
  it("distinguishes general, new-vacancy and duplicate-vacancy outcomes", () => {
    assert.deepEqual(getPublicSubmissionConfirmation("general", {}), {
      title: "CV submitted",
      detail: "Your details and CV were received. The hiring team will contact you if there is a suitable next step.",
    });
    assert.deepEqual(getPublicSubmissionConfirmation("vacancy", {}), {
      title: "Application submitted",
      detail: "Your application and CV were received. The hiring team will contact you if there is a suitable next step.",
    });
    const duplicate = getPublicSubmissionConfirmation("vacancy", { duplicateApplication: true });
    assert.equal(duplicate.title, "Application already received");
    assert.equal(duplicate.detail, "Your existing application remains on file.");
    assert.doesNotMatch(duplicate.detail, /CV (was|were) (saved|received|stored)/i);
  });
});
