import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_UPLOAD_BYTES, validateClientUpload } from "./upload-preflight";

const file = (name: string, type: string, size = 1024) => ({ name, type, size } as File);

describe("client upload preflight", () => {
  it("accepts a bounded PDF CV and rejects oversized or mismatched CVs", () => {
    assert.equal(validateClientUpload(file("cv.pdf", "application/pdf"), "cv"), null);
    assert.match(validateClientUpload(file("cv.pdf", "application/pdf", MAX_UPLOAD_BYTES + 1), "cv")!, /10 MB/);
    assert.match(validateClientUpload(file("cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "cv")!, /PDF/);
  });

  it("accepts bounded Candidate Pass PDF/JPG/PNG files and rejects unsupported or oversized files", () => {
    for (const candidate of [file("document.pdf", "application/pdf"), file("photo.jpg", "image/jpeg"), file("image.png", "image/png")]) {
      assert.equal(validateClientUpload(candidate, "candidate-document"), null);
    }
    assert.match(validateClientUpload(file("notes.txt", "text/plain"), "candidate-document")!, /PDF, JPG or PNG/);
    assert.match(validateClientUpload(file("photo.jpg", "image/jpeg", MAX_UPLOAD_BYTES + 1), "candidate-document")!, /10 MB/);
  });
});
