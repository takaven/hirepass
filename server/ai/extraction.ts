import { PDFParse } from "pdf-parse";
import { readStoredCandidateDocument } from "../document-files";
import { AI_EXTRACTION_VERSION } from "./config";

export type ExtractedPdfText = {
  status: "completed" | "text_unavailable" | "failed";
  text: string | null;
  errorCode?: string;
};

const MAX_EXTRACTED_CHARS = 40_000;

export async function extractPdfText(storageKey: string): Promise<ExtractedPdfText> {
  try {
    const buffer = await readStoredCandidateDocument(storageKey);
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText({ partial: Array.from({ length: 20 }, (_value, index) => index + 1) });
    await parser.destroy();
    const text = (parsed.text || "").replace(/\u0000/g, "").trim().slice(0, MAX_EXTRACTED_CHARS);
    if (!text) return { status: "text_unavailable", text: null, errorCode: "no_text" };
    return { status: "completed", text, errorCode: undefined };
  } catch {
    return { status: "failed", text: null, errorCode: "extract_failed" };
  }
}

export { AI_EXTRACTION_VERSION };
