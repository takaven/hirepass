import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, before, describe, it } from "node:test";
import express from "express";
import { resolveCandidatePassState } from "./candidate-pass-state";
import { buildPassControlItem } from "./hr-pass-control";
import { resolveManagerPassState } from "./manager-pass-state";

process.env.ANTHROPIC_API_KEY ||= "test-key";
process.env.DATABASE_URL ||= "postgres://hirepass_test:hirepass_test@127.0.0.1:1/hirepass_test";

let registerRoutes: typeof import("./routes").registerRoutes;
let storage: typeof import("./storage").storage;

before(async () => {
  ({ registerRoutes } = await import("./routes"));
  ({ storage } = await import("./storage"));
});

const now = new Date();
function daysFromNow(days: number) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}
const future = daysFromNow(7);
const past = daysFromNow(-7);
const oldDate = daysFromNow(-12);
const futureDateOnly = future.toISOString().slice(0, 10);
const managerToken = "22222222-2222-4222-8222-222222222222";
const nextManagerToken = "33333333-3333-4333-8333-333333333333";
const candidateToken = `cand_${"D".repeat(43)}`;

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
  interviewSetupCompleted: true,
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
  status: "screening",
  candidate,
  addedAt: oldDate,
  updatedAt: oldDate,
};

const managerLink = {
  id: 11,
  token: managerToken,
  passId: 10,
  managerId: 301,
  linkType: "manager",
  expiresAt: future,
  accessCount: 0,
  lastAccessedAt: null,
  isActive: true,
  createdAt: oldDate,
};

const candidateLink = {
  id: 21,
  token: candidateToken,
  passCandidateId: 101,
  canFillApplication: true,
  canTakeAssessment: true,
  applicationCompletedAt: null,
  assessmentCompletedAt: null,
  expiresAt: future,
  isActive: true,
  createdAt: oldDate,
};

const interviewSlot = {
  id: 501,
  passId: 10,
  slotDate: futureDateOnly,
  startTime: "10:00",
  endTime: "10:45",
  format: "online",
  isBooked: false,
  createdAt: oldDate,
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
  let mutableManagerLink = { ...managerLink };
  let mutableCandidateLink = { ...candidateLink };
  let mutableCandidateDocuments: any[] = [];
  const activities: any[] = [];

  overrideStorage({
    getPasses: async () => [pass],
    getPass: async (id: number) => (id === 10 ? pass : undefined),
    getPassWithDetails: async (id: number) => (id === 10 ? pass : undefined),
    getManager: async (id: number) => (id === 301 ? manager : undefined),
    getPassCandidatesWithDetails: async (passId: number) => (passId === 10 ? [passCandidate] : []),
    getPassCandidateById: async (id: number) => (id === 101 ? passCandidate : id === 999 ? { ...passCandidate, id: 999, passId: 20 } : undefined),
    getShareLinksByPass: async (passId: number) => (passId === 10 ? [mutableManagerLink] : []),
    getShareLinkByToken: async (token: string) => (token === mutableManagerLink.token ? mutableManagerLink : undefined),
    getShareLink: async (id: number) => id === mutableManagerLink.id ? mutableManagerLink : undefined,
    createShareLink: async (data: any) => {
      mutableManagerLink = { ...managerLink, id: 12, token: nextManagerToken, ...data };
      return mutableManagerLink;
    },
    updateShareLink: async (id: number, data: any) => {
      if (id === mutableManagerLink.id) mutableManagerLink = { ...mutableManagerLink, ...data };
      return mutableManagerLink;
    },
    getCandidateLinksByPassCandidate: async (passCandidateId: number) => (passCandidateId === 101 ? [mutableCandidateLink] : []),
    getCandidateLinkByToken: async (token: string) => (token === mutableCandidateLink.token ? mutableCandidateLink : undefined),
    getCandidateLink: async (id: number) => id === mutableCandidateLink.id ? mutableCandidateLink : undefined,
    createCandidateLink: async (data: any) => {
      mutableCandidateLink = { ...candidateLink, id: 22, token: data.token, ...data };
      return mutableCandidateLink;
    },
    updateCandidateLink: async (id: number, data: any) => {
      if (id === mutableCandidateLink.id) mutableCandidateLink = { ...mutableCandidateLink, ...data };
      return mutableCandidateLink;
    },
    getCandidate: async (id: number) => (id === 201 ? candidate : undefined),
    getInterviewsByPass: async () => [],
    getInterviewsByPassCandidate: async () => [],
    getInterviewSlotsByPass: async () => [interviewSlot],
    getAvailableInterviewSlots: async () => [interviewSlot],
    getCandidateMessages: async () => [],
    getCandidateDocuments: async () => mutableCandidateDocuments,
    createCandidateDocument: async (data: any) => {
      const document = { id: mutableCandidateDocuments.length + 701, createdAt: now, updatedAt: now, ...data };
      mutableCandidateDocuments = [document, ...mutableCandidateDocuments];
      return document;
    },
    updateCandidateDocument: async (id: number, data: any) => {
      const document = mutableCandidateDocuments.find((item) => item.id === id);
      if (!document) return undefined;
      Object.assign(document, data, { updatedAt: now });
      return document;
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

async function exchangeSession(baseUrl: string, kind: "candidate" | "stakeholder", token: string) {
  const contextId = kind === "candidate" ? "A".repeat(22) : "B".repeat(22);
  const response = await fetch(`${baseUrl}/api/external/${kind === "candidate" ? "candidate-pass" : "stakeholder-pass"}/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "x-hirepass-context": contextId },
    body: JSON.stringify({ token, contextId }),
  });
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  return { response, cookie, contextId };
}

function passFetch(baseUrl: string, path: string, cookie: string, init: RequestInit = {}, contextId = path.includes("stakeholder-pass") ? "B".repeat(22) : "A".repeat(22)) {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  headers.set("x-hirepass-context", contextId);
  if ((init.method || "GET").toUpperCase() !== "GET") headers.set("origin", baseUrl);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

describe("HR Pass Control state", () => {
  it("identifies candidate work without marking fresh action as stalled", () => {
    const item = buildPassControlItem({
      pass: { ...pass, updatedAt: now } as any,
      manager: manager as any,
      candidates: [{ ...passCandidate, status: "shortlisted", updatedAt: now } as any],
      candidateLinksByPassCandidateId: new Map([[101, [{ ...candidateLink, createdAt: now } as any]]]),
      managerLinks: [{ ...managerLink, createdAt: now } as any],
      interviews: [],
      interviewSlots: [interviewSlot as any],
      messagesByPassCandidateId: new Map(),
      documentsByPassCandidateId: new Map(),
      offersByPassCandidateId: new Map(),
      activity: [],
      now,
    });

    assert.equal(item.waitingOn, "candidate");
    assert.equal(item.candidateActions, 1);
    assert.equal(item.isStalled, false);
  });

  it("identifies manager decisions when candidate input is not the next blocker", () => {
    const item = buildPassControlItem({
      pass: { ...pass, updatedAt: now } as any,
      manager: manager as any,
      candidates: [{ ...passCandidate, status: "screening", updatedAt: now } as any],
      candidateLinksByPassCandidateId: new Map([[101, [{ ...candidateLink, createdAt: now } as any]]]),
      managerLinks: [{ ...managerLink, createdAt: now } as any],
      interviews: [],
      interviewSlots: [],
      messagesByPassCandidateId: new Map(),
      documentsByPassCandidateId: new Map(),
      offersByPassCandidateId: new Map(),
      activity: [],
      now,
    });

    assert.equal(item.waitingOn, "manager");
    assert.equal(item.managerActions, 1);
    assert.equal(item.isStalled, false);
  });

  it("marks old unresolved candidate actions as stalled", () => {
    const item = buildPassControlItem({
      pass: pass as any,
      manager: manager as any,
      candidates: [{ ...passCandidate, status: "shortlisted" } as any],
      candidateLinksByPassCandidateId: new Map([[101, [candidateLink as any]]]),
      managerLinks: [managerLink as any],
      interviews: [],
      interviewSlots: [interviewSlot as any],
      messagesByPassCandidateId: new Map(),
      documentsByPassCandidateId: new Map(),
      offersByPassCandidateId: new Map(),
      activity: [],
      now,
    });

    assert.equal(item.waitingOn, "candidate");
    assert.equal(item.isStalled, true);
    assert.equal(item.candidates[0].isStalled, true);
  });

  it("marks old unresolved manager actions as stalled", () => {
    const item = buildPassControlItem({
      pass: pass as any,
      manager: manager as any,
      candidates: [{ ...passCandidate, status: "screening" } as any],
      candidateLinksByPassCandidateId: new Map([[101, [candidateLink as any]]]),
      managerLinks: [managerLink as any],
      interviews: [],
      interviewSlots: [],
      messagesByPassCandidateId: new Map(),
      documentsByPassCandidateId: new Map(),
      offersByPassCandidateId: new Map(),
      activity: [],
      now,
    });

    assert.equal(item.waitingOn, "manager");
    assert.equal(item.managerActions, 1);
    assert.equal(item.isStalled, true);
  });

  it("uses meaningful workflow activity for HR waiting age", () => {
    const threeDaysAgo = daysFromNow(-3);
    const item = buildPassControlItem({
      pass: { ...pass, updatedAt: oldDate, targetHireDate: future } as any,
      manager: manager as any,
      candidates: [{ ...passCandidate, status: "offer", updatedAt: oldDate } as any],
      candidateLinksByPassCandidateId: new Map([[101, [candidateLink as any]]]),
      managerLinks: [managerLink as any],
      interviews: [],
      interviewSlots: [],
      messagesByPassCandidateId: new Map(),
      documentsByPassCandidateId: new Map(),
      offersByPassCandidateId: new Map(),
      activity: [{
        id: 99,
        passId: 10,
        actorType: "manager",
        actorName: "Fictional Manager",
        action: "manager_final_decision_submitted",
        targetType: "pass_candidate",
        targetId: 101,
        details: { passCandidateId: 101, decision: "hire" },
        createdAt: threeDaysAgo,
      }] as any,
      now,
    });

    assert.equal(item.waitingOn, "hr");
    assert.equal(item.waitingAgeDays, 3);
    assert.equal(item.passHandoff, "Pass Handoff: Hiring Manager -> Hiring team");
    assert.match(item.expectedMovement, new RegExp(future.toISOString().slice(0, 10)));
    assert.equal(item.isStalled, false);
  });

  it("classifies HR-issued Manager Pass handoff as HR to Hiring Manager", () => {
    const item = buildPassControlItem({
      pass: { ...pass, updatedAt: oldDate } as any,
      manager: manager as any,
      candidates: [{ ...passCandidate, status: "interview", interviewRecommendation: null, updatedAt: oldDate } as any],
      candidateLinksByPassCandidateId: new Map([[101, [candidateLink as any]]]),
      managerLinks: [managerLink as any],
      interviews: [{ id: 55, passId: 10, passCandidateId: 101, status: "completed", interviewDate: oldDate, startTime: "10:00", endTime: "10:45", duration: 45, format: "online" } as any],
      interviewSlots: [],
      messagesByPassCandidateId: new Map(),
      documentsByPassCandidateId: new Map(),
      offersByPassCandidateId: new Map(),
      activity: [{
        id: 100,
        passId: 10,
        actorType: "hr",
        actorName: "HR",
        action: "manager_pass_issued",
        targetType: "share_link",
        targetId: 11,
        details: {},
        createdAt: daysFromNow(-1),
      }] as any,
      now,
    });

    assert.equal(item.waitingOn, "manager");
    assert.equal(item.passHandoff, "Pass Handoff: Hiring team -> Hiring Manager");
    assert.notEqual(item.passHandoff, "Pass Handoff: Hiring Manager -> Hiring Manager");
  });

  it("shows candidate Pass handoff and clears stale candidate ownership after action", () => {
    const actionTime = daysFromNow(-1);
    const item = buildPassControlItem({
      pass: { ...pass, updatedAt: oldDate } as any,
      manager: manager as any,
      candidates: [{ ...passCandidate, status: "interview", updatedAt: oldDate } as any],
      candidateLinksByPassCandidateId: new Map([[101, [candidateLink as any]]]),
      managerLinks: [managerLink as any],
      interviews: [{ id: 55, passId: 10, passCandidateId: 101, status: "scheduled", interviewDate: futureDateOnly, startTime: "10:00", endTime: "10:45", duration: 45, format: "online" } as any],
      interviewSlots: [],
      messagesByPassCandidateId: new Map(),
      documentsByPassCandidateId: new Map(),
      offersByPassCandidateId: new Map(),
      activity: [{
        id: 100,
        passId: 10,
        actorType: "candidate",
        actorName: "Candidate",
        action: "candidate_interview_slot_booked",
        targetType: "pass_candidate",
        targetId: 101,
        details: { passCandidateId: 101 },
        createdAt: actionTime,
      }] as any,
      now,
    });

    assert.notEqual(item.waitingOn, "candidate");
    assert.equal(item.candidates[0].passHandoff, "Pass Handoff: Candidate -> Scheduled event");
    assert.equal(item.candidates[0].waitingAgeDays, 1);
  });
});

describe("HR Pass Control lifecycle routes", () => {
  it("revokes a Manager Pass and denies external access after revocation", async () => {
    await withServer({}, async (baseUrl) => {
      const session = await exchangeSession(baseUrl, "stakeholder", managerToken);
      assert.equal(session.response.status, 204);
      assert(session.cookie);
      const revoke = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/manager-links/11/revoke`, { method: "POST" });
      assert.equal(revoke.status, 200);

      const external = await passFetch(baseUrl, "/api/external/stakeholder-pass", session.cookie);
      assert.equal(external.status, 404);
    });
  });

  it("revokes a Candidate Pass and denies external access and mutations afterward", async () => {
    await withServer({}, async (baseUrl) => {
      const session = await exchangeSession(baseUrl, "candidate", candidateToken);
      assert.equal(session.response.status, 204);
      assert(session.cookie);
      const revoke = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/candidate-links/21/revoke`, { method: "POST" });
      assert.equal(revoke.status, 200);

      const external = await passFetch(baseUrl, "/api/external/candidate-pass", session.cookie);
      assert.equal(external.status, 404);

      const mutation = await passFetch(baseUrl, "/api/external/candidate-pass/messages", session.cookie, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Hello" }),
      });
      assert.equal(mutation.status, 404);
    });
  });

  it("extends an expired Manager Pass and restores scoped external access", async () => {
    let currentLink = { ...managerLink, expiresAt: past };
    await withServer({
      getShareLinkByToken: async (token: string) => token === managerToken ? currentLink : undefined,
      getShareLink: async (id: number) => id === currentLink.id ? currentLink : undefined,
      getShareLinksByPass: async () => [currentLink],
      updateShareLink: async (_id: number, data: any) => (currentLink = { ...currentLink, ...data }),
    }, async (baseUrl) => {
      const before = await exchangeSession(baseUrl, "stakeholder", managerToken);
      assert.equal(before.response.status, 410);

      const extended = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/manager-links/11/extend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expiresAt: future.toISOString() }),
      });
      const payload = await json(extended);

      assert.equal(extended.status, 200);
      assert.equal(new Date(payload.expiresAt).toISOString(), future.toISOString());
      const after = await exchangeSession(baseUrl, "stakeholder", managerToken);
      assert.equal(after.response.status, 204);
    });
  });

  it("extends an active Candidate Pass expiry without changing active state", async () => {
    let updatePayload: any = null;
    await withServer({
      updateCandidateLink: async (_id: number, data: any) => {
        updatePayload = data;
        return { ...candidateLink, ...data };
      },
    }, async (baseUrl) => {
      const extended = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/candidate-links/21/extend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expiresAt: future.toISOString() }),
      });
      assert.equal(extended.status, 200);
      assert.deepEqual(Object.keys(updatePayload), ["expiresAt"]);
    });
  });

  it("rejects extending revoked Candidate Pass links without reactivation", async () => {
    let updateCalled = false;
    await withServer({
      getCandidateLinksByPassCandidate: async () => [{ ...candidateLink, isActive: false }],
      updateCandidateLink: async () => {
        updateCalled = true;
      },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/candidate-links/21/extend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expiresAt: future.toISOString() }),
      });

      assert.equal(response.status, 409);
      assert.equal(updateCalled, false);
    });
  });

  it("rejects extending revoked Manager Pass links without reactivation", async () => {
    let updateCalled = false;
    await withServer({
      getShareLinksByPass: async () => [{ ...managerLink, isActive: false }],
      updateShareLink: async () => {
        updateCalled = true;
      },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/manager-links/11/extend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expiresAt: future.toISOString() }),
      });

      assert.equal(response.status, 409);
      assert.equal(updateCalled, false);
    });
  });

  it("prevents cross-pass candidate link mutation through supplied IDs", async () => {
    let updated = false;
    await withServer({
      getPassCandidatesWithDetails: async () => [{ ...passCandidate, id: 101 }],
      getCandidateLinksByPassCandidate: async () => [{ ...candidateLink, id: 21, passCandidateId: 999 }],
      updateCandidateLink: async () => {
        updated = true;
      },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/hr-pass-control/passes/20/candidate-links/21/revoke`, { method: "POST" });
      assert.equal(response.status, 404);
      assert.equal(updated, false);
    });
  });

  it("prevents cross-pass candidate link extension through supplied IDs", async () => {
    let updated = false;
    await withServer({
      getPassCandidatesWithDetails: async () => [{ ...passCandidate, id: 101 }],
      getCandidateLinksByPassCandidate: async () => [{ ...candidateLink, id: 21, passCandidateId: 999 }],
      updateCandidateLink: async () => {
        updated = true;
      },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/hr-pass-control/passes/20/candidate-links/21/extend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expiresAt: future.toISOString() }),
      });
      assert.equal(response.status, 404);
      assert.equal(updated, false);
    });
  });

  it("records nudges against the intended candidate pass action", async () => {
    let logged: any = null;
    await withServer({
      logActivity: async (activity: any) => {
        logged = activity;
        return { id: 99, createdAt: now, ...activity };
      },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/nudge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType: "candidate", targetId: 101, reason: "Follow up" }),
      });

      assert.equal(response.status, 201);
      assert.equal(logged.action, "pass_nudge_recorded");
      assert.equal(logged.targetType, "candidate");
      assert.equal(logged.targetId, 101);
    });
  });

  it("issues a Candidate Pass only for a candidate scoped to the pass", async () => {
    let createdWith: any = null;
    await withServer({
      createCandidateLink: async (data: any) => {
        createdWith = data;
        return { id: 33, ...data };
      },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/candidates/101/candidate-link`, { method: "POST" });
      assert.equal(response.status, 201);
      assert.equal(createdWith.passCandidateId, 101);
      assert.equal(createdWith.isActive, true);
    });
  });

  it("emails the issued Candidate Pass from the Pass Control route with an absolute public URL", async () => {
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
        createCandidateLink: async (data: any) => ({ ...data, id: 33, token: candidateToken }),
        enqueueEmail: async (email: any) => {
          emails.push(email);
          return { created: true, email: { id: emails.length, ...email } };
        },
      }, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/candidates/101/candidate-link`, { method: "POST" });
        assert.equal(response.status, 201);
        const link = await json(response);
        assert.equal(link.id, 33);
        assert.equal(emails.length, 1);
        assert.equal(emails[0].eventKey, "candidate-pass-issued:33");
        assert.equal(emails[0].recipientEmail, "candidate@example.com");
        assert.match(emails[0].bodyText, new RegExp(`https://careers\\.example\\.test/candidate-pass#${candidateToken}`));
      });
    } finally {
      if (previous.emailEnabled === undefined) delete process.env.HIREPASS_EMAIL_ENABLED; else process.env.HIREPASS_EMAIL_ENABLED = previous.emailEnabled;
      if (previous.publicBase === undefined) delete process.env.HIREPASS_PUBLIC_BASE_URL; else process.env.HIREPASS_PUBLIC_BASE_URL = previous.publicBase;
      if (previous.smtpHost === undefined) delete process.env.HIREPASS_SMTP_HOST; else process.env.HIREPASS_SMTP_HOST = previous.smtpHost;
      if (previous.emailFrom === undefined) delete process.env.HIREPASS_EMAIL_FROM; else process.env.HIREPASS_EMAIL_FROM = previous.emailFrom;
    }
  });

  it("keeps Candidate Pass Control issuance successful if email enqueue fails", async () => {
    const previous = {
      emailEnabled: process.env.HIREPASS_EMAIL_ENABLED,
      publicBase: process.env.HIREPASS_PUBLIC_BASE_URL,
      smtpHost: process.env.HIREPASS_SMTP_HOST,
      emailFrom: process.env.HIREPASS_EMAIL_FROM,
    };
    try {
      process.env.HIREPASS_EMAIL_ENABLED = "true";
      process.env.HIREPASS_PUBLIC_BASE_URL = "https://careers.example.test";
      process.env.HIREPASS_SMTP_HOST = "smtp.example.test";
      process.env.HIREPASS_EMAIL_FROM = "HirePass <noreply@example.test>";
      await withServer({
        createCandidateLink: async (data: any) => ({ ...data, id: 34, token: candidateToken }),
        enqueueEmail: async () => { throw new Error("simulated enqueue failure"); },
      }, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/candidates/101/candidate-link`, { method: "POST" });
        assert.equal(response.status, 201);
        assert.equal((await json(response)).id, 34);
      });
    } finally {
      if (previous.emailEnabled === undefined) delete process.env.HIREPASS_EMAIL_ENABLED; else process.env.HIREPASS_EMAIL_ENABLED = previous.emailEnabled;
      if (previous.publicBase === undefined) delete process.env.HIREPASS_PUBLIC_BASE_URL; else process.env.HIREPASS_PUBLIC_BASE_URL = previous.publicBase;
      if (previous.smtpHost === undefined) delete process.env.HIREPASS_SMTP_HOST; else process.env.HIREPASS_SMTP_HOST = previous.smtpHost;
      if (previous.emailFrom === undefined) delete process.env.HIREPASS_EMAIL_FROM; else process.env.HIREPASS_EMAIL_FROM = previous.emailFrom;
    }
  });

  it("issues distinct cryptographic-looking Candidate Pass tokens", async () => {
    const issuedTokens: string[] = [];
    await withServer({
      createCandidateLink: async (data: any) => {
        issuedTokens.push(data.token);
        return { id: issuedTokens.length + 30, ...data };
      },
    }, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/candidates/101/candidate-link`, { method: "POST" });
      const second = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/candidates/101/candidate-link`, { method: "POST" });

      assert.equal(first.status, 201);
      assert.equal(second.status, 201);
      assert.equal(issuedTokens.length, 2);
      assert.notEqual(issuedTokens[0], issuedTokens[1]);
      assert.match(issuedTokens[0], /^cand_[A-Za-z0-9_-]{40,}$/);
      assert.equal(issuedTokens[0].includes(String(Date.now()).slice(0, 8)), false);
    });
  });

  it("rejects issuing a Manager Pass to a manager not assigned to the Pass", async () => {
    let created = false;
    await withServer({
      createShareLink: async () => {
        created = true;
      },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/manager-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ managerId: 999 }),
      });

      assert.equal(response.status, 404);
      assert.equal(created, false);
    });
  });

  it("lets the admin issue scoped Stakeholder Passes to the primary or another active stakeholder", async () => {
    const second = { ...manager, id: 302, name: "Second Stakeholder", email: "second@example.test" };
    const issued: number[] = [];
    await withServer({
      getManager: async (id: number) => id === 301 ? manager : id === 302 ? second : undefined,
      createShareLink: async (data: any) => { issued.push(data.managerId); return { ...managerLink, id: 20 + issued.length, token: issued.length === 1 ? managerToken : nextManagerToken, ...data }; },
    }, async (baseUrl) => {
      const primary = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/manager-link`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const additional = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/manager-link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ managerId: 302 }) });
      assert.equal(primary.status, 201);
      assert.equal(additional.status, 201);
      assert.deepEqual(issued, [301, 302]);
    });
  });

  it("emails the issued Stakeholder Pass from the Pass Control route with an absolute public URL", async () => {
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
        createShareLink: async (data: any) => ({ ...managerLink, id: 44, token: managerToken, ...data }),
        enqueueEmail: async (email: any) => {
          emails.push(email);
          return { created: true, email: { id: emails.length, ...email } };
        },
      }, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/manager-link`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        assert.equal(response.status, 201);
        const link = await json(response);
        assert.equal(link.id, 44);
        assert.equal(emails.length, 1);
        assert.equal(emails[0].eventKey, "stakeholder-pass-issued:44");
        assert.equal(emails[0].recipientEmail, "manager@example.com");
        assert.match(emails[0].bodyText, new RegExp(`https://careers\\.example\\.test/manager-pass#${managerToken}`));
      });
    } finally {
      if (previous.emailEnabled === undefined) delete process.env.HIREPASS_EMAIL_ENABLED; else process.env.HIREPASS_EMAIL_ENABLED = previous.emailEnabled;
      if (previous.publicBase === undefined) delete process.env.HIREPASS_PUBLIC_BASE_URL; else process.env.HIREPASS_PUBLIC_BASE_URL = previous.publicBase;
      if (previous.smtpHost === undefined) delete process.env.HIREPASS_SMTP_HOST; else process.env.HIREPASS_SMTP_HOST = previous.smtpHost;
      if (previous.emailFrom === undefined) delete process.env.HIREPASS_EMAIL_FROM; else process.env.HIREPASS_EMAIL_FROM = previous.emailFrom;
    }
  });

  it("keeps Stakeholder Pass Control issuance successful if email enqueue fails", async () => {
    const previous = {
      emailEnabled: process.env.HIREPASS_EMAIL_ENABLED,
      publicBase: process.env.HIREPASS_PUBLIC_BASE_URL,
      smtpHost: process.env.HIREPASS_SMTP_HOST,
      emailFrom: process.env.HIREPASS_EMAIL_FROM,
    };
    try {
      process.env.HIREPASS_EMAIL_ENABLED = "true";
      process.env.HIREPASS_PUBLIC_BASE_URL = "https://careers.example.test";
      process.env.HIREPASS_SMTP_HOST = "smtp.example.test";
      process.env.HIREPASS_EMAIL_FROM = "HirePass <noreply@example.test>";
      await withServer({
        createShareLink: async (data: any) => ({ ...managerLink, id: 45, token: managerToken, ...data }),
        enqueueEmail: async () => { throw new Error("simulated enqueue failure"); },
      }, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/manager-link`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        assert.equal(response.status, 201);
        assert.equal((await json(response)).id, 45);
      });
    } finally {
      if (previous.emailEnabled === undefined) delete process.env.HIREPASS_EMAIL_ENABLED; else process.env.HIREPASS_EMAIL_ENABLED = previous.emailEnabled;
      if (previous.publicBase === undefined) delete process.env.HIREPASS_PUBLIC_BASE_URL; else process.env.HIREPASS_PUBLIC_BASE_URL = previous.publicBase;
      if (previous.smtpHost === undefined) delete process.env.HIREPASS_SMTP_HOST; else process.env.HIREPASS_SMTP_HOST = previous.smtpHost;
      if (previous.emailFrom === undefined) delete process.env.HIREPASS_EMAIL_FROM; else process.env.HIREPASS_EMAIL_FROM = previous.emailFrom;
    }
  });

  it("rejects an actionable Stakeholder Pass without a stakeholder binding", async () => {
    let created = false;
    await withServer({
      getPass: async () => ({ ...pass, hiringManagerId: null }),
      createShareLink: async () => { created = true; },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/manager-link`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      assert.equal(response.status, 400);
      assert.equal(created, false);
    });
  });

  it("removes a completed candidate assessment from HR outstanding actions", async () => {
    let mutablePassCandidate: any = { ...passCandidate, status: "shortlisted", softSkillsCompletedAt: null };
    const passWithAssessment = { ...pass, softSkillsAssessmentUrl: "https://assessment.example/soft" };
    await withServer({
      getPass: async () => passWithAssessment,
      getPassWithDetails: async () => passWithAssessment,
      getPassCandidateById: async () => mutablePassCandidate,
      getPassCandidatesWithDetails: async () => [mutablePassCandidate],
      getInterviewSlotsByPass: async () => [],
      getAvailableInterviewSlots: async () => [],
      updatePassCandidate: async (_id: number, data: any) => {
        mutablePassCandidate = { ...mutablePassCandidate, ...data };
        return mutablePassCandidate;
      },
    }, async (baseUrl) => {
      const before = await json(await fetch(`${baseUrl}/api/hr-pass-control`));
      assert.equal(before.items[0].candidateActions, 1);

      const session = await exchangeSession(baseUrl, "candidate", candidateToken);
      assert(session.cookie);
      const complete = await passFetch(baseUrl, "/api/external/candidate-pass/assessment-complete", session.cookie, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assessmentType: "softSkills" }),
      });
      assert.equal(complete.status, 200);

      const after = await json(await fetch(`${baseUrl}/api/hr-pass-control`));
      assert.equal(after.items[0].candidateActions, 0);
      assert.notEqual(after.items[0].waitingOn, "candidate");
      assert.equal(after.items[0].recentActivity[0].action, "candidate_assessment_completed");
    });
  });

  it("moves manager final decision into HR-owned offer follow-up with activity evidence", async () => {
    let mutablePassCandidate: any = { ...passCandidate, status: "interview", interviewRecommendation: "proceed" };
    await withServer({
      getPassCandidateById: async () => mutablePassCandidate,
      getPassCandidatesWithDetails: async () => [mutablePassCandidate],
      updatePassCandidate: async (_id: number, data: any) => {
        mutablePassCandidate = { ...mutablePassCandidate, ...data };
        return mutablePassCandidate;
      },
    }, async (baseUrl) => {
      const session = await exchangeSession(baseUrl, "stakeholder", managerToken);
      assert(session.cookie);
      const beforeManager = await json(await passFetch(baseUrl, "/api/external/stakeholder-pass", session.cookie));
      assert.equal(beforeManager.managerPassState.actionState, "ACTION_REQUIRED");
      assert.equal(beforeManager.managerPassState.nextDecision.kind, "MAKE_FINAL_DECISION");

      const decision = await passFetch(baseUrl, "/api/external/stakeholder-pass/final-decisions", session.cookie, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decisions: [{ passCandidateId: 101, decision: "hire", notes: "Proceed" }] }),
      });
      assert.equal(decision.status, 200);

      const afterManager = await json(await passFetch(baseUrl, "/api/external/stakeholder-pass", session.cookie));
      assert.equal(afterManager.managerPassState.actionState, "COMPLETED");

      const hr = await json(await fetch(`${baseUrl}/api/hr-pass-control`));
      assert.equal(hr.items[0].waitingOn, "hr");
      assert.equal(hr.items[0].managerActions, 0);
      assert.equal(hr.items[0].recentActivity[0].action, "manager_final_decision_submitted");
    });
  });

  it("keeps post-interview Candidate, Manager, and HR Pass ownership aligned", () => {
    const completedInterview = {
      id: 601,
      passId: 10,
      passCandidateId: 101,
      status: "completed",
      interviewDate: oldDate.toISOString(),
      startTime: "10:00",
      endTime: "10:45",
      format: "online",
      createdAt: oldDate,
      updatedAt: oldDate,
    };
    const waitingCandidate = { ...passCandidate, status: "interview", interviewRecommendation: null };
    const managerState = resolveManagerPassState({
      link: managerLink,
      pass,
      candidates: [waitingCandidate],
      interviews: [completedInterview],
      now,
    });
    const candidateState = resolveCandidatePassState({
      link: candidateLink,
      passCandidate: waitingCandidate,
      pass,
      interviews: [completedInterview],
      interviewSlots: [],
      managerPassState: managerState,
      now,
    });
    const hrState = buildPassControlItem({
      pass,
      manager,
      candidates: [waitingCandidate],
      candidateLinksByPassCandidateId: new Map([[101, [candidateLink]]]),
      managerLinks: [managerLink],
      interviews: [completedInterview],
      interviewSlots: [],
      messagesByPassCandidateId: new Map(),
      documentsByPassCandidateId: new Map(),
      offersByPassCandidateId: new Map(),
      activity: [],
      now,
    });

    assert.equal(managerState.actionState, "ACTION_REQUIRED");
    assert.equal(managerState.nextDecision.kind, "SUBMIT_EVALUATION");
    assert.equal(candidateState.actionState, "WAITING");
    assert.equal(candidateState.waitingOn, "Hiring Manager");
    assert.equal(candidateState.nextAction.kind, "NONE");
    assert.equal(hrState.waitingOn, "manager");
    assert.equal(hrState.managerActions, 1);
  });

  it("lets a scoped Candidate Pass satisfy a pending document request", async () => {
    let mutableDocuments: any[] = [{
      id: 701,
      passCandidateId: 101,
      docType: "passport",
      label: "Passport copy",
      isRequired: true,
      status: "pending",
      createdAt: oldDate,
      updatedAt: oldDate,
    }];
    await withServer({
      getInterviewSlotsByPass: async () => [],
      getAvailableInterviewSlots: async () => [],
      getCandidateDocuments: async (passCandidateId: number) => passCandidateId === 101 ? mutableDocuments : [],
      updateCandidateDocument: async (id: number, data: any) => {
        const document = mutableDocuments.find((item) => item.id === id);
        if (!document) return undefined;
        Object.assign(document, data);
        return document;
      },
    }, async (baseUrl) => {
      const before = await json(await fetch(`${baseUrl}/api/hr-pass-control`));
      assert.equal(before.items[0].candidateActions, 1);
      assert.equal(before.items[0].candidates[0].nextAction, "Upload document");

      const session = await exchangeSession(baseUrl, "candidate", candidateToken);
      assert(session.cookie);
      const upload = await passFetch(baseUrl, "/api/external/candidate-pass/documents", session.cookie, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId: 701,
          fileName: "passport.pdf",
          mimeType: "application/pdf",
          fileDataBase64: Buffer.from("%PDF-1.4\nfictional test document\n%%EOF").toString("base64"),
        }),
      });
      assert.equal(upload.status, 201);
      assert.equal(mutableDocuments[0].status, "uploaded");

      const afterCandidate = await json(await passFetch(baseUrl, "/api/external/candidate-pass", session.cookie));
      assert.equal(afterCandidate.passState.nextAction.kind, "NONE");
      const afterHr = await json(await fetch(`${baseUrl}/api/hr-pass-control`));
      assert.equal(afterHr.items[0].candidateActions, 0);
      assert.equal(afterHr.items[0].recentActivity[0].action, "candidate_document_submitted");
    });
  });

  it("rejects cross-pass document completion attempts", async () => {
    await withServer({
      getCandidateDocuments: async () => [{
        id: 702,
        passCandidateId: 999,
        docType: "passport",
        label: "Other candidate passport",
        status: "pending",
      }],
    }, async (baseUrl) => {
      const session = await exchangeSession(baseUrl, "candidate", candidateToken);
      assert(session.cookie);
      const response = await passFetch(baseUrl, "/api/external/candidate-pass/documents", session.cookie, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId: 999,
          fileName: "passport.pdf",
          mimeType: "application/pdf",
          fileDataBase64: Buffer.from("%PDF-1.4\nfictional test document").toString("base64"),
        }),
      });
      assert.equal(response.status, 404);
    });
  });

  it("closes accepted offers into handoff without creating a new hiring action", async () => {
    let mutablePassCandidate: any = { ...passCandidate, status: "offer" };
    let mutableOffer: any = {
      id: 801,
      passId: 10,
      passCandidateId: 101,
      salary: 12000,
      salaryCurrency: "AED",
      status: "pending",
      createdAt: oldDate,
      updatedAt: oldDate,
    };
    await withServer({
      getPassCandidateById: async () => mutablePassCandidate,
      getPassCandidatesWithDetails: async () => [mutablePassCandidate],
      getOfferByPassCandidate: async () => mutableOffer,
      respondToCandidateOffer: async (_offer: any, response: string) => {
        mutablePassCandidate = { ...mutablePassCandidate, status: response === "accept" ? "hired" : mutablePassCandidate.status };
        mutableOffer = { ...mutableOffer, status: response === "accept" ? "accepted" : mutableOffer.status };
        await storage.logActivity({ passId: 10, actorType: "candidate", actorName: "Candidate", action: "candidate_offer_accepted_handoff", targetType: "offer", targetId: 801, details: { passCandidateId: 101, response } });
        return mutableOffer;
      },
    }, async (baseUrl) => {
      const session = await exchangeSession(baseUrl, "candidate", candidateToken);
      assert(session.cookie);
      const response = await passFetch(baseUrl, "/api/external/candidate-pass/offer-response", session.cookie, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: "accept" }),
      });
      assert.equal(response.status, 200);

      const candidatePayload = await json(await passFetch(baseUrl, "/api/external/candidate-pass", session.cookie));
      assert.equal(candidatePayload.passState.actionState, "COMPLETED");
      assert.equal(candidatePayload.passState.hiringStage, "Decision");

      const hr = await json(await fetch(`${baseUrl}/api/hr-pass-control`));
      assert.equal(hr.items[0].waitingOn, "completed");
      assert.equal(hr.items[0].recentActivity[0].action, "candidate_offer_accepted_handoff");
    });
  });

  it("blocks stale nudges after a candidate action is already completed", async () => {
    await withServer({
      getInterviewSlotsByPass: async () => [],
      getAvailableInterviewSlots: async () => [],
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/nudge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType: "candidate", targetId: 101, reason: "Already done" }),
      });
      assert.equal(response.status, 409);
    });
  });
});
