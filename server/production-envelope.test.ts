import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, before, describe, it } from "node:test";
import express from "express";
import { safeApiRequestLogger } from "./request-logging";
import { validateUploadRoot } from "./document-files";

process.env.ANTHROPIC_API_KEY ||= "test-key";
process.env.DATABASE_URL ||= "postgres://hirepass_test:hirepass_test@127.0.0.1:1/hirepass_test";
process.env.HIREPASS_ADMIN_USERNAME = "owner";
process.env.HIREPASS_ADMIN_PASSWORD = "correct horse battery staple";
process.env.HIREPASS_SESSION_SECRET = "test-session-secret-with-more-than-32-characters";
const testAdminPasswordHash = "pbkdf2:210000:0123456789abcdef0123456789abcdef:58a4fc24182ba5cab9192c414a47d3a6d384a9624174f76721ee0bf9b986c5ba";

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
const pdfBase64 = Buffer.from("%PDF-1.4\nfictional hirepass test document").toString("base64");

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
    if (queryText === "select 1") {
      if (result === "failure") throw new Error("simulated database unavailable");
      return { rows: [{ "?column?": 1 }], rowCount: 1 };
    }
    return (originalPoolQuery as any).call(pool, queryText, ...args);
  }) as typeof pool.query;
}

async function withServer(overrides: StorageOverrides, callback: (baseUrl: string) => Promise<void>) {
  const uploadDir = await mkdtemp(path.join(tmpdir(), "hirepass-upload-test-"));
  tempDirs.push(uploadDir);
  process.env.HIREPASS_UPLOAD_DIR = uploadDir;
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
      assert.equal(await download.text(), "%PDF-1.4\nfictional hirepass test document");

      const wrongCandidate = await fetch(`${baseUrl}/api/pass-candidates/999/documents/701/download`, { headers: { cookie } });
      assert.equal(wrongCandidate.status, 404);
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
});
