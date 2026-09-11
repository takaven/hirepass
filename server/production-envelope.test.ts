import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, before, describe, it } from "node:test";
import express from "express";
import { safeApiRequestLogger } from "./request-logging";
import { storeCandidateCvUpload, validateUploadRoot } from "./document-files";

process.env.ANTHROPIC_API_KEY ||= "test-key";
process.env.DATABASE_URL ||= "postgres://hirepass_test:hirepass_test@127.0.0.1:1/hirepass_test";
process.env.HIREPASS_ADMIN_USERNAME = "owner";
process.env.HIREPASS_ADMIN_PASSWORD = "correct horse battery staple";
process.env.HIREPASS_SESSION_SECRET = "test-session-secret-with-more-than-32-characters";
const testAdminPasswordHash = "pbkdf2:210000:0123456789abcdef0123456789abcdef:803f3d2a658c2f7d6b17e2c1b0bf6c0c5d61acaaa9e61563e64a521b4ab9b2b5";

let registerRoutes: typeof import("./routes").registerRoutes;
let storage: typeof import("./storage").storage;
let configureInternalAuth: typeof import("./auth").configureInternalAuth;
let validateAuthConfig: typeof import("./auth").validateAuthConfig;
let pool: typeof import("./db").pool;

before(async () => {
  ({ configureInternalAuth, validateAuthConfig } = await import("./auth"));
  ({ registerRoutes } = await import("./routes"));
  ({ storage } = await import("./storage"));
  ({ pool } = await import("./db"));
});

const now = new Date();
const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
const oldDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const validPdf = "%PDF-1.4\nfictional hirepass test document\n%%EOF";
const pdfBase64 = Buffer.from(validPdf).toString("base64");

const pass = {
  id: 10,
  passId: "HP-10",
  positionTitle: "Operations Lead",
  department: "Operations",
  location: "Dubai",
  employmentType: "Full-time",
  headcount: 1,
  status: "active",
  currentStep: "interview",
  jdStatus: "approved",
  hiringManagerId: 301,
  createdAt: oldDate,
  updatedAt: oldDate,
};

const manager = {
  id: 301,
  name: "Fictional Manager",
  jobTitle: "Operations Director",
  email: "manager@example.com",
  department: "Operations",
  isActive: true,
  canBeInterviewer: true,
  canBeHiringManager: true,
  createdAt: oldDate,
  updatedAt: oldDate,
};

const candidate = {
  id: 201,
  name: "Fictional Candidate",
  email: "candidate@example.com",
  createdAt: oldDate,
  updatedAt: oldDate,
};

const passCandidate = {
  id: 101,
  passId: 10,
  candidateId: 201,
  status: "shortlisted",
  candidate,
  addedAt: oldDate,
  updatedAt: oldDate,
};

const candidateLink = {
  id: 21,
  token: "candidate-token",
  passCandidateId: 101,
  canFillApplication: true,
  canTakeAssessment: true,
  expiresAt: future,
  isActive: true,
  createdAt: oldDate,
};

type StorageOverrides = Partial<Record<keyof typeof storage, (...args: any[]) => any>>;
const originals = new Map<keyof typeof storage, unknown>();
let originalPoolQuery: typeof pool.query | undefined;
const tempDirs: string[] = [];

function overrideStorage(overrides: StorageOverrides) {
  for (const [key, value] of Object.entries(overrides) as Array<[keyof typeof storage, (...args: any[]) => any]>) {
    if (!originals.has(key)) originals.set(key, storage[key]);
    (storage as any)[key] = value;
  }
}

afterEach(async () => {
  for (const [key, value] of originals) (storage as any)[key] = value;
  originals.clear();
  if (originalPoolQuery) {
    pool.query = originalPoolQuery;
    originalPoolQuery = undefined;
  }
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

function overrideDatabaseReadiness(result: "success" | "failure") {
  originalPoolQuery ||= pool.query;
  pool.query = (async (queryText: unknown, ...args: unknown[]) => {
    if (typeof queryText === "string" && queryText.includes("to_regclass")) {
      if (result === "failure") throw new Error("simulated database unavailable");
      return { rows: [{ rate_limit_table: "rate_limit_counters" }], rowCount: 1 };
    }
    return (originalPoolQuery as any).call(pool, queryText, ...args);
  }) as typeof pool.query;
}

async function withServer(overrides: StorageOverrides, callback: (baseUrl: string) => Promise<void>) {
  const uploadDir = await mkdtemp(path.join(tmpdir(), "hirepass-upload-test-"));
  tempDirs.push(uploadDir);
  process.env.HIREPASS_UPLOAD_DIR = uploadDir;
  process.env.HIREPASS_COMPANY_NAME = "Test Company";
  process.env.HIREPASS_COMPANY_LOCATION = "Dubai";
  process.env.HIREPASS_CAREERS_CONTACT_EMAIL = "careers@example.test";
  process.env.HIREPASS_COMPANY_ACCENT_COLOR = "#8a6a2f";
  process.env.HIREPASS_PRIVACY_NOTICE_URL = "https://example.test/privacy";
  process.env.HIREPASS_PRIVACY_NOTICE_VERSION = "test-v1";
  let mutableDocument: any = {
    id: 701,
    passCandidateId: 101,
    docType: "passport",
    label: "Passport copy",
    isRequired: true,
    status: "pending",
    createdAt: oldDate,
    updatedAt: oldDate,
  };
  const activities: any[] = [];

  overrideStorage({
    getCandidates: async () => [candidate],
    getCandidatePasses: async () => [],
    getPasses: async () => [pass],
    getPass: async (id: number) => (id === 10 ? pass : undefined),
    getManager: async (id: number) => (id === 301 ? manager : undefined),
    getPassCandidatesWithDetails: async () => [passCandidate],
    getPassCandidateById: async (id: number) => (id === 101 ? passCandidate : undefined),
    getShareLinksByPass: async () => [],
    getCandidateLinksByPassCandidate: async () => [candidateLink],
    getCandidateLinkByToken: async (token: string) => (token === "candidate-token" ? candidateLink : undefined),
    getCandidate: async (id: number) => (id === 201 ? candidate : undefined),
    getInterviewsByPass: async () => [],
    getInterviewsByPassCandidate: async () => [],
    getInterviewSlotsByPass: async () => [],
    getAvailableInterviewSlots: async () => [],
    getCandidateMessages: async () => [],
    getCandidateDocuments: async (passCandidateId: number) => (passCandidateId === 101 ? [mutableDocument] : []),
    getDocumentsByCandidate: async () => [],
    updateCandidateDocument: async (id: number, data: any) => {
      if (id !== mutableDocument.id) return undefined;
      mutableDocument = { ...mutableDocument, ...data, updatedAt: now };
      return mutableDocument;
    },
    getCandidateTimelineEvents: async () => [],
    getOfferByPassCandidate: async () => undefined,
    getActivitiesByPass: async () => activities,
    logActivity: async (activity: any) => {
      const log = { id: activities.length + 1, createdAt: now, ...activity };
      activities.unshift(log);
      return log;
    },
    ...overrides,
  });

  const app = express();
  app.use(express.json({ limit: "14mb" }));
  configureInternalAuth(app);
  const server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert(address && typeof address === "object");

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error?: Error) => error ? reject(error) : resolve()));
  }
}

async function login(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "owner", password: "correct horse battery staple" }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie")?.split(";")[0] || "";
}

describe("HirePass production envelope", () => {
  it("persists independent stakeholder responsibility flags and rejects an ineligible vacancy owner", async () => {
    let created: any = null;
    await withServer({
      createManager: async (data: any) => (created = { id: 401, ...data }),
      getManager: async (id: number) => id === 401 ? { ...manager, id, isActive: true, canBeHiringManager: false, canBeInterviewer: true } : undefined,
    }, async (baseUrl) => {
      const cookie = await login(baseUrl);
      const stakeholder = await fetch(`${baseUrl}/api/managers`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "Interview Specialist", email: "interviewer@example.test", jobTitle: "Interviewer", department: "Operations", isActive: true, canBeHiringManager: false, canBeInterviewer: true }) });
      assert.equal(stakeholder.status, 201);
      assert.equal(created.canBeHiringManager, false);
      assert.equal(created.canBeInterviewer, true);

      const vacancy = await fetch(`${baseUrl}/api/passes`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ hiringManagerId: 401 }) });
      assert.equal(vacancy.status, 400);
      assert.match((await vacancy.json() as any).error, /eligible stakeholder/);
    });
  });

  it("exposes direct open-vacancy details but protects the Candidate Library", async () => {
    await withServer({}, async (baseUrl) => {
      const direct = await fetch(`${baseUrl}/api/public/passes/10`);
      assert.equal(direct.status, 200);
      const publicPass = await direct.json() as any;
      assert.equal(publicPass.positionTitle, pass.positionTitle);
      assert.equal(publicPass.hiringManagerId, undefined);
      assert.equal(publicPass.managerNotes, undefined);
      assert.equal(publicPass.notes, undefined);
      const publicConfig = await (await fetch(`${baseUrl}/api/public/config`)).json() as any;
      assert.deepEqual(publicConfig, {
        companyName: "Test Company",
        companyLocation: "Dubai",
        careersContactEmail: "careers@example.test",
        companyLogoUrl: "",
        companyAccentColor: "#8A6A2F",
        privacyNoticeUrl: "https://example.test/privacy",
        privacyNoticeVersion: "test-v1",
        aiEnabled: false,
      });
      process.env.HIREPASS_COMPANY_ACCENT_COLOR = "linear-gradient(red, blue)";
      const invalidAccentConfig = await (await fetch(`${baseUrl}/api/public/config`)).json() as any;
      assert.equal(invalidAccentConfig.companyAccentColor, "#01FF22");
      assert.doesNotMatch(JSON.stringify(invalidAccentConfig), /linear-gradient/);
      process.env.HIREPASS_COMPANY_ACCENT_COLOR = "#8a6a2f";
      assert.equal((await fetch(`${baseUrl}/api/candidates/201/library`)).status, 401);
      const cookie = await login(baseUrl);
      const library = await fetch(`${baseUrl}/api/candidates/201/library`, { headers: { cookie } });
      assert.equal(library.status, 200);
    });
  });

  it("protects internal APIs with an owner/admin session while leaving Candidate Pass tokens separate", async () => {
    await withServer({}, async (baseUrl) => {
      assert.equal((await fetch(`${baseUrl}/api/candidates`)).status, 401);
      assert.equal((await fetch(`${baseUrl}/api/hr-pass-control/passes/10/candidate-links/21/revoke`, { method: "POST" })).status, 401);

      const external = await fetch(`${baseUrl}/api/candidate-pass/candidate-token`);
      assert.equal(external.status, 200);

      const cookie = await login(baseUrl);
      const candidates = await fetch(`${baseUrl}/api/candidates`, { headers: { cookie } });
      assert.equal(candidates.status, 200);

      const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { cookie } });
      assert.equal(logout.status, 200);

      const afterLogout = await fetch(`${baseUrl}/api/candidates`, { headers: { cookie } });
      assert.equal(afterLogout.status, 401);
    });
  });

  it("stores valid Candidate Pass document bytes and requires auth for HR retrieval", async () => {
    await withServer({}, async (baseUrl) => {
      const upload = await fetch(`${baseUrl}/api/candidate-pass/candidate-token/documents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId: 701,
          fileName: "passport.pdf",
          mimeType: "application/pdf",
          fileDataBase64: pdfBase64,
        }),
      });
      assert.equal(upload.status, 201);
      const uploaded = await upload.json() as any;
      assert.equal(uploaded.status, "uploaded");
      assert.match(uploaded.filePath, /^101\/701-/);

      const unauthenticated = await fetch(`${baseUrl}/api/pass-candidates/101/documents/701/download`);
      assert.equal(unauthenticated.status, 401);

      const cookie = await login(baseUrl);
      const download = await fetch(`${baseUrl}/api/pass-candidates/101/documents/701/download`, { headers: { cookie } });
      assert.equal(download.status, 200);
      assert.equal(await download.text(), validPdf);
      assert.equal(download.headers.get("x-content-type-options"), "nosniff");
      assert.match(download.headers.get("content-security-policy") || "", /sandbox/);
      assert.match(download.headers.get("content-disposition") || "", /^attachment/);

      const wrongCandidate = await fetch(`${baseUrl}/api/pass-candidates/999/documents/701/download`, { headers: { cookie } });
      assert.equal(wrongCandidate.status, 404);
    });
  });

  it("issues every generic Candidate and Stakeholder Pass with finite default expiry", async () => {
    const issued: any[] = [];
    await withServer({
      createShareLink: async (data: any) => { issued.push(data); return { id: 1, token: "manager", ...data }; },
      createCandidateLink: async (data: any) => { issued.push(data); return { id: 2, ...data }; },
      getPassCandidate: async () => passCandidate,
      getCandidateLinksByPassCandidate: async () => [],
    }, async (baseUrl) => {
      const cookie = await login(baseUrl);
      assert.equal((await fetch(`${baseUrl}/api/share-links`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ passId: 10, managerId: 301 }) })).status, 201);
      assert.equal((await fetch(`${baseUrl}/api/candidate-links`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ passCandidateId: 101 }) })).status, 201);
      assert.equal(issued.length, 2);
      for (const item of issued) {
        assert(item.expiresAt instanceof Date);
        assert(item.expiresAt.getTime() > Date.now());
      }
    });
  });

  it("does not treat application hard-deletion as candidate privacy erasure", async () => {
    await withServer({}, async (baseUrl) => {
      const cookie = await login(baseUrl);
      const response = await fetch(`${baseUrl}/api/pass-candidates/101`, { method: "DELETE", headers: { cookie } });
      assert.equal(response.status, 409);
      assert.match(JSON.stringify(await response.json()), /workflow status/);
    });
  });

  it("rejects spoofed, unsupported, oversized and revoked Candidate Pass document uploads", async () => {
    let updated = false;
    await withServer({
      updateCandidateDocument: async () => {
        updated = true;
        return undefined;
      },
    }, async (baseUrl) => {
      const spoofed = await fetch(`${baseUrl}/api/candidate-pass/candidate-token/documents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: 701, fileName: "passport.pdf", mimeType: "application/pdf", fileDataBase64: Buffer.from("not a pdf").toString("base64") }),
      });
      assert.equal(spoofed.status, 400);
      assert.equal(updated, false);

      const pngAsPdf = await fetch(`${baseUrl}/api/candidate-pass/candidate-token/documents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: 701, fileName: "passport.pdf", mimeType: "application/pdf", fileDataBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64") }),
      });
      assert.equal(pngAsPdf.status, 400);

      const oversize = await fetch(`${baseUrl}/api/candidate-pass/candidate-token/documents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: 701, fileName: "large.pdf", mimeType: "application/pdf", fileDataBase64: Buffer.concat([Buffer.from("%PDF"), Buffer.alloc(10 * 1024 * 1024 + 1)]).toString("base64") }),
      });
      assert.equal(oversize.status, 400);
    });

    await withServer({
      getCandidateLinkByToken: async () => ({ ...candidateLink, isActive: false }),
    }, async (baseUrl) => {
      const revoked = await fetch(`${baseUrl}/api/candidate-pass/candidate-token/documents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: 701, fileName: "passport.pdf", mimeType: "application/pdf", fileDataBase64: pdfBase64 }),
      });
      assert.equal(revoked.status, 404);
    });
  });

  it("does not write sensitive API response bodies to request logs", async () => {
    const lines: string[] = [];
    const app = express();
    app.use(safeApiRequestLogger((message) => lines.push(message)));
    app.get("/api/sensitive", (_req, res) => res.json({ token: "cand_secret_token", candidateEmail: "candidate@example.com" }));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    assert(address && typeof address === "object");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/sensitive`);
      assert.equal(response.status, 200);
      assert.equal(lines.length, 1);
      assert.match(lines[0], /^GET \/api\/sensitive 200 in \d+ms$/);
      assert.equal(lines[0].includes("cand_secret_token"), false);
      assert.equal(lines[0].includes("candidate@example.com"), false);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error?: Error) => error ? reject(error) : resolve()));
    }
  });

  it("never logs Candidate or Stakeholder Pass bearer tokens for representative outcomes and nested routes", async () => {
    const token = "known_bearer_token_must_not_appear";
    const lines: string[] = [];
    const app = express();
    app.use(express.json());
    app.use(safeApiRequestLogger((message) => lines.push(message)));
    app.get("/api/candidate-pass/:token", (req, res) => res.status(req.params.token === token ? 200 : 404).json({ ok: true }));
    app.post("/api/candidate-pass/:token/messages", (_req, res) => res.status(410).json({ error: "expired" }));
    app.post("/api/candidate-pass/:token/documents/:id/review", (_req, res) => res.status(404).json({ error: "revoked" }));
    app.get("/api/manager-pass/:token", (_req, res) => res.status(200).json({ ok: true }));
    app.post("/api/manager-pass/:token/candidates/:id/decision", (_req, res) => res.status(401).json({ error: "invalid" }));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    assert(address && typeof address === "object");
    try {
      const base = `http://127.0.0.1:${address.port}`;
      await fetch(`${base}/api/candidate-pass/${token}`);
      await fetch(`${base}/api/candidate-pass/${token}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      await fetch(`${base}/api/candidate-pass/${token}/documents/7/review`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      await fetch(`${base}/api/manager-pass/${token}`);
      await fetch(`${base}/api/manager-pass/${token}/candidates/9/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      assert.equal(lines.length, 5);
      assert.equal(lines.some((line) => line.includes(token)), false);
      assert(lines.some((line) => line.includes("GET /api/candidate-pass/:token 200")));
      assert(lines.some((line) => line.includes("POST /api/candidate-pass/:token/messages 410")));
      assert(lines.some((line) => line.includes("POST /api/manager-pass/:token/candidates/:id/decision 401")));
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error?: Error) => error ? reject(error) : resolve()));
    }
  });

  it("accepts only passive, structurally complete PDFs for the reusable CV store", async () => {
    const uploadDir = await mkdtemp(path.join(tmpdir(), "hirepass-cv-test-"));
    tempDirs.push(uploadDir);
    process.env.HIREPASS_UPLOAD_DIR = uploadDir;
    const stored = await storeCandidateCvUpload({ candidateId: 201, fileName: "../../cv.pdf", mimeType: "application/pdf", fileDataBase64: pdfBase64 });
    assert.match(stored.storageKey, /^201\/0-/);
    assert.equal(stored.originalName, "cv.pdf");
    await assert.rejects(
      storeCandidateCvUpload({ candidateId: 201, fileName: "cv.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileDataBase64: Buffer.from("PK\u0003\u0004").toString("base64") }),
      /Unsupported file type/,
    );
    await assert.rejects(
      storeCandidateCvUpload({ candidateId: 201, fileName: "active.pdf", mimeType: "application/pdf", fileDataBase64: Buffer.from("%PDF-1.4\n/JavaScript true\n%%EOF").toString("base64") }),
      /unsupported active or embedded content/,
    );
  });

  it("fails closed for missing production auth and upload configuration", async () => {
    const previous = {
      nodeEnv: process.env.NODE_ENV,
      username: process.env.HIREPASS_ADMIN_USERNAME,
      password: process.env.HIREPASS_ADMIN_PASSWORD,
      hash: process.env.HIREPASS_ADMIN_PASSWORD_HASH,
      secret: process.env.HIREPASS_SESSION_SECRET,
      uploadDir: process.env.HIREPASS_UPLOAD_DIR,
    };
    try {
      process.env.NODE_ENV = "production";
      delete process.env.HIREPASS_ADMIN_PASSWORD_HASH;
      delete process.env.HIREPASS_UPLOAD_DIR;
      assert.throws(() => validateAuthConfig(), /HIREPASS_ADMIN_PASSWORD_HASH/);
      await assert.rejects(validateUploadRoot(), /HIREPASS_UPLOAD_DIR/);
    } finally {
      process.env.NODE_ENV = previous.nodeEnv;
      if (previous.username === undefined) delete process.env.HIREPASS_ADMIN_USERNAME; else process.env.HIREPASS_ADMIN_USERNAME = previous.username;
      if (previous.password === undefined) delete process.env.HIREPASS_ADMIN_PASSWORD; else process.env.HIREPASS_ADMIN_PASSWORD = previous.password;
      if (previous.hash === undefined) delete process.env.HIREPASS_ADMIN_PASSWORD_HASH; else process.env.HIREPASS_ADMIN_PASSWORD_HASH = previous.hash;
      if (previous.secret === undefined) delete process.env.HIREPASS_SESSION_SECRET; else process.env.HIREPASS_SESSION_SECRET = previous.secret;
      if (previous.uploadDir === undefined) delete process.env.HIREPASS_UPLOAD_DIR; else process.env.HIREPASS_UPLOAD_DIR = previous.uploadDir;
    }
  });

  it("reports readiness only when production database, config and upload storage are usable", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      process.env.HIREPASS_ADMIN_PASSWORD_HASH = testAdminPasswordHash;
      overrideDatabaseReadiness("success");
      await withServer({}, async (baseUrl) => {
        const ready = await fetch(`${baseUrl}/api/ready`);
        assert.equal(ready.status, 200);
        assert.deepEqual(await ready.json(), { ok: true, ready: true });
      });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("fails readiness but not liveness when the production database is unreachable", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      process.env.HIREPASS_ADMIN_PASSWORD_HASH = testAdminPasswordHash;
      overrideDatabaseReadiness("failure");
      await withServer({}, async (baseUrl) => {
        const health = await fetch(`${baseUrl}/api/health`);
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { ok: true });

        const ready = await fetch(`${baseUrl}/api/ready`);
        assert.equal(ready.status, 503);
        assert.deepEqual(await ready.json(), { ok: false, ready: false });
      });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("uses shared persistent counters and fails closed for production login abuse protection", async () => {
    const { persistentRateLimit } = await import("./rate-limit");
    const previousNodeEnv = process.env.NODE_ENV;
    let count = 0;
    originalPoolQuery ||= pool.query;
    pool.query = (async () => ({ rows: [{ count: ++count, expires_at: new Date(Date.now() + 60_000) }], rowCount: 1 })) as typeof pool.query;
    process.env.NODE_ENV = "production";
    const app = express();
    app.use(persistentRateLimit());
    app.post("/api/auth/login", (_req, res) => res.json({ ok: true }));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    assert(address && typeof address === "object");
    try {
      const url = `http://127.0.0.1:${address.port}/api/auth/login`;
      for (let i = 0; i < 10; i += 1) assert.equal((await fetch(url, { method: "POST" })).status, 200);
      const blocked = await fetch(url, { method: "POST" });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.headers.get("ratelimit-limit"), "10");
      assert(blocked.headers.get("retry-after"));
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      await new Promise<void>((resolve, reject) => server.close((error?: Error) => error ? reject(error) : resolve()));
    }
  });

  it("production-disables legacy AI and onboarding token routes", async () => {
    const { disableOutOfScopeProductionRoutes } = await import("./auth");
    const previousNodeEnv = process.env.NODE_ENV;
    const blockedStatuses: number[] = [];
    let nextCalled = false;
    const response = {
      status: (status: number) => {
        blockedStatuses.push(status);
        return { json: () => undefined };
      },
    };
    try {
      process.env.NODE_ENV = "production";
      disableOutOfScopeProductionRoutes({ path: "/api/ai/chat" } as any, response as any, () => {
        nextCalled = true;
      });
      disableOutOfScopeProductionRoutes({ path: "/api/onboarding-portal/onb_token" } as any, response as any, () => {
        nextCalled = true;
      });
      assert.deepEqual(blockedStatuses, [404, 404]);
      assert.equal(nextCalled, false);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("keeps new intelligence routes behind internal authentication", async () => {
    await withServer({}, async (baseUrl) => {
      assert.equal((await fetch(`${baseUrl}/api/intelligence/status`)).status, 401);
      const cookie = await login(baseUrl);
      const response = await fetch(`${baseUrl}/api/intelligence/status`, { headers: { cookie } });
      assert.equal(response.status, 200);
      assert.equal((await response.json() as any).state, "disabled");
      const suggestions = await fetch(`${baseUrl}/api/intelligence/passes/10/criteria/suggest`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(suggestions.status, 409);
    });
  });

  it("keeps public Pass first views simple and action-led", async () => {
    const appSource = await readFile(path.join(process.cwd(), "client/src/App.tsx"), "utf8");
    const privacySource = await readFile(path.join(process.cwd(), "client/src/pages/public-privacy.tsx"), "utf8");
    assert.match(appSource, /isPrivacyRoute/);
    assert.match(appSource, /<PublicPrivacy \/>/);
    assert.match(privacySource, /Recruitment Privacy Notice/);
    assert.match(privacySource, /companyName/);
    assert.match(privacySource, /AI analyses\. Humans decide\./);
    assert.match(privacySource, /This notice does not promise a fixed retention period/);
    assert.match(privacySource, /Mauritius Data Protection Act 2017/);
    assert.doesNotMatch(privacySource, /ARIE Finance/);
    assert.doesNotMatch(privacySource, /"Not configured"/);

    const publicApplySource = await readFile(path.join(process.cwd(), "client/src/pages/public-apply.tsx"), "utf8");
    assert.match(publicApplySource, /I have read the \{privacyLink\} and understand how \{config\.companyName\} will use my personal information in connection with my application/);
    assert.match(publicApplySource, /recruitment decisions are made by authorised people and are not made solely by AI/);
    assert.match(publicApplySource, /I have read the \{privacyLink\} and agree that \{config\.companyName\} may store my candidate profile in the Candidate Library/);
    assert.match(publicApplySource, /I can contact \{config\.careersContactEmail \|\| "the hiring organisation"\} if I no longer wish to be considered for future opportunities/);

    const candidateSource = await readFile(path.join(process.cwd(), "client/src/pages/candidate-portal-pass.tsx"), "utf8");
    const candidateStateSource = await readFile(path.join(process.cwd(), "server/candidate-pass-state.ts"), "utf8");
    assert.match(candidateSource, />Candidate<\/p>/);
    assert.match(candidateSource, /Your next step/);
    assert.match(candidateSource, /Your journey/);
    assert.match(candidateSource, /<ExternalPassBrand config=\{publicConfig\} descriptor="Candidate Pass" \/>/);
    assert.match(candidateSource, /candidate-pass-current-action/);
    assert.match(candidateSource, /state\.journey\.map/);
    assert.match(candidateSource, /\{documents\.length > 0 && \(/);
    assert.match(candidateSource, /\{timeline\.length > 0 && \(/);
    assert.match(candidateSource, /id="pass-messages"/);
    assert.doesNotMatch(candidateSource, /bg-slate-950/);
    assert.doesNotMatch(candidateSource, /sm:grid-cols-7/);
    assert.doesNotMatch(candidateSource, /Dominant next action/);
    assert.doesNotMatch(candidateSource, /\["Now", passState\.now\]/);
    assert.doesNotMatch(candidateSource, /Latest update/);
    assert.match(candidateStateSource, /const stageOrder: CandidateHiringStage\[\] = \["Applied", "Review", "Interview", "Decision"\]/);
    assert.doesNotMatch(candidateStateSource, /"Handoff"/);

    const stakeholderSource = await readFile(path.join(process.cwd(), "client/src/pages/manager-recruitment-pass.tsx"), "utf8");
    assert.match(stakeholderSource, /What needs your input\?/);
    assert.match(stakeholderSource, /Your hiring assignment/);
    assert.match(stakeholderSource, /Relevant evidence/);
    assert.match(stakeholderSource, /<ExternalPassBrand config=\{publicConfig\} descriptor="Stakeholder Pass" \/>/);
    assert.match(stakeholderSource, /stakeholder-pass-primary-action/);
    assert.doesNotMatch(stakeholderSource, /bg-slate-950/);
    assert.doesNotMatch(stakeholderSource, /\["Now", managerPassState\.headline\]/);
  });

  it("keeps customer identity primary on public surfaces", async () => {
    const routesSource = await readFile(path.join(process.cwd(), "server/routes.ts"), "utf8");
    const publicApplySource = await readFile(path.join(process.cwd(), "client/src/pages/public-apply.tsx"), "utf8");
    const careersSource = await readFile(path.join(process.cwd(), "client/src/pages/public-careers.tsx"), "utf8");
    const talentPoolSource = await readFile(path.join(process.cwd(), "client/src/pages/public-talent-pool.tsx"), "utf8");
    const appSource = await readFile(path.join(process.cwd(), "client/src/App.tsx"), "utf8");
    const externalPassBrandSource = await readFile(path.join(process.cwd(), "client/src/components/external-pass-brand.tsx"), "utf8");

    assert.match(routesSource, /HIREPASS_COMPANY_LOGO_URL/);
    assert.match(routesSource, /HIREPASS_COMPANY_ACCENT_COLOR/);
    assert.match(publicApplySource, /companyLogoUrl/);
    assert.match(publicApplySource, /Powered by HirePass/);
    assert.match(externalPassBrandSource, /Powered by HirePass/);
    assert.match(externalPassBrandSource, /--customer-accent/);
    assert.match(careersSource, /Explore current opportunities or share your profile for suitable future roles/);
    assert.doesNotMatch(careersSource, /HirePass keeps the process simple/);
    assert.match(talentPoolSource, /<PublicFooter config=\{config\}\/>/);
    assert.doesNotMatch(publicApplySource, /HirePass by TAKAVEN\{config/);
  });

  it("presents Home, Analytics and Settings as simple pilot surfaces", async () => {
    const homeSource = await readFile(path.join(process.cwd(), "client/src/pages/dashboard.tsx"), "utf8");
    const analyticsSource = await readFile(path.join(process.cwd(), "client/src/pages/analytics.tsx"), "utf8");
    const settingsSource = await readFile(path.join(process.cwd(), "client/src/pages/settings.tsx"), "utf8");

    assert.match(homeSource, /What needs your attention/);
    assert.match(homeSource, /You're up to date/);
    assert.match(homeSource, /New vacancy/);
    assert.doesNotMatch(homeSource, /Add Candidate/);
    assert.doesNotMatch(homeSource, /hiredThisMonth/);
    assert.doesNotMatch(homeSource, /text-\[9px\]|text-\[10px\]|text-\[11px\]/);

    assert.doesNotMatch(analyticsSource, /PieChart|BarChart|CHART_COLORS|Vacancies by Department/);
    assert.match(analyticsSource, /Time to fill/);
    assert.match(analyticsSource, /No completed hire timing yet/);

    assert.match(settingsSource, /Organisation readiness/);
    assert.match(settingsSource, /Ready/);
    assert.match(settingsSource, /Needs setup/);
    assert.match(settingsSource, /Managed by your HirePass administrator/);
    assert.doesNotMatch(settingsSource, /deployment environment|restart the application/);
  });

  it("limits public application status access to brand-new candidate applications", async () => {
    const routesSource = await readFile(path.join(process.cwd(), "server/routes.ts"), "utf8");
    const publicApplySource = await readFile(path.join(process.cwd(), "client/src/pages/public-apply.tsx"), "utf8");
    const publicSubmissionSource = await readFile(path.join(process.cwd(), "client/src/lib/public-submission.ts"), "utf8");

    assert.match(routesSource, /createOrReuseCandidatePassUrl/);
    assert.match(routesSource, /candidatePassUrlForApplication\(passCandidateId\)/);
    assert.match(routesSource, /expiresAt: defaultExpiry\(\)/);
    assert.match(routesSource, /token: createCandidatePassToken\(\)/);
    assert.match(routesSource, /!result\.duplicateApplication && !result\.reusedCandidate/);
    assert.match(routesSource, /candidatePassUrl/);
    assert.match(publicSubmissionSource, /result\.reusedCandidate \? null/);
    assert.match(publicApplySource, /View application status/);
  });

  it("keeps the internal pilot surface on semantic vacancy and hiring-team routes", async () => {
    const appSource = await readFile(path.join(process.cwd(), "client/src/App.tsx"), "utf8");
    const sidebarSource = await readFile(path.join(process.cwd(), "client/src/components/app-sidebar.tsx"), "utf8");
    const candidatesSource = await readFile(path.join(process.cwd(), "client/src/pages/candidates.tsx"), "utf8");

    assert.match(appSource, /path="\/vacancies"/);
    assert.match(appSource, /path="\/hiring-team"/);
    assert.match(appSource, /path="\/hiring-control"/);
    assert.match(appSource, /<RedirectTo to="\/vacancies" \/>/);
    assert.match(appSource, /component=\{CandidateProfile\}/);
    assert.match(sidebarSource, /url: "\/vacancies"/);
    assert.match(sidebarSource, /url: "\/hiring-team"/);
    assert.match(sidebarSource, /url: "\/hiring-control"/);
    assert.doesNotMatch(sidebarSource, /url: "\/passes"/);
    assert.match(candidatesSource, /setLocation\(`\/candidates\/\$\{candidate\.id\}`\)/);
    assert.match(candidatesSource, /setLocation\(`\/candidates\/\$\{candidate\.id\}\/edit`\)/);
  });

  it("requires comparison candidates to share the same role target and current criteria version", async () => {
    const samePosition = { id: 501, passId: 10, positionTitle: "Operations Lead", aiCriteriaVersion: 2, aiCriteriaConfirmedAt: now };
    const otherPosition = { id: 502, passId: 10, positionTitle: "Finance Lead", aiCriteriaVersion: 2, aiCriteriaConfirmedAt: now };
    const completedReview = (id: number, positionId: number | null, criteriaVersion = 2) => ({
      id,
      reviewType: "application",
      passId: 10,
      positionId,
      passCandidateId: id + 1000,
      candidateId: 201,
      documentId: 701,
      criteriaVersion,
      status: "completed",
      reviewBand: "strong_evidence",
      result: { criteria: [], strengths: [], materialGaps: [], clarificationQuestions: [], summary: "Human decision required." },
      criteriaSnapshot: [],
    });
    await withServer({
      getPassPosition: async (id: number) => id === 501 ? samePosition : id === 502 ? otherPosition : undefined,
      getPassCandidateById: async (id: number) => {
        if (id === 1101) return { ...passCandidate, id, positionId: 501 };
        if (id === 1102) return { ...passCandidate, id, candidateId: 202, positionId: 501 };
        if (id === 1103) return { ...passCandidate, id, candidateId: 203, positionId: 502 };
        if (id === 1104) return { ...passCandidate, id, candidateId: 204, positionId: 501 };
        return undefined;
      },
      getLatestAiReview: async (id: number) => id === 1102 ? completedReview(102, 501, 1) : completedReview(id - 1000, id === 1103 ? 502 : 501),
      getCandidate: async (id: number) => ({ ...candidate, id, name: `Candidate ${id}` }),
    }, async (baseUrl) => {
      const cookie = await login(baseUrl);
      const good = await fetch(`${baseUrl}/api/intelligence/passes/10/compare`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ passCandidateIds: [1101, 1104] }) });
      assert.equal(good.status, 200);
      const crossPosition = await fetch(`${baseUrl}/api/intelligence/passes/10/compare`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ passCandidateIds: [1101, 1103] }) });
      assert.equal(crossPosition.status, 409);
      const stale = await fetch(`${baseUrl}/api/intelligence/passes/10/compare`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ passCandidateIds: [1101, 1102] }) });
      assert.equal(stale.status, 409);
    });
  });

  it("requires explicit target selection for multi-position library matching", async () => {
    const positions = [
      { id: 501, passId: 10, positionTitle: "Operations Lead", aiCriteriaVersion: 1, aiCriteriaConfirmedAt: now },
      { id: 502, passId: 10, positionTitle: "Finance Lead", aiCriteriaVersion: 1, aiCriteriaConfirmedAt: now },
    ];
    await withServer({
      getPassPositions: async () => positions,
      getPassPosition: async (id: number) => positions.find((position) => position.id === id),
      getCandidates: async () => [],
      getPassCandidates: async () => [],
      getAiReviewsByPass: async () => [
        { id: 1, reviewType: "library_match", passId: 10, positionId: 501, candidateId: 201, status: "completed", criteriaVersion: 1, result: {}, reviewBand: "strong_evidence" },
        { id: 2, reviewType: "library_match", passId: 10, positionId: 502, candidateId: 202, status: "completed", criteriaVersion: 1, result: {}, reviewBand: "insufficient_evidence" },
      ],
      getCandidate: async (id: number) => ({ ...candidate, id, name: `Candidate ${id}` }),
    }, async (baseUrl) => {
      const cookie = await login(baseUrl);
      const all = await fetch(`${baseUrl}/api/intelligence/passes/10/library-matches`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({}) });
      assert.equal(all.status, 409);
      const foreign = await fetch(`${baseUrl}/api/intelligence/passes/10/library-matches`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ positionId: 999 }) });
      assert.equal(foreign.status, 404);
      const filtered = await fetch(`${baseUrl}/api/intelligence/passes/10/library-matches?positionId=501`, { headers: { cookie } });
      assert.equal(filtered.status, 200);
      const body = await filtered.json() as any[];
      assert.equal(body.length, 1);
      assert.equal(body[0].positionId, 501);
    });
  });

  it("validates canonical email URLs and keeps email enqueue failure non-blocking", async () => {
    const previous = {
      nodeEnv: process.env.NODE_ENV,
      emailEnabled: process.env.HIREPASS_EMAIL_ENABLED,
      publicBase: process.env.HIREPASS_PUBLIC_BASE_URL,
      smtpHost: process.env.HIREPASS_SMTP_HOST,
      emailFrom: process.env.HIREPASS_EMAIL_FROM,
    };
    const { publicAppUrl } = await import("./email/config");
    try {
      process.env.NODE_ENV = "production";
      process.env.HIREPASS_EMAIL_ENABLED = "true";
      process.env.HIREPASS_PUBLIC_BASE_URL = "http://example.test";
      assert.equal(publicAppUrl("/candidate-pass/token"), null);
      process.env.HIREPASS_PUBLIC_BASE_URL = "https://careers.example.test/path?ignored=true";
      process.env.HIREPASS_SMTP_HOST = "smtp.example.test";
      process.env.HIREPASS_EMAIL_FROM = "HirePass <noreply@example.test>";
      assert.equal(publicAppUrl("/candidate-pass/token"), "https://careers.example.test/candidate-pass/token");
      process.env.NODE_ENV = "test";

      await withServer({
        getCandidateLinksByPassCandidate: async () => [],
        createCandidateLink: async (data: any) => ({ id: 77, token: data.token, ...data }),
        enqueueEmail: async () => { throw new Error("simulated enqueue failure"); },
      }, async (baseUrl) => {
        const cookie = await login(baseUrl);
        const response = await fetch(`${baseUrl}/api/candidate-links`, {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ passCandidateId: 101 }),
        });
        assert.equal(response.status, 201);
      });
    } finally {
      process.env.NODE_ENV = previous.nodeEnv;
      if (previous.emailEnabled === undefined) delete process.env.HIREPASS_EMAIL_ENABLED; else process.env.HIREPASS_EMAIL_ENABLED = previous.emailEnabled;
      if (previous.publicBase === undefined) delete process.env.HIREPASS_PUBLIC_BASE_URL; else process.env.HIREPASS_PUBLIC_BASE_URL = previous.publicBase;
      if (previous.smtpHost === undefined) delete process.env.HIREPASS_SMTP_HOST; else process.env.HIREPASS_SMTP_HOST = previous.smtpHost;
      if (previous.emailFrom === undefined) delete process.env.HIREPASS_EMAIL_FROM; else process.env.HIREPASS_EMAIL_FROM = previous.emailFrom;
    }
  });

  it("queues Candidate and Stakeholder Pass emails with absolute public URLs", async () => {
    const previous = {
      emailEnabled: process.env.HIREPASS_EMAIL_ENABLED,
      publicBase: process.env.HIREPASS_PUBLIC_BASE_URL,
      smtpHost: process.env.HIREPASS_SMTP_HOST,
      emailFrom: process.env.HIREPASS_EMAIL_FROM,
    };
    const emails: any[] = [];
    try {
      process.env.HIREPASS_EMAIL_ENABLED = "true";
      process.env.HIREPASS_PUBLIC_BASE_URL = "https://careers.example.test";
      process.env.HIREPASS_SMTP_HOST = "smtp.example.test";
      process.env.HIREPASS_EMAIL_FROM = "HirePass <noreply@example.test>";
      await withServer({
        createShareLink: async (data: any) => ({ id: 11, token: "stakeholder-token", ...data }),
        createCandidateLink: async (data: any) => ({ id: 12, token: data.token, ...data }),
        enqueueEmail: async (email: any) => {
          emails.push(email);
          return { created: true, email: { id: emails.length, ...email } };
        },
      }, async (baseUrl) => {
        const cookie = await login(baseUrl);
        assert.equal((await fetch(`${baseUrl}/api/share-links`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ passId: 10, managerId: 301 }) })).status, 201);
        assert.equal((await fetch(`${baseUrl}/api/candidate-links`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ passCandidateId: 101 }) })).status, 201);
      });
      assert.equal(emails.length, 2);
      assert.match(emails[0].bodyText, /https:\/\/careers\.example\.test\/manager-pass\/stakeholder-token/);
      assert.match(emails[1].bodyText, /https:\/\/careers\.example\.test\/candidate-pass\//);
    } finally {
      if (previous.emailEnabled === undefined) delete process.env.HIREPASS_EMAIL_ENABLED; else process.env.HIREPASS_EMAIL_ENABLED = previous.emailEnabled;
      if (previous.publicBase === undefined) delete process.env.HIREPASS_PUBLIC_BASE_URL; else process.env.HIREPASS_PUBLIC_BASE_URL = previous.publicBase;
      if (previous.smtpHost === undefined) delete process.env.HIREPASS_SMTP_HOST; else process.env.HIREPASS_SMTP_HOST = previous.smtpHost;
      if (previous.emailFrom === undefined) delete process.env.HIREPASS_EMAIL_FROM; else process.env.HIREPASS_EMAIL_FROM = previous.emailFrom;
    }
  });
});
