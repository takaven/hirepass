import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { saveCandidateWithOptionalCv } from "./save-candidate";

describe("candidate and CV save recovery", () => {
  it("retries a failed CV against the already-created candidate", async () => {
    const calls: string[] = [];
    let failCv = true;
    const request = async (method: string, url: string) => {
      calls.push(`${method} ${url}`);
      if (url.endsWith("/cv") && failCv) throw new Error("upload failed");
      return { json: async () => ({ id: 42 }) } as Response;
    };
    const cvPayload = { fileName: "cv.pdf", mimeType: "application/pdf", fileDataBase64: "data" };
    const first = await saveCandidateWithOptionalCv({ existingCandidateId: null, candidatePayload: {}, cvPayload, request });
    assert.equal(first.cvUploadFailed, true);
    failCv = false;
    const retry = await saveCandidateWithOptionalCv({ existingCandidateId: first.savedCandidate.id, candidatePayload: {}, cvPayload, request });
    assert.equal(retry.cvUploadFailed, false);
    assert.equal(calls.filter((call) => call === "POST /api/candidates").length, 1);
    assert(calls.includes("PATCH /api/candidates/42"));
  });
});
