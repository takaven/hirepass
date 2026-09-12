import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { afterEach, before, describe, it } from "node:test";
import express from "express";
import { externalPassLandingPath } from "@shared/external-pass-links";

process.env.ANTHROPIC_API_KEY ||= "test-key";
process.env.DATABASE_URL ||= "postgres://hirepass_test:hirepass_test@127.0.0.1:1/hirepass_test";

let registerRoutes: typeof import("./routes").registerRoutes;
let storage: typeof import("./storage").storage;

before(async () => {
  ({ registerRoutes } = await import("./routes"));
  ({ storage } = await import("./storage"));
});

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

const future = daysFromNow(7);
const past = daysFromNow(-7);
const candidateToken = `cand_${"A".repeat(43)}`;
const expiredCandidateToken = `cand_${"B".repeat(43)}`;
const inactiveCandidateToken = `cand_${"C".repeat(43)}`;
const stakeholderToken = "11111111-1111-4111-8111-111111111111";

const activeCandidateLink = {
  id: 1,
  token: candidateToken,
  passCandidateId: 101,
  canFillApplication: true,
  canTakeAssessment: true,
  applicationCompletedAt: null,
  assessmentCompletedAt: null,
  expiresAt: future,
  isActive: true,
  createdAt: new Date("2026-08-22T08:00:00.000Z"),
};

const expiredCandidateLink = { ...activeCandidateLink, id: 2, token: expiredCandidateToken, expiresAt: past };
const inactiveCandidateLink = { ...activeCandidateLink, id: 3, token: inactiveCandidateToken, isActive: false };

const passCandidate = {
  id: 101,
  passId: 10,
  candidateId: 201,
  positionId: null,
  status: "shortlisted",
  aiRank: 1,
  aiScore: 94,
  aiBrief: "Internal AI summary",
  softSkillsScore: 88,
  softSkillsCompletedAt: null,
  technicalScore: 91,
  technicalCompletedAt: null,
  technicalAssessmentId: null,
  interviewScore: "4.5",
  interviewRecommendation: "hire",
  selectedForPosition: null,
  selectionNotes: "Internal selection note",
  rejectionReason: null,
  rejectionNotes: "Internal rejection note",
  rejectedAt: null,
  addedAt: new Date("2026-08-22T08:00:00.000Z"),
  shortlistedAt: null,
  updatedAt: new Date("2026-08-22T08:00:00.000Z"),
};

const candidate = {
  id: 201,
  name: "Fictional Candidate",
  email: "candidate@example.com",
  phone: "+971500000000",
  currentTitle: "Operations Lead",
  currentCompany: "Example Co",
  experienceYears: 5,
  skills: ["operations"],
  currentLocation: "Dubai",
  willingToRelocate: true,
  noticePeriod: "30 days",
  expectedSalary: 25000,
  expectedSalaryCurrency: "AED",
  linkedinUrl: "https://example.com/profile",
  cvFilePath: "/private/cv.pdf",
  cvFileName: "cv.pdf",
  cvSummary: "Operational leadership background.",
  inTalentPool: true,
  talentPoolTags: ["priority"],
  talentPoolNotes: "Internal talent pool note",
  source: "referral",
  sourceDetails: "Internal source note",
  createdAt: new Date("2026-08-22T08:00:00.000Z"),
  updatedAt: new Date("2026-08-22T08:00:00.000Z"),
};

const pass = {
  id: 10,
  passId: "PASS-10",
  title: "Operations Lead Hiring",
  positionTitle: "Operations Lead",
  headcount: 1,
  department: "Operations",
  location: "Dubai",
  employmentType: "Full-time",
  experienceMin: 3,
  experienceMax: 7,
  salaryRangeMin: 20000,
  salaryRangeMax: 30000,
  salaryCurrency: "AED",
  status: "active",
  currentStep: "interview",
  jobDescriptionDraft: "Internal draft JD",
  jobDescriptionFinal: "Approved JD",
  jdStatus: "approved",
  interviewFormat: "online",
  interviewDuration: 45,
  interviewRounds: 1,
  isPanelInterview: false,
  technicalAssessmentRequired: false,
  technicalAssessmentAreas: "Internal assessment scope",
  interviewSetupCompleted: true,
  softSkillsAssessmentUrl: null,
  technicalAssessmentUrl: null,
  requisitionFilePath: "/private/requisition.pdf",
  notes: "Internal HR note",
  managerNotes: "Internal manager note",
  targetHireDate: new Date("2026-09-01T00:00:00.000Z"),
};

const candidateMessage = {
  id: 701,
  passCandidateId: 101,
  senderType: "hr",
  senderId: 301,
  senderName: "HR",
  message: "Please review",
  attachments: [{ fileName: "private.pdf", filePath: "/private/private.pdf", fileType: "application/pdf" }],
  isRead: false,
  readAt: null,
  createdAt: new Date("2026-08-22T08:00:00.000Z"),
};

const timelineEvent = {
  id: 801,
  passCandidateId: 101,
  stage: "interview",
  status: "in_progress",
  title: "Interview stage",
  description: "Interview is pending.",
  completedAt: null,
  createdAt: new Date("2026-08-22T08:00:00.000Z"),
};

const interview = {
  id: 901,
  passId: 10,
  passCandidateId: 101,
  interviewDate: "2026-08-24",
  startTime: "10:00",
  endTime: "10:45",
  duration: 45,
  format: "online",
  location: "Video",
  meetingLink: "https://example.com/interview",
  roundNumber: 1,
  roundName: "Hiring manager",
  status: "scheduled",
  interviewNotes: "Internal interview note",
  createdAt: new Date("2026-08-22T08:00:00.000Z"),
  updatedAt: new Date("2026-08-22T08:00:00.000Z"),
};

const offer = {
  id: 1001,
  passId: 10,
  passCandidateId: 101,
  positionNumber: 1,
  salary: 25000,
  salaryCurrency: "AED",
  startDate: "2026-09-15",
  contractType: "Full-time",
  probationPeriod: 6,
  benefits: ["Medical"],
  status: "pending",
  approvedBy: 301,
  approvedAt: new Date("2026-08-22T08:00:00.000Z"),
  sentAt: new Date("2026-08-22T08:00:00.000Z"),
  respondedAt: null,
  declineReason: "Internal decline reason",
  negotiationNotes: "Internal negotiation note",
  createdAt: new Date("2026-08-22T08:00:00.000Z"),
  updatedAt: new Date("2026-08-22T08:00:00.000Z"),
};

const interviewSlot = {
  id: 501,
  passId: 10,
  slotDate: "2026-08-24",
  startTime: "10:00",
  endTime: "10:45",
  format: "online",
  location: "Video",
  meetingLink: "https://example.com/slot",
  interviewerId: 301,
  isBooked: false,
  bookedBy: null,
  bookedAt: null,
  isActive: true,
  createdAt: new Date("2026-08-22T08:00:00.000Z"),
};

const manager = {
  id: 301,
  name: "Fictional Manager",
  jobTitle: "Operations Director",
  email: "manager@example.com",
  department: "Operations",
  phone: "+971500000001",
  isActive: true,
  canBeInterviewer: true,
  canBeHiringManager: true,
  createdAt: new Date("2026-08-22T08:00:00.000Z"),
  updatedAt: new Date("2026-08-22T08:00:00.000Z"),
};

type StorageOverrides = Partial<Record<keyof typeof storage, (...args: any[]) => any>>;

const originals = new Map<keyof typeof storage, unknown>();

function overrideStorage(overrides: StorageOverrides) {
  for (const [key, value] of Object.entries(overrides) as Array<[keyof typeof storage, (...args: any[]) => any]>) {
    if (!originals.has(key)) {
      originals.set(key, storage[key]);
    }
    (storage as any)[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of originals) {
    (storage as any)[key] = value;
  }
  originals.clear();
});

async function withServer(overrides: StorageOverrides, callback: (baseUrl: string) => Promise<void>) {
  overrideStorage({
    getCandidateLinkByToken: async (token: string) => {
      if (token === candidateToken) return activeCandidateLink;
      if (token === expiredCandidateToken) return expiredCandidateLink;
      if (token === inactiveCandidateToken) return inactiveCandidateLink;
      return undefined;
    },
    getCandidateLink: async (id: number) => [activeCandidateLink, expiredCandidateLink, inactiveCandidateLink].find((link) => link.id === id),
    getPassCandidateById: async () => passCandidate,
    getCandidate: async () => candidate,
    getPass: async () => pass,
    getCandidateMessages: async () => [candidateMessage],
    getCandidateDocuments: async () => [],
    getCandidateTimelineEvents: async () => [timelineEvent],
    getInterviewsByPassCandidate: async () => [interview],
    getOfferByPassCandidate: async () => offer,
    getAvailableInterviewSlots: async () => [interviewSlot],
    getActivitiesByPass: async () => [],
    bookInterviewSlot: async () => undefined,
    bookInterviewSlotAndCreateInterview: async () => undefined,
    createInterview: async () => undefined,
    createInterviewAndAdvanceCandidate: async (data: any) => ({ id: 902, ...data }),
    configureInterviewSetup: async () => [],
    updatePassCandidate: async () => undefined,
    respondToCandidateOffer: async (existingOffer: any, response: string, candidateText: string | null) => ({ ...existingOffer, status: response === "accept" ? "accepted" : response === "decline" ? "declined" : "negotiating", declineReason: response === "decline" ? candidateText : existingOffer.declineReason, negotiationNotes: response === "negotiate" ? candidateText : existingOffer.negotiationNotes }),
    submitInterviewEvaluation: async (data: any) => ({ id: 1, ...data, averageScore: null }),
    createCandidateMessage: async () => ({ id: 1, passCandidateId: 101 }),
    createCandidateDocument: async () => ({ id: 1, passCandidateId: 101 }),
    markMessageAsRead: async () => undefined,
    getShareLinkByToken: async () => ({
      id: 11,
      token: stakeholderToken,
      passId: 10,
      managerId: 301,
      linkType: "manager",
      permissions: null,
      expiresAt: future,
      accessCount: 0,
      lastAccessedAt: null,
      isActive: true,
      createdAt: new Date("2026-08-22T08:00:00.000Z"),
    }),
    getShareLink: async (id: number) => id === 11 ? ({
      id: 11,
      token: stakeholderToken,
      passId: 10,
      managerId: 301,
      linkType: "manager",
      permissions: null,
      expiresAt: future,
      accessCount: 0,
      lastAccessedAt: null,
      isActive: true,
      createdAt: new Date("2026-08-22T08:00:00.000Z"),
    }) : undefined,
    updateShareLink: async (_id: number, data: unknown) => data,
    getPassWithDetails: async () => pass,
    getPassCandidatesWithDetails: async () => [{ ...passCandidate, candidate }],
    getInterviewsByPass: async () => [interview],
    getInterview: async () => interview,
    getManager: async (id: number) => id === manager.id ? manager : undefined,
    getInterviewSlotsByPass: async () => [interviewSlot],
    logActivity: async (activity: any) => ({ id: 1, createdAt: new Date(), ...activity }),
    ...overrides,
  });

  const app = express();
  app.use(express.json());
  const server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert(address && typeof address === "object");

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => (error ? reject(error) : resolve()));
    });
  }
}

async function json(response: Response) {
  return response.json() as Promise<any>;
}

type TestPassKind = "candidate" | "stakeholder";

async function exchangeSession(baseUrl: string, kind: TestPassKind, token: string) {
  const response = await fetch(`${baseUrl}/api/external/${kind === "candidate" ? "candidate-pass" : "stakeholder-pass"}/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ token }),
  });
  assert.equal(response.status, 204);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert(cookie);
  return cookie;
}

function passFetch(baseUrl: string, path: string, cookie: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  if ((init.method || "GET").toUpperCase() !== "GET") headers.set("origin", baseUrl);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

function assertAbsent(value: unknown, fields: string[]) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) {
      assertAbsent(item, fields);
    }
    return;
  }

  for (const field of fields) {
    assert.equal(Object.hasOwn(value, field), false, `${field} should not be exposed`);
  }
}

describe("external Candidate Pass route security", () => {
  it("generates fragment-only Candidate and Stakeholder landing URLs", () => {
    for (const [kind, token, expectedPath] of [
      ["candidate", candidateToken, "/candidate-pass"],
      ["stakeholder", stakeholderToken, "/manager-pass"],
    ] as const) {
      const url = new URL(`https://careers.example.test${externalPassLandingPath(kind, token)}`);
      assert.equal(url.pathname, expectedPath);
      assert.equal(url.search, "");
      assert.equal(url.hash, `#${token}`);
      assert.equal(`${url.pathname}${url.search}`.includes(token), false);
    }
  });

  it("exchanges bearer bodies for scoped HttpOnly cookies without echoing the bearer", async () => {
    await withServer({}, async (baseUrl) => {
      const candidate = await fetch(`${baseUrl}/api/external/candidate-pass/session`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseUrl },
        body: JSON.stringify({ token: candidateToken }),
      });
      assert.equal(candidate.status, 204);
      assert.equal(candidate.headers.get("cache-control"), "no-store");
      assert.equal(candidate.headers.get("referrer-policy"), "no-referrer");
      const candidateCookie = candidate.headers.get("set-cookie") || "";
      assert.match(candidateCookie, /HttpOnly/i);
      assert.match(candidateCookie, /SameSite=Strict/i);
      assert.match(candidateCookie, /Path=\/api\/external\/candidate-pass/i);
      assert.match(candidateCookie, /Max-Age=/i);
      assert.equal(candidateCookie.includes(candidateToken), false);

      const stakeholder = await fetch(`${baseUrl}/api/external/stakeholder-pass/session`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseUrl },
        body: JSON.stringify({ token: stakeholderToken }),
      });
      assert.equal(stakeholder.status, 204);
      const stakeholderCookie = stakeholder.headers.get("set-cookie") || "";
      assert.match(stakeholderCookie, /Path=\/api\/external\/stakeholder-pass/i);
      assert.equal(stakeholderCookie.includes(stakeholderToken), false);
    });
  });

  it("marks production external-session cookies Secure and caps them below Pass expiry", async () => {
    const previous = {
      nodeEnv: process.env.NODE_ENV,
      secret: process.env.HIREPASS_SESSION_SECRET,
      publicBase: process.env.HIREPASS_PUBLIC_BASE_URL,
    };
    try {
      process.env.NODE_ENV = "production";
      process.env.HIREPASS_SESSION_SECRET = "production-test-session-secret-at-least-32-characters";
      await withServer({}, async (baseUrl) => {
        process.env.HIREPASS_PUBLIC_BASE_URL = baseUrl;
        const response = await fetch(`${baseUrl}/api/external/candidate-pass/session`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: baseUrl },
          body: JSON.stringify({ token: candidateToken }),
        });
        assert.equal(response.status, 204);
        const cookie = response.headers.get("set-cookie") || "";
        assert.match(cookie, /^__Secure-hirepass-candidate-pass=/);
        assert.match(cookie, /; Secure/i);
        assert.match(cookie, /; HttpOnly/i);
        assert.match(cookie, /; SameSite=Strict/i);
        const maxAge = Number(/Max-Age=(\d+)/i.exec(cookie)?.[1]);
        assert(maxAge > 0 && maxAge <= 8 * 60 * 60);
      });
    } finally {
      if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
      if (previous.secret === undefined) delete process.env.HIREPASS_SESSION_SECRET; else process.env.HIREPASS_SESSION_SECRET = previous.secret;
      if (previous.publicBase === undefined) delete process.env.HIREPASS_PUBLIC_BASE_URL; else process.env.HIREPASS_PUBLIC_BASE_URL = previous.publicBase;
    }
  });

  it("keeps Candidate and Stakeholder external sessions isolated", async () => {
    await withServer({}, async (baseUrl) => {
      const candidateCookie = await exchangeSession(baseUrl, "candidate", candidateToken);
      const stakeholderCookie = await exchangeSession(baseUrl, "stakeholder", stakeholderToken);
      assert.equal((await passFetch(baseUrl, "/api/external/stakeholder-pass", candidateCookie)).status, 404);
      assert.equal((await passFetch(baseUrl, "/api/external/candidate-pass", stakeholderCookie)).status, 404);
      assert.equal((await passFetch(baseUrl, "/api/external/candidate-pass", candidateCookie)).status, 200);
      assert.equal((await passFetch(baseUrl, "/api/external/stakeholder-pass", stakeholderCookie)).status, 200);
    });
  });

  it("rejects a tampered external-session cookie", async () => {
    await withServer({}, async (baseUrl) => {
      const cookie = await exchangeSession(baseUrl, "candidate", candidateToken);
      const tampered = `${cookie.slice(0, -1)}${cookie.endsWith("A") ? "B" : "A"}`;
      assert.equal((await passFetch(baseUrl, "/api/external/candidate-pass", tampered)).status, 404);
    });
  });

  it("rejects cross-site or originless external-session mutations", async () => {
    let created = false;
    await withServer({ createCandidateMessage: async () => { created = true; } }, async (baseUrl) => {
      const cookie = await exchangeSession(baseUrl, "candidate", candidateToken);
      for (const origin of [undefined, "https://attacker.example"]) {
        const headers = new Headers({ cookie, "content-type": "application/json" });
        if (origin) headers.set("origin", origin);
        const response = await fetch(`${baseUrl}/api/external/candidate-pass/messages`, {
          method: "POST",
          headers,
          body: JSON.stringify({ message: "Hello" }),
        });
        assert.equal(response.status, 403);
      }
      assert.equal(created, false);
    });
  });

  it("rejects a cross-site bearer exchange before issuing a session", async () => {
    await withServer({}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/external/candidate-pass/session`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://attacker.example" },
        body: JSON.stringify({ token: candidateToken }),
      });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("set-cookie"), null);
    });
  });

  it("rechecks expiry after an external session has been issued", async () => {
    let mutableLink = { ...activeCandidateLink };
    await withServer({
      getCandidateLinkByToken: async (token: string) => token === candidateToken ? mutableLink : undefined,
      getCandidateLink: async (id: number) => id === mutableLink.id ? mutableLink : undefined,
    }, async (baseUrl) => {
      const cookie = await exchangeSession(baseUrl, "candidate", candidateToken);
      mutableLink = { ...mutableLink, expiresAt: past };
      const response = await passFetch(baseUrl, "/api/external/candidate-pass", cookie);
      assert.equal(response.status, 410);
    });
  });

  it("rejects expired and revoked Stakeholder token exchanges", async () => {
    for (const link of [
      { id: 11, token: stakeholderToken, passId: 10, managerId: 301, linkType: "manager", expiresAt: past, isActive: true },
      { id: 11, token: stakeholderToken, passId: 10, managerId: 301, linkType: "manager", expiresAt: future, isActive: false },
    ]) {
      await withServer({ getShareLinkByToken: async () => link }, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/external/stakeholder-pass/session`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: baseUrl },
          body: JSON.stringify({ token: stakeholderToken }),
        });
        assert.equal(response.status, link.isActive ? 410 : 404);
      });
    }
  });

  it("does not register the legacy token-in-path APIs", async () => {
    await withServer({}, async (baseUrl) => {
      assert.equal((await fetch(`${baseUrl}/api/candidate-pass/${candidateToken}`)).status, 404);
      assert.equal((await fetch(`${baseUrl}/api/manager-pass/${stakeholderToken}`)).status, 404);
    });
  });

  it("sets no-referrer and no-store policy on external Pass landing paths", async () => {
    await withServer({}, async (baseUrl) => {
      for (const path of ["/candidate-pass", "/manager-pass"]) {
        const response = await fetch(`${baseUrl}${path}`);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      }
    });
  });

  it("rejects expired Candidate Pass mutations", async () => {
    let createMessageCalled = false;
    await withServer({ createCandidateMessage: async () => { createMessageCalled = true; } }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/external/candidate-pass/session`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseUrl },
        body: JSON.stringify({ token: expiredCandidateToken }),
      });

      assert.equal(response.status, 410);
      assert.equal(createMessageCalled, false);
    });
  });

  it("rejects inactive Candidate Pass mutations", async () => {
    let createDocumentCalled = false;
    await withServer({ createCandidateDocument: async () => { createDocumentCalled = true; } }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/external/candidate-pass/session`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseUrl },
        body: JSON.stringify({ token: inactiveCandidateToken }),
      });

      assert.equal(response.status, 404);
      assert.equal(createDocumentCalled, false);
    });
  });

  it("allows a candidate to book a slot scoped to their Pass", async () => {
    let bookedWith: unknown[] | null = null;
    await withServer({
      getAvailableInterviewSlots: async () => [interviewSlot],
      bookInterviewSlotAndCreateInterview: async (...args: unknown[]) => {
        bookedWith = args;
        return { slot: { ...interviewSlot, isBooked: true, bookedBy: 101, bookedAt: new Date() }, interview: { id: 1 } };
      },
    }, async (baseUrl) => {
      const cookie = await exchangeSession(baseUrl, "candidate", candidateToken);
      const response = await passFetch(baseUrl, "/api/external/candidate-pass/interview-slot", cookie, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slotId: 501 }),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(bookedWith, [501, 101, 10]);
    });
  });

  it("rejects cross-pass interview slot ids", async () => {
    let booked = false;
    await withServer({
      getAvailableInterviewSlots: async () => [{ ...interviewSlot, id: 999, passId: 11 }],
      bookInterviewSlotAndCreateInterview: async () => {
        booked = true;
        return undefined;
      },
    }, async (baseUrl) => {
      const cookie = await exchangeSession(baseUrl, "candidate", candidateToken);
      const response = await passFetch(baseUrl, "/api/external/candidate-pass/interview-slot", cookie, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slotId: 999 }),
      });

      assert.equal(response.status, 404);
      assert.equal(booked, false);
    });
  });

  it("allows a candidate to mark their own message read", async () => {
    let markedMessageId: number | null = null;
    await withServer({
      getCandidateMessages: async () => [candidateMessage],
      markMessageAsRead: async (messageId: number) => {
        markedMessageId = messageId;
      },
    }, async (baseUrl) => {
      const cookie = await exchangeSession(baseUrl, "candidate", candidateToken);
      const response = await passFetch(baseUrl, "/api/external/candidate-pass/messages/701/read", cookie, { method: "PATCH" });

      assert.equal(response.status, 200);
      assert.equal(markedMessageId, 701);
    });
  });

  it("rejects unrelated candidate message ids", async () => {
    let marked = false;
    await withServer({
      getCandidateMessages: async () => [candidateMessage],
      markMessageAsRead: async () => {
        marked = true;
      },
    }, async (baseUrl) => {
      const cookie = await exchangeSession(baseUrl, "candidate", candidateToken);
      const response = await passFetch(baseUrl, "/api/external/candidate-pass/messages/888/read", cookie, { method: "PATCH" });

      assert.equal(response.status, 404);
      assert.equal(marked, false);
    });
  });

  it("does not expose internal Candidate Pass fields", async () => {
    await withServer({}, async (baseUrl) => {
      const cookie = await exchangeSession(baseUrl, "candidate", candidateToken);
      const response = await passFetch(baseUrl, "/api/external/candidate-pass", cookie);
      const payload = await json(response);

      assert.equal(response.status, 200);
      assertAbsent(payload.passCandidate, ["aiRank", "aiScore", "aiBrief", "interviewRecommendation", "selectionNotes", "rejectionNotes"]);
      assertAbsent(payload.pass, ["salaryRangeMin", "salaryRangeMax", "salaryCurrency", "requisitionFilePath", "notes", "managerNotes"]);
      assertAbsent(payload.messages, ["senderId", "attachments"]);
      assertAbsent(payload.timeline, ["passCandidateId"]);
      assertAbsent(payload.interviews, ["passId", "passCandidateId", "interviewNotes", "createdAt", "updatedAt"]);
      assertAbsent(payload.offer, ["passId", "passCandidateId", "positionNumber", "approvedBy", "approvedAt", "sentAt", "respondedAt", "declineReason", "negotiationNotes", "createdAt", "updatedAt"]);
      assertAbsent(payload.interviewSlots, ["passId", "interviewerId", "isBooked", "bookedBy", "bookedAt", "isActive", "createdAt"]);
    });
  });
});

describe("internal interview route invariants", () => {
  const directPayload = { passId: 10, passCandidateId: 101, interviewerId: 301, interviewDate: "2026-10-10", startTime: "09:00", duration: 45, format: "online", roundNumber: 1, roundName: "Hiring Manager", status: "scheduled" };

  it("accepts one valid scoped direct interview", async () => {
    let created: any = null;
    await withServer({ createInterviewAndAdvanceCandidate: async (data: any) => { created = { id: 902, ...data }; return created; } }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/interviews`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(directPayload) });
      assert.equal(response.status, 201);
      assert.equal(created.endTime, "09:45");
      assert.equal(created.interviewerId, 301);
    });
  });

  it("rejects missing, nonexistent, inactive or ineligible interviewers", async () => {
    await withServer({ getManager: async (id: number) => id === 302 ? { ...manager, id, isActive: false } : id === 303 ? { ...manager, id, canBeInterviewer: false } : undefined }, async (baseUrl) => {
      for (const interviewerId of [undefined, 999, 302, 303]) {
        const response = await fetch(`${baseUrl}/api/interviews`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...directPayload, interviewerId }) });
        assert.equal(response.status, 400);
      }
    });
  });

  it("rejects cross-Pass candidates and workflows without Interview", async () => {
    await withServer({ getPassCandidateById: async () => ({ ...passCandidate, passId: 11 }) }, async (baseUrl) => {
      assert.equal((await fetch(`${baseUrl}/api/interviews`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(directPayload) })).status, 400);
    });
    await withServer({ getPass: async () => ({ ...pass, enabledStages: ["new", "screening", "hired"] }) }, async (baseUrl) => {
      assert.equal((await fetch(`${baseUrl}/api/interviews`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(directPayload) })).status, 409);
    });
  });

  it("reschedules mutable details but rejects Pass or candidate reassignment", async () => {
    let changes: any = null;
    await withServer({ rescheduleInterview: async (_id: number, data: any) => { changes = data; return { ...interview, ...data }; } }, async (baseUrl) => {
      const valid = await fetch(`${baseUrl}/api/interviews/901`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ interviewDate: "2026-10-11", startTime: "11:00", duration: 30, interviewerId: 301 }) });
      assert.equal(valid.status, 200);
      assert.equal(changes.endTime, "11:30");
      assert.equal(changes.passId, undefined);
      assert.equal(changes.passCandidateId, undefined);
      changes = null;
      assert.equal((await fetch(`${baseUrl}/api/interviews/901`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ interviewerId: 999 }) })).status, 400);
      assert.equal((await fetch(`${baseUrl}/api/interviews/901`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ passId: 11 }) })).status, 409);
      assert.equal((await fetch(`${baseUrl}/api/interviews/901`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ passCandidateId: 999 }) })).status, 409);
      assert.equal(changes, null);
    });
  });

  it("rejects booking when Interview is disabled without mutating the slot", async () => {
    let booked = false;
    await withServer({
      getPass: async () => ({ ...pass, enabledStages: ["new", "screening", "hired"] }),
      bookInterviewSlotAndCreateInterview: async () => { booked = true; return undefined; },
    }, async (baseUrl) => {
      const cookie = await exchangeSession(baseUrl, "candidate", candidateToken);
      const response = await passFetch(baseUrl, "/api/external/candidate-pass/interview-slot", cookie, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slotId: 501 }) });
      assert.equal(response.status, 409);
      assert.equal(booked, false);
    });
  });
});

describe("Stakeholder Pass interview setup integrity", () => {
  const validSetup = {
    technicalAssessmentRequired: false,
    interviewFormat: "online",
    interviewRounds: 1,
    interviewDuration: 45,
    availableDates: ["2026-10-10"],
    timeSlots: ["09:00", "11:15"],
    meetingLink: "https://example.com/interview",
    location: null,
    isPanelInterview: false,
  };

  it("accepts an eligible stakeholder and persists the fully validated slot set once", async () => {
    let persisted: any = null;
    await withServer({ configureInterviewSetup: async (passId: number, changes: any, slots: any[]) => { persisted = { passId, changes, slots }; return slots; } }, async (baseUrl) => {
      const cookie = await exchangeSession(baseUrl, "stakeholder", stakeholderToken);
      const response = await passFetch(baseUrl, "/api/external/stakeholder-pass/interview-setup", cookie, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validSetup) });
      assert.equal(response.status, 200);
      assert.equal(persisted.changes.interviewSetupCompleted, true);
      assert.deepEqual(persisted.slots.map((slot: any) => [slot.startTime, slot.endTime, slot.interviewerId]), [["09:00", "09:45", 301], ["11:15", "12:00", 301]]);
    });
  });

  it("rejects inactive or non-interviewer stakeholders before mutation", async () => {
    for (const stakeholder of [{ ...manager, isActive: false }, { ...manager, canBeInterviewer: false }]) {
      let mutated = false;
      await withServer({ getManager: async () => stakeholder, configureInterviewSetup: async () => { mutated = true; return []; } }, async (baseUrl) => {
        const cookie = await exchangeSession(baseUrl, "stakeholder", stakeholderToken);
        const response = await passFetch(baseUrl, "/api/external/stakeholder-pass/interview-setup", cookie, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validSetup) });
        assert.equal(response.status, 403);
        assert.equal(mutated, false);
      });
    }
  });

  it("rejects every malformed availability case before mutation", async () => {
    const invalidCases = [
      { timeSlots: ["24:00"] },
      { timeSlots: ["09:60"] },
      { timeSlots: ["23:45"], interviewDuration: 30 },
      { timeSlots: ["9am"] },
      { availableDates: ["2026-02-30"] },
    ];
    for (const invalid of invalidCases) {
      let mutated = false;
      await withServer({ configureInterviewSetup: async () => { mutated = true; return []; } }, async (baseUrl) => {
        const cookie = await exchangeSession(baseUrl, "stakeholder", stakeholderToken);
        const response = await passFetch(baseUrl, "/api/external/stakeholder-pass/interview-setup", cookie, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...validSetup, ...invalid }) });
        assert.equal(response.status, 400);
        assert.equal(mutated, false);
      });
    }
  });
});

describe("Candidate Pass offer responses", () => {
  async function submit(body: unknown, status = "pending") {
    let persisted: any = null;
    let mutableOffer = { ...offer, status, declineReason: null, negotiationNotes: null };
    await withServer({
      getOfferByPassCandidate: async () => mutableOffer,
      respondToCandidateOffer: async (_offer: any, response: string, candidateText: string | null) => {
        persisted = { response, candidateText };
        mutableOffer = { ...mutableOffer, status: response === "accept" ? "accepted" : response === "decline" ? "declined" : "negotiating" };
        return mutableOffer;
      },
    }, async (baseUrl) => {
      const cookie = await exchangeSession(baseUrl, "candidate", candidateToken);
      const response = await passFetch(baseUrl, "/api/external/candidate-pass/offer-response", cookie, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      persisted = { ...persisted, httpStatus: response.status };
    });
    return persisted;
  }

  it("accepts without inventing candidate text", async () => {
    assert.deepEqual(await submit({ response: "accept" }), { response: "accept", candidateText: null, httpStatus: 200 });
  });

  it("persists only supplied negotiation or decline text and permits either to be omitted", async () => {
    assert.deepEqual(await submit({ response: "negotiate", message: "Please clarify the start date" }), { response: "negotiate", candidateText: "Please clarify the start date", httpStatus: 200 });
    assert.deepEqual(await submit({ response: "negotiate" }), { response: "negotiate", candidateText: null, httpStatus: 200 });
    assert.deepEqual(await submit({ response: "decline", reason: "Accepted another role" }), { response: "decline", candidateText: "Accepted another role", httpStatus: 200 });
    assert.deepEqual(await submit({ response: "decline" }), { response: "decline", candidateText: null, httpStatus: 200 });
  });

  it("rejects unknown responses and terminal offers without persistence", async () => {
    assert.deepEqual(await submit({ response: "maybe" }), { httpStatus: 400 });
    assert.deepEqual(await submit({ response: "decline" }, "accepted"), { httpStatus: 409 });
    assert.deepEqual(await submit({ response: "accept" }, "declined"), { httpStatus: 409 });
  });

  it("retains Candidate Pass expiry and revocation enforcement", async () => {
    for (const token of [expiredCandidateToken, inactiveCandidateToken]) {
      await withServer({}, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/external/candidate-pass/session`, { method: "POST", headers: { "content-type": "application/json", origin: baseUrl }, body: JSON.stringify({ token }) });
        assert.equal(response.status, token === expiredCandidateToken ? 410 : 404);
      });
    }
  });
});

describe("external Manager Pass route privacy", () => {
  it("returns a decision-evidence DTO instead of raw candidate records", async () => {
    await withServer({}, async (baseUrl) => {
      const cookie = await exchangeSession(baseUrl, "stakeholder", stakeholderToken);
      const response = await passFetch(baseUrl, "/api/external/stakeholder-pass", cookie);
      const payload = await json(response);

      assert.equal(response.status, 200);
      const managerCandidate = payload.candidates[0];
      assertAbsent(managerCandidate, ["aiRank", "aiScore", "aiBrief", "interviewRecommendation", "selectionNotes", "rejectionNotes"]);
      assertAbsent(managerCandidate.candidate, ["email", "phone", "expectedSalary", "cvFilePath", "sourceDetails", "talentPoolNotes"]);
      assert.deepEqual(payload.manager, { name: "Fictional Manager" });
      assertAbsent(payload.pass, ["salaryRangeMin", "salaryRangeMax", "salaryCurrency", "requisitionFilePath", "notes", "managerNotes"]);
      assertAbsent(payload.interviews, ["passId", "interviewNotes", "meetingLink", "createdAt", "updatedAt"]);
      assertAbsent(payload.interviewSlots, ["passId", "meetingLink", "interviewerId", "bookedBy", "bookedAt", "isActive", "createdAt"]);
    });
  });

  it("persists only evaluator-supplied recommendation and notes", async () => {
    let persisted: any = null;
    await withServer({
      submitInterviewEvaluation: async (data: any, passCandidateId: number) => {
        persisted = { data, passCandidateId };
        return { id: 1, ...data, averageScore: null };
      },
    }, async (baseUrl) => {
      const cookie = await exchangeSession(baseUrl, "stakeholder", stakeholderToken);
      const response = await passFetch(baseUrl, "/api/external/stakeholder-pass/evaluations", cookie, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ interviewId: interview.id, recommendation: "proceed", notesObservations: "Observed evidence", educationalBackground: 4, averageScore: "4.00" }),
      });
      assert.equal(response.status, 201);
      assert.equal(persisted.data.evaluatorId, manager.id);
      assert.equal(persisted.data.educationalBackground, undefined);
      assert.equal(persisted.data.averageScore, undefined);
      assert.equal(persisted.passCandidateId, interview.passCandidateId);
    });
  });
});
