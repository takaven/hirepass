import { externalPassApiBase, isExternalPassToken, type ExternalPassKind } from "@shared/external-pass-links";

export type ExternalPassBootstrapResult = { ok: true } | { ok: false; status?: number; message: string };

export async function bootstrapExternalPassSession(kind: ExternalPassKind): Promise<ExternalPassBootstrapResult> {
  const fragment = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!fragment) return { ok: true };

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

  const response = await fetch(`${externalPassApiBase(kind)}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token }),
  });
  token = "";
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: response.status, message: payload.error || "Unable to open this Pass" };
  }
  return { ok: true };
}
