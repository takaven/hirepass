export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type UploadCandidate = Pick<File, "name" | "type" | "size">;

const PDF_TYPES = new Set(["application/pdf"]);
const CANDIDATE_DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export function validateClientUpload(file: UploadCandidate, kind: "cv" | "candidate-document"): string | null {
  if (file.size > MAX_UPLOAD_BYTES) return "File must be 10 MB or smaller.";
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (kind === "cv") {
    if (!PDF_TYPES.has(file.type) || extension !== "pdf") return "CV must be a PDF file.";
    return null;
  }
  const validExtension = extension === "pdf" || extension === "jpg" || extension === "jpeg" || extension === "png";
  if (!CANDIDATE_DOCUMENT_TYPES.has(file.type) || !validExtension) return "Document must be a PDF, JPG or PNG file.";
  return null;
}
