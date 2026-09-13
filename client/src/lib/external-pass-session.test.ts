import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import {
  bootstrapExternalPassSession,
  installExternalPassFragmentReload,
} from "./external-pass-session";

const candidateA = `cand_${"A".repeat(43)}`;
const candidateB = `cand_${"B".repeat(43)}`;
const stakeholderA = "11111111-1111-4111-8111-111111111111";
const stakeholderB = "22222222-2222-4222-8222-222222222222";

type Listener = EventListener | null;

function testBrowser(pathname: string, hash: string, existingStorage: Map<string, string> = new Map()) {
  let hashListener: Listener = null;
  const location = { hash, pathname, search: "" };
  const browser = {
    location,
    history: {
      replaceState: (_state: unknown, _title: string, path: string) => {
        assert.equal(path, location.pathname);
        location.hash = "";
      },
    },
    sessionStorage: {
      getItem: (key: string) => existingStorage.get(key) ?? null,
      setItem: (key: string, value: string) => { existingStorage.set(key, value); },
    },
    addEventListener: (_type: "hashchange", listener: EventListener) => { hashListener = listener; },
    removeEventListener: (_type: "hashchange", listener: EventListener) => {
      if (hashListener === listener) hashListener = null;
    },
    dispatchHashChange: () => hashListener?.(new Event("hashchange")),
  };
  return browser;
}

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
const originalCrypto = globalThis.crypto;

afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch });
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
});

async function runSameTabCase(kind: "candidate" | "stakeholder", tokenA: string, tokenB: string) {
  const pathname = kind === "candidate" ? "/candidate-pass" : "/manager-pass";
  const storage = new Map<string, string>();
  const requests: Array<{ token: string; contextId: string; header: string | null }> = [];
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      requests.push({ token: body.token, contextId: body.contextId, header: new Headers(init.headers).get("X-HirePass-Context") });
      return new Response(null, { status: 204 });
    },
  });

  const firstBrowser = testBrowser(pathname, `#${tokenA}`, storage);
  Object.defineProperty(globalThis, "window", { configurable: true, value: firstBrowser });
  let reloads = 0;
  const removeListener = installExternalPassFragmentReload(kind, firstBrowser, () => { reloads += 1; });
  assert.equal(reloads, 0, "installing on the initial fragment must not reload");
  assert.deepEqual(await bootstrapExternalPassSession(kind), { ok: true });
  assert.equal(firstBrowser.location.hash, "");
  const contextA = requests[0].contextId;

  firstBrowser.location.hash = `#${tokenB}`;
  firstBrowser.dispatchHashChange();
  assert.equal(reloads, 1, "a later valid Pass fragment must trigger one controlled reload");
  removeListener();

  const reloadedBrowser = testBrowser(pathname, `#${tokenB}`, storage);
  Object.defineProperty(globalThis, "window", { configurable: true, value: reloadedBrowser });
  assert.deepEqual(await bootstrapExternalPassSession(kind), { ok: true });
  const contextB = requests[1].contextId;
  assert.notEqual(contextB, contextA);
  assert.equal(requests[1].token, tokenB);
  assert.equal(requests[1].header, contextB);
  assert.equal(reloadedBrowser.location.hash, "");

  const normalReload = testBrowser(pathname, "", storage);
  Object.defineProperty(globalThis, "window", { configurable: true, value: normalReload });
  assert.deepEqual(await bootstrapExternalPassSession(kind), { ok: true });
  assert.equal(requests.length, 2, "a normal reload must reuse the stored context without another exchange");

  let emptyHashReloads = 0;
  const removeEmptyListener = installExternalPassFragmentReload(kind, normalReload, () => { emptyHashReloads += 1; });
  normalReload.dispatchHashChange();
  assert.equal(emptyHashReloads, 0);
  removeEmptyListener();
}

describe("external Pass same-tab fragment navigation", () => {
  it("reloads and re-bootstraps Candidate A to Candidate B without a stale context", async () => {
    await runSameTabCase("candidate", candidateA, candidateB);
  });

  it("reloads and re-bootstraps Stakeholder A to Stakeholder B without a stale context", async () => {
    await runSameTabCase("stakeholder", stakeholderA, stakeholderB);
  });
});
