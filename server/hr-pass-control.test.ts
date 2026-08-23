import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, before, describe, it } from "node:test";
import express from "express";
import { buildPassControlItem } from "./hr-pass-control";

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
  token: "manager-token",
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
  token: "candidate-token",
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
    createShareLink: async (data: any) => {
      mutableManagerLink = { ...managerLink, id: 12, token: "new-manager-token", ...data };
      return mutableManagerLink;
    },
    updateShareLink: async (id: number, data: any) => {
      if (id === mutableManagerLink.id) mutableManagerLink = { ...mutableManagerLink, ...data };
      return mutableManagerLink;
    },
    getCandidateLinksByPassCandidate: async (passCandidateId: number) => (passCandidateId === 101 ? [mutableCandidateLink] : []),
    getCandidateLinkByToken: async (token: string) => (token === mutableCandidateLink.token ? mutableCandidateLink : undefined),
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
    getCandidateDocuments: async () => [],
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
});

describe("HR Pass Control lifecycle routes", () => {
  it("revokes a Manager Pass and denies external access after revocation", async () => {
    await withServer({}, async (baseUrl) => {
      const revoke = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/manager-links/11/revoke`, { method: "POST" });
      assert.equal(revoke.status, 200);

      const external = await fetch(`${baseUrl}/api/manager-pass/manager-token`);
      assert.equal(external.status, 404);
    });
  });

  it("revokes a Candidate Pass and denies external access and mutations afterward", async () => {
    await withServer({}, async (baseUrl) => {
      const revoke = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/candidate-links/21/revoke`, { method: "POST" });
      assert.equal(revoke.status, 200);

      const external = await fetch(`${baseUrl}/api/candidate-pass/candidate-token`);
      assert.equal(external.status, 404);

      const mutation = await fetch(`${baseUrl}/api/candidate-pass/candidate-token/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Hello" }),
      });
      assert.equal(mutation.status, 404);
    });
  });

  it("extends an expired Manager Pass and restores scoped external access", async () => {
    await withServer({
      getShareLinkByToken: async (token: string) => token === "manager-token" ? { ...managerLink, expiresAt: past } : undefined,
      getShareLinksByPass: async () => [{ ...managerLink, expiresAt: past }],
      updateShareLink: async (_id: number, data: any) => ({ ...managerLink, ...data }),
    }, async (baseUrl) => {
      const before = await fetch(`${baseUrl}/api/manager-pass/manager-token`);
      assert.equal(before.status, 410);

      const extended = await fetch(`${baseUrl}/api/hr-pass-control/passes/10/manager-links/11/extend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expiresAt: future.toISOString() }),
      });
      const payload = await json(extended);

      assert.equal(extended.status, 200);
      assert.equal(new Date(payload.expiresAt).toISOString(), future.toISOString());
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
});
