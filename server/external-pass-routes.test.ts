import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { afterEach, before, describe, it } from "node:test";
import express from "express";

process.env.ANTHROPIC_API_KEY ||= "test-key";
process.env.DATABASE_URL ||= "postgres://hirepass_test:hirepass_test@127.0.0.1:1/hirepass_test";

let registerRoutes: typeof import("./routes").registerRoutes;
let storage: typeof import("./storage").storage;

before(async () => {
  ({ registerRoutes } = await import("./routes"));
  ({ storage } = await import("./storage"));
});

const future = new Date("2026-08-23T12:00:00.000Z");
const past = new Date("2026-08-21T12:00:00.000Z");

const activeCandidateLink = {
  id: 1,
  token: "candidate-active",
  passCandidateId: 101,
  canFillApplication: true,
  canTakeAssessment: true,
  applicationCompletedAt: null,
  assessmentCompletedAt: null,
  expiresAt: future,
  isActive: true,
  createdAt: new Date("2026-08-22T08:00:00.000Z"),
};

const expiredCandidateLink = { ...activeCandidateLink, token: "candidate-expired", expiresAt: past };
const inactiveCandidateLink = { ...activeCandidateLink, token: "candidate-inactive", isActive: false };

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
  title: "Operations Lead Hiring",
  positionTitle: "Operations Lead",
  department: "Operations",
  location: "Dubai",
  jdStatus: "approved",
  interviewSetupCompleted: true,
  softSkillsAssessmentUrl: null,
  technicalAssessmentUrl: null,
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
      if (token === "candidate-active") return activeCandidateLink;
      if (token === "candidate-expired") return expiredCandidateLink;
      if (token === "candidate-inactive") return inactiveCandidateLink;
      return undefined;
    },
    getPassCandidateById: async () => passCandidate,
    getCandidate: async () => candidate,
    getPass: async () => pass,
    getCandidateMessages: async () => [],
    getCandidateDocuments: async () => [],
    getCandidateTimelineEvents: async () => [],
    getInterviewsByPassCandidate: async () => [],
    getOfferByPassCandidate: async () => undefined,
    getAvailableInterviewSlots: async () => [],
    bookInterviewSlot: async () => undefined,
    createInterview: async () => undefined,
    updatePassCandidate: async () => undefined,
    createCandidateMessage: async () => ({ id: 1, passCandidateId: 101 }),
    createCandidateDocument: async () => ({ id: 1, passCandidateId: 101 }),
    markMessageAsRead: async () => undefined,
    getShareLinkByToken: async () => ({
      id: 11,
      token: "manager-active",
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
    updateShareLink: async (_id: number, data: unknown) => data,
    getPassWithDetails: async () => pass,
    getPassCandidatesWithDetails: async () => [{ ...passCandidate, candidate }],
    getInterviewsByPass: async () => [],
    getManager: async () => ({ id: 301, name: "Fictional Manager" }),
    getInterviewSlotsByPass: async () => [],
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

describe("external Candidate Pass route security", () => {
  it("rejects expired Candidate Pass mutations", async () => {
    let createMessageCalled = false;
    await withServer({ createCandidateMessage: async () => { createMessageCalled = true; } }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/candidate-pass/candidate-expired/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Hello" }),
      });

      assert.equal(response.status, 410);
      assert.equal(createMessageCalled, false);
    });
  });

  it("rejects inactive Candidate Pass mutations", async () => {
    let createDocumentCalled = false;
    await withServer({ createCandidateDocument: async () => { createDocumentCalled = true; } }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/candidate-pass/candidate-inactive/documents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ docType: "passport", label: "Passport", fileName: "passport.pdf", filePath: "/tmp/passport.pdf", fileSize: 10 }),
      });

      assert.equal(response.status, 404);
      assert.equal(createDocumentCalled, false);
    });
  });

  it("allows a candidate to book a slot scoped to their Pass", async () => {
    let bookedWith: unknown[] | null = null;
    await withServer({
      getAvailableInterviewSlots: async () => [{ id: 501, passId: 10, slotDate: "2026-08-24", startTime: "10:00", endTime: "10:45", format: "online", location: null, meetingLink: null, interviewerId: null, isBooked: false, bookedBy: null, bookedAt: null, isActive: true, createdAt: new Date() }],
      bookInterviewSlot: async (...args: unknown[]) => {
        bookedWith = args;
        return { id: 501, passId: 10, slotDate: "2026-08-24", startTime: "10:00", endTime: "10:45", format: "online", location: null, meetingLink: null, interviewerId: null, isBooked: true, bookedBy: 101, bookedAt: new Date(), isActive: true, createdAt: new Date() };
      },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/candidate-pass/candidate-active/interview-slot`, {
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
      getAvailableInterviewSlots: async () => [{ id: 999, passId: 11, slotDate: "2026-08-24", startTime: "10:00", endTime: "10:45", format: "online", location: null, meetingLink: null, interviewerId: null, isBooked: false, bookedBy: null, bookedAt: null, isActive: true, createdAt: new Date() }],
      bookInterviewSlot: async () => {
        booked = true;
        return undefined;
      },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/candidate-pass/candidate-active/interview-slot`, {
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
      getCandidateMessages: async () => [{ id: 701, passCandidateId: 101, senderType: "hr", senderId: null, senderName: "HR", message: "Please review", attachments: null, isRead: false, readAt: null, createdAt: new Date() }],
      markMessageAsRead: async (messageId: number) => {
        markedMessageId = messageId;
      },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/candidate-pass/candidate-active/messages/701/read`, { method: "PATCH" });

      assert.equal(response.status, 200);
      assert.equal(markedMessageId, 701);
    });
  });

  it("rejects unrelated candidate message ids", async () => {
    let marked = false;
    await withServer({
      getCandidateMessages: async () => [{ id: 701, passCandidateId: 101, senderType: "hr", senderId: null, senderName: "HR", message: "Please review", attachments: null, isRead: false, readAt: null, createdAt: new Date() }],
      markMessageAsRead: async () => {
        marked = true;
      },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/candidate-pass/candidate-active/messages/888/read`, { method: "PATCH" });

      assert.equal(response.status, 404);
      assert.equal(marked, false);
    });
  });

  it("does not expose internal Candidate Pass fields", async () => {
    await withServer({}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/candidate-pass/candidate-active`);
      const payload = await json(response);

      assert.equal(response.status, 200);
      for (const field of ["aiRank", "aiScore", "aiBrief", "interviewRecommendation", "selectionNotes", "rejectionNotes"]) {
        assert.equal(Object.hasOwn(payload.passCandidate, field), false, `${field} should not be exposed`);
      }
    });
  });
});

describe("external Manager Pass route privacy", () => {
  it("returns a decision-evidence DTO instead of raw candidate records", async () => {
    await withServer({}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/manager-pass/manager-active`);
      const payload = await json(response);

      assert.equal(response.status, 200);
      const managerCandidate = payload.candidates[0];
      for (const field of ["aiRank", "aiScore", "aiBrief", "interviewRecommendation", "selectionNotes", "rejectionNotes"]) {
        assert.equal(Object.hasOwn(managerCandidate, field), false, `${field} should not be exposed`);
      }
      for (const field of ["email", "phone", "expectedSalary", "cvFilePath", "sourceDetails", "talentPoolNotes"]) {
        assert.equal(Object.hasOwn(managerCandidate.candidate, field), false, `${field} should not be exposed`);
      }
    });
  });
});
