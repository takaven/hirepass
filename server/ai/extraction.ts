import pdf from "pdf-parse";
import { readStoredCandidateDocument } from "../document-files";
import { AI_EXTRACTION_VERSION } from "./config";

export type ExtractedPdfText = {
  status: "completed" | "text_unavailable" | "failed";
  text: string | null;
  pageTexts: Array<{ pageNumber: number; text: string }>;
  errorCode?: string;
};

const MAX_EXTRACTED_CHARS = 40_000;

export async function extractPdfText(storageKey: string): Promise<ExtractedPdfText> {
  try {
    const buffer = await readStoredCandidateDocument(storageKey);
    const parsed = await pdf(buffer, { max: 20 });
    const text = (parsed.text || "").replace(/\u0000/g, "").trim().slice(0, MAX_EXTRACTED_CHARS);
    if (!text) return { status: "text_unavailable", text: null, pageTexts: [], errorCode: "no_text" };
    return { status: "completed", text, pageTexts: [{ pageNumber: 1, text }], errorCode: undefined };
  } catch {
    return { status: "failed", text: null, pageTexts: [], errorCode: "extract_failed" };
  }
}

export { AI_EXTRACTION_VERSION };
