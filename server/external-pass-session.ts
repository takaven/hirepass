import { createHmac, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";
import type { CandidateLink, ShareLink } from "@shared/schema";
import {
  EXTERNAL_PASS_CONTEXT_HEADER,
  isExternalPassContextId,
  type ExternalPassKind,
} from "@shared/external-pass-links";
import { resolvePassAccess } from "./pass-access";
import { storage } from "./storage";

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const SESSION_VERSION = 1;

type ExternalSessionPayload = {
  v: typeof SESSION_VERSION;
  kind: ExternalPassKind;
  contextId: string;
  linkId: number;
  expiresAt: number;
};

type ExternalSessionLocals = {
  candidateLink?: CandidateLink;
  stakeholderLink?: ShareLink;
};

function sessionSecret() {
  const secret = process.env.HIREPASS_SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : "development-only-hirepass-session-secret");
  if (secret.length < 32) throw new Error("External Pass sessions require HIREPASS_SESSION_SECRET (min 32 chars)");
  return secret;
}

function signature(value: string) {
  return createHmac("sha256", sessionSecret()).update(`hirepass-external-session:v1:${value}`).digest("base64url");
}

function encodeSession(payload: ExternalSessionPayload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${signature(body)}`;
}

function decodeSession(value: string | undefined, kind: ExternalPassKind, contextId: string): ExternalSessionPayload | null {
  if (!value) return null;
  const [body, providedSignature, extra] = value.split(".");
  if (!body || !providedSignature || extra) return null;
  const expected = Buffer.from(signature(body));
  const provided = Buffer.from(providedSignature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ExternalSessionPayload;
    if (
      payload.v !== SESSION_VERSION ||
      payload.kind !== kind ||
      payload.contextId !== contextId ||
      !Number.isInteger(payload.linkId) ||
      payload.linkId < 1 ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

function cookieName(kind: ExternalPassKind, contextId: string) {
  const base = kind === "candidate" ? "hirepass-candidate-pass" : "hirepass-stakeholder-pass";
  const name = `${base}-${contextId}`;
  return process.env.NODE_ENV === "production" ? `__Secure-${name}` : name;
}

function cookiePath(kind: ExternalPassKind) {
  return kind === "candidate" ? "/api/external/candidate-pass" : "/api/external/stakeholder-pass";
}

function readCookie(req: Request, name: string) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    const key = pair.slice(0, index).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(pair.slice(index + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function sessionExpiry(linkExpiry: Date | string | null | undefined) {
  const upperBound = Date.now() + SESSION_MAX_AGE_MS;
  if (!linkExpiry) return upperBound;
  const value = new Date(linkExpiry).getTime();
  return Number.isFinite(value) ? Math.min(value, upperBound) : upperBound;
}

export function externalPassContextId(req: Request): string | null {
  const value = req.get(EXTERNAL_PASS_CONTEXT_HEADER);
  return isExternalPassContextId(value) ? value : null;
}

export function setExternalPassSession(
  res: Response,
  kind: ExternalPassKind,
  contextId: string,
  link: CandidateLink | ShareLink,
) {
  const expiresAt = sessionExpiry(link.expiresAt);
  const maxAge = Math.max(0, expiresAt - Date.now());
  res.cookie(cookieName(kind, contextId), encodeSession({ v: SESSION_VERSION, kind, contextId, linkId: link.id, expiresAt }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: cookiePath(kind),
    maxAge,
  });
}

export function clearExternalPassSession(res: Response, kind: ExternalPassKind, contextId: string) {
  res.clearCookie(cookieName(kind, contextId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: cookiePath(kind),
  });
}

export function requireSameOrigin(req: Request, res: Response, next: NextFunction) {
  const configuredOrigin = (() => {
    try {
      return process.env.HIREPASS_PUBLIC_BASE_URL ? new URL(process.env.HIREPASS_PUBLIC_BASE_URL).origin : null;
    } catch {
      return null;
    }
  })();
  const requestOrigin = configuredOrigin || `${req.protocol}://${req.get("host")}`;
  const origin = req.get("origin");
  const referer = req.get("referer");
  let sourceOrigin: string | null = null;
  try {
    sourceOrigin = origin ? new URL(origin).origin : referer ? new URL(referer).origin : null;
  } catch {
    sourceOrigin = null;
  }
  if (sourceOrigin !== requestOrigin) {
    return res.status(403).json({ error: "Cross-site external Pass request rejected" });
  }
  next();
}

async function resolveSessionLink(req: Request, kind: ExternalPassKind) {
  const contextId = externalPassContextId(req);
  if (!contextId) return null;
  const payload = decodeSession(readCookie(req, cookieName(kind, contextId)), kind, contextId);
  if (!payload) return null;
  return kind === "candidate"
    ? storage.getCandidateLink(payload.linkId)
    : storage.getShareLink(payload.linkId);
}

export function requireExternalCandidateSession() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const contextId = externalPassContextId(req);
    const candidateLink = await resolveSessionLink(req, "candidate") as CandidateLink | undefined;
    const access = resolvePassAccess(candidateLink, { inactive: "Invalid or inactive link", expired: "Link has expired" });
    if (!access.allowed) {
      if (contextId) clearExternalPassSession(res, "candidate", contextId);
      return res.status(access.status).json({ error: access.error });
    }
    (res.locals as ExternalSessionLocals).candidateLink = access.link;
    next();
  };
}

export function requireExternalStakeholderSession() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const contextId = externalPassContextId(req);
    const stakeholderLink = await resolveSessionLink(req, "stakeholder") as ShareLink | undefined;
    const access = resolvePassAccess(stakeholderLink, { inactive: "Invalid share link", expired: "Share link has expired" });
    if (!access.allowed) {
      if (contextId) clearExternalPassSession(res, "stakeholder", contextId);
      return res.status(access.status).json({ error: access.error });
    }
    (res.locals as ExternalSessionLocals).stakeholderLink = access.link;
    next();
  };
}

export function candidateSessionLink(res: Response): CandidateLink {
  return (res.locals as ExternalSessionLocals).candidateLink!;
}

export function stakeholderSessionLink(res: Response): ShareLink {
  return (res.locals as ExternalSessionLocals).stakeholderLink!;
}
