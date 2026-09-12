import {
  EXTERNAL_PASS_CONTEXT_HEADER,
  externalPassApiBase,
  isExternalPassContextId,
  isExternalPassToken,
  type ExternalPassKind,
} from "@shared/external-pass-links";

export type ExternalPassBootstrapResult = { ok: true } | { ok: false; status?: number; message: string };

function contextStorageKey(kind: ExternalPassKind) {
  return `hirepass-${kind}-pass-context`;
}

function newContextId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const value = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function storedContextId(kind: ExternalPassKind) {
  const value = window.sessionStorage.getItem(contextStorageKey(kind));
  return isExternalPassContextId(value) ? value : null;
}

export async function externalPassFetch(
  kind: ExternalPassKind,
  path = "",
  init: RequestInit = {},
) {
  const contextId = storedContextId(kind);
  if (!contextId) throw new Error("This Pass session is not available");
  const headers = new Headers(init.headers);
  headers.set(EXTERNAL_PASS_CONTEXT_HEADER, contextId);
  return fetch(`${externalPassApiBase(kind)}${path}`, { ...init, headers, credentials: "include" });
}

export async function externalPassRequest(
  kind: ExternalPassKind,
  method: string,
  path: string,
  data?: unknown,
) {
  const headers = data === undefined ? undefined : { "Content-Type": "application/json" };
  const response = await externalPassFetch(kind, path, {
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!response.ok) {
    const text = (await response.text()) || response.statusText;
    throw new Error(`${response.status}: ${text}`);
  }
  return response;
}

export async function bootstrapExternalPassSession(kind: ExternalPassKind): Promise<ExternalPassBootstrapResult> {
  const fragment = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!fragment) {
    return storedContextId(kind)
      ? { ok: true }
      : { ok: false, status: 401, message: "This Pass link is not valid" };
  }

  let token = "";
  try {
    token = decodeURIComponent(fragment);
  } catch {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    return { ok: false, status: 404, message: "This Pass link is not valid" };
  }

  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  if (!isExternalPassToken(kind, token)) {
    return { ok: false, status: 404, message: "This Pass link is not valid" };
  }

  const contextId = newContextId();
  window.sessionStorage.setItem(contextStorageKey(kind), contextId);

  const response = await fetch(`${externalPassApiBase(kind)}/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [EXTERNAL_PASS_CONTEXT_HEADER]: contextId,
    },
    credentials: "include",
    body: JSON.stringify({ token, contextId }),
  });
  token = "";
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: response.status, message: payload.error || "Unable to open this Pass" };
  }
  return { ok: true };
}
