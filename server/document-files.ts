import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const signatures = {
  pdf: { mime: "application/pdf", extension: ".pdf", matches: (buffer: Buffer) => buffer.subarray(0, 4).toString("ascii") === "%PDF" },
  jpg: { mime: "image/jpeg", extension: ".jpg", matches: (buffer: Buffer) => buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  png: { mime: "image/png", extension: ".png", matches: (buffer: Buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
} as const;

type SupportedKind = keyof typeof signatures;

export type StoredCandidateDocument = {
  storageKey: string;
  originalName: string;
  size: number;
  mimeType: string;
  absolutePath: string;
};

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function getUploadRoot() {
  const configured = process.env.HIREPASS_UPLOAD_DIR;
  if (isProduction() && !configured) {
    throw new Error("HIREPASS_UPLOAD_DIR must be set in production");
  }
  return path.resolve(configured || path.join(process.cwd(), "uploads", "hirepass-documents"));
}

export async function validateUploadRoot() {
  const root = getUploadRoot();
  await mkdir(root, { recursive: true });
  const probe = path.join(root, `.hirepass-write-check-${randomBytes(6).toString("hex")}`);
  await writeFile(probe, "ok", { flag: "wx" });
  await rm(probe, { force: true });
  return root;
}

function safeOriginalName(fileName: string) {
  const baseName = path.basename(fileName || "document").replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  return baseName || "document";
}

function decodeBase64Upload(fileDataBase64: unknown) {
  if (typeof fileDataBase64 !== "string" || fileDataBase64.trim().length === 0) {
    throw new Error("File data is required");
  }
  const payload = fileDataBase64.includes(",") ? fileDataBase64.split(",").pop()! : fileDataBase64;
  return Buffer.from(payload, "base64");
}

function detectKind(buffer: Buffer): SupportedKind | null {
  for (const [kind, signature] of Object.entries(signatures) as Array<[SupportedKind, typeof signatures[SupportedKind]]>) {
    if (signature.matches(buffer)) return kind;
  }
  return null;
}

function normaliseClaimedMime(mimeType: unknown, fileName: string) {
  const claimed = typeof mimeType === "string" ? mimeType.toLowerCase().split(";")[0].trim() : "";
  const ext = path.extname(fileName).toLowerCase();
  if (claimed) return claimed;
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".pdf") return "application/pdf";
  return "";
}

export async function storeCandidateDocumentUpload(input: {
  passCandidateId: number;
  documentId: number;
  fileName: string;
  mimeType?: string;
  fileDataBase64: string;
}): Promise<StoredCandidateDocument> {
  const buffer = decodeBase64Upload(input.fileDataBase64);
  if (buffer.length === 0) throw new Error("Uploaded file is empty");
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error("Uploaded file exceeds the 10MB limit");

  const originalName = safeOriginalName(input.fileName);
  const detectedKind = detectKind(buffer);
  if (!detectedKind) throw new Error("Unsupported file type");

  const signature = signatures[detectedKind];
  const claimedMime = normaliseClaimedMime(input.mimeType, originalName);
  if (claimedMime && claimedMime !== signature.mime) {
    throw new Error("Uploaded file content does not match the declared type");
  }

  const root = await validateUploadRoot();
  const storageKey = [
    String(input.passCandidateId),
    `${input.documentId}-${Date.now()}-${randomBytes(12).toString("hex")}${signature.extension}`,
  ].join("/");
  const absolutePath = path.join(root, ...storageKey.split("/"));
  const relativeDir = path.dirname(absolutePath);
  await mkdir(relativeDir, { recursive: true });
  await writeFile(absolutePath, buffer, { flag: "wx" });

  return {
    storageKey,
    originalName,
    size: buffer.length,
    mimeType: signature.mime,
    absolutePath,
  };
}

export async function removeStoredCandidateDocument(storageKey?: string | null) {
  if (!storageKey) return;
  const root = getUploadRoot();
  const absolutePath = path.resolve(root, storageKey);
  if (!absolutePath.startsWith(root + path.sep)) return;
  await rm(absolutePath, { force: true });
}

export async function readStoredCandidateDocument(storageKey: string) {
  const root = getUploadRoot();
  const absolutePath = path.resolve(root, storageKey);
  if (!absolutePath.startsWith(root + path.sep)) {
    throw new Error("Invalid document path");
  }
  return readFile(absolutePath);
}
