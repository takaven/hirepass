import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePassAccess } from "./pass-access";

const managerMessages = {
  inactive: "Invalid or inactive share link",
  expired: "Share link has expired",
};

const candidateMessages = {
  inactive: "Invalid or inactive link",
  expired: "Link has expired",
};

const now = new Date("2026-08-22T12:00:00.000Z");

describe("Candidate Pass token access", () => {
  it("resolves an active token", () => {
    const result = resolvePassAccess({ isActive: true, expiresAt: "2026-08-23T12:00:00.000Z" }, candidateMessages, now);
    assert.equal(result.allowed, true);
  });

  it("rejects an inactive token", () => {
    assert.deepEqual(
      resolvePassAccess({ isActive: false, expiresAt: "2026-08-23T12:00:00.000Z" }, candidateMessages, now),
      { allowed: false, status: 404, error: "Invalid or inactive link" },
    );
  });

  it("rejects an expired token", () => {
    assert.deepEqual(
      resolvePassAccess({ isActive: true, expiresAt: "2026-08-21T12:00:00.000Z" }, candidateMessages, now),
      { allowed: false, status: 410, error: "Link has expired" },
    );
  });
});

describe("Manager Pass token access", () => {
  it("resolves an active token", () => {
    const result = resolvePassAccess({ isActive: true, expiresAt: "2026-08-23T12:00:00.000Z" }, managerMessages, now);
    assert.equal(result.allowed, true);
  });

  it("rejects an inactive token", () => {
    assert.deepEqual(
      resolvePassAccess({ isActive: false, expiresAt: "2026-08-23T12:00:00.000Z" }, managerMessages, now),
      { allowed: false, status: 404, error: "Invalid or inactive share link" },
    );
  });

  it("rejects an expired token", () => {
    assert.deepEqual(
      resolvePassAccess({ isActive: true, expiresAt: "2026-08-21T12:00:00.000Z" }, managerMessages, now),
      { allowed: false, status: 410, error: "Share link has expired" },
    );
  });
});
