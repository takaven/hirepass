import type { Express, NextFunction, Request, Response } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import { pool } from "./db";

declare module "express-session" {
  interface SessionData {
    hirepassAdmin?: {
      username: string;
      role: "owner_admin";
    };
  }
}

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const MIN_SECRET_LENGTH = 32;
const INTENDED_PUBLIC_API_PREFIXES = [
  "/api/auth/",
  "/api/public/",
  "/api/candidate-pass/",
  "/api/manager-pass/",
];
const PRODUCTION_DISABLED_LEGACY_PREFIXES = [
  "/api/ai/",
  "/api/onboarding-portal/",
];

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function createPasswordHash(password: string, salt = randomBytes(16).toString("hex")) {
  const iterations = 210_000;
  const digest = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2:${iterations}:${salt}:${digest}`;
}

function verifyPassword(password: string, configuredHash: string) {
  const [scheme, iterationsText, salt, expectedHex] = configuredHash.split(":");
  if (scheme !== "pbkdf2" || !iterationsText || !salt || !expectedHex) return false;
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 100_000) return false;
  const actual = Buffer.from(pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex"), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isInternalAuthEnabled() {
  return isProduction() || Boolean(process.env.HIREPASS_ADMIN_USERNAME);
}

export function validateAuthConfig() {
  if (!isInternalAuthEnabled()) return;
  const missing: string[] = [];
  if (!process.env.HIREPASS_ADMIN_USERNAME) missing.push("HIREPASS_ADMIN_USERNAME");
  if (!process.env.HIREPASS_SESSION_SECRET || process.env.HIREPASS_SESSION_SECRET.length < MIN_SECRET_LENGTH) {
    missing.push("HIREPASS_SESSION_SECRET(min 32 chars)");
  }
  if (isProduction() && !process.env.HIREPASS_ADMIN_PASSWORD_HASH) {
    missing.push("HIREPASS_ADMIN_PASSWORD_HASH");
  }
  if (!isProduction() && !process.env.HIREPASS_ADMIN_PASSWORD && !process.env.HIREPASS_ADMIN_PASSWORD_HASH) {
    missing.push("HIREPASS_ADMIN_PASSWORD or HIREPASS_ADMIN_PASSWORD_HASH");
  }
  if (missing.length > 0) {
    throw new Error(`HirePass internal auth configuration missing: ${missing.join(", ")}`);
  }
}

function verifyConfiguredAdmin(username: string, password: string) {
  if (!isInternalAuthEnabled()) return false;
  if (username !== process.env.HIREPASS_ADMIN_USERNAME) return false;
  const configuredHash = process.env.HIREPASS_ADMIN_PASSWORD_HASH;
  if (configuredHash) return verifyPassword(password, configuredHash);
  if (!isProduction() && process.env.HIREPASS_ADMIN_PASSWORD) {
    return timingSafeEqual(Buffer.from(password), Buffer.from(process.env.HIREPASS_ADMIN_PASSWORD));
  }
  return false;
}

export function configureInternalAuth(app: Express) {
  validateAuthConfig();
  const secret = process.env.HIREPASS_SESSION_SECRET || "development-only-hirepass-session-secret";
  const PgSessionStore = connectPgSimple(session);
  app.use(session({
    name: "hirepass.sid",
    secret,
    resave: false,
    saveUninitialized: false,
    store: isProduction() ? new PgSessionStore({ pool, tableName: "sessions" }) : undefined,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction(),
      maxAge: SESSION_MAX_AGE_MS,
    },
  }));

  app.post("/api/auth/login", (req, res) => {
    if (!isInternalAuthEnabled()) {
      req.session.hirepassAdmin = { username: "development", role: "owner_admin" };
      return res.json({ user: req.session.hirepassAdmin });
    }
    const { username, password } = req.body || {};
    if (typeof username !== "string" || typeof password !== "string" || !verifyConfiguredAdmin(username, password)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    req.session.regenerate((error) => {
      if (error) return res.status(500).json({ error: "Login failed" });
      req.session.hirepassAdmin = { username, role: "owner_admin" };
      res.json({ user: req.session.hirepassAdmin });
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((error) => {
      if (error) return res.status(500).json({ error: "Logout failed" });
      res.clearCookie("hirepass.sid");
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!isInternalAuthEnabled() && !req.session.hirepassAdmin) {
      return res.json({ user: { username: "development", role: "owner_admin" }, authEnabled: false });
    }
    if (!req.session.hirepassAdmin) return res.status(401).json({ error: "Authentication required" });
    res.json({ user: req.session.hirepassAdmin, authEnabled: isInternalAuthEnabled() });
  });
}

export function isIntendedPublicApiRoute(req: Request) {
  if (!req.path.startsWith("/api")) return false;
  return (
    req.path === "/api/health" ||
    req.path === "/api/ready" ||
    INTENDED_PUBLIC_API_PREFIXES.some((prefix) => req.path.startsWith(prefix))
  );
}

export function disableOutOfScopeProductionRoutes(req: Request, res: Response, next: NextFunction) {
  if (!isProduction()) return next();
  if (PRODUCTION_DISABLED_LEGACY_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    return res.status(404).json({ error: "This route is not enabled for HirePass V1 production" });
  }
  next();
}

export function requireInternalAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isInternalAuthEnabled()) return next();
  if (isIntendedPublicApiRoute(req)) return next();
  if (!req.path.startsWith("/api")) return next();
  if (!req.session?.hirepassAdmin) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}
