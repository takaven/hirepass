import { createHmac } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { pool } from "./db";

type LimitGroup = "login" | "public-intake" | "external-pass-mutation";

const policies: Record<LimitGroup, { limit: number; windowMs: number }> = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  "public-intake": { limit: 20, windowMs: 60 * 60_000 },
  "external-pass-mutation": { limit: 60, windowMs: 15 * 60_000 },
};

function classify(req: Request): LimitGroup | null {
  if (req.method === "POST" && req.path === "/api/auth/login") return "login";
  if (req.method === "POST" && req.path.startsWith("/api/public/")) return "public-intake";
  if (req.method !== "GET" && (req.path.startsWith("/api/candidate-pass/") || req.path.startsWith("/api/manager-pass/"))) {
    return "external-pass-mutation";
  }
  return null;
}

export function validateRateLimitConfig() {
  if (process.env.NODE_ENV !== "production") return;
  const secret = process.env.HIREPASS_RATE_LIMIT_SECRET || process.env.HIREPASS_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("HIREPASS_RATE_LIMIT_SECRET (or session secret) must be at least 32 characters");
}

export function persistentRateLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== "production") return next();
    const group = classify(req);
    if (!group) return next();

    try {
      const policy = policies[group];
      const secret = process.env.HIREPASS_RATE_LIMIT_SECRET || process.env.HIREPASS_SESSION_SECRET!;
      const identity = createHmac("sha256", secret).update(`${group}:${req.ip}`).digest("hex");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + policy.windowMs);
      const result = await pool.query<{ count: number; expires_at: Date }>(
        `insert into rate_limit_counters (key, count, window_started_at, expires_at)
         values ($1, 1, $2, $3)
         on conflict (key) do update set
           count = case when rate_limit_counters.expires_at <= $2 then 1 else rate_limit_counters.count + 1 end,
           window_started_at = case when rate_limit_counters.expires_at <= $2 then $2 else rate_limit_counters.window_started_at end,
           expires_at = case when rate_limit_counters.expires_at <= $2 then $3 else rate_limit_counters.expires_at end
         returning count, expires_at`,
        [identity, now, expiresAt],
      );
      const counter = result.rows[0];
      res.setHeader("RateLimit-Limit", String(policy.limit));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, policy.limit - counter.count)));
      if (counter.count > policy.limit) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((new Date(counter.expires_at).getTime() - now.getTime()) / 1000))));
        return res.status(429).json({ error: "Too many requests; try again later" });
      }
      next();
    } catch {
      // A broken limiter must not silently expose public mutation endpoints.
      console.error("Rate protection unavailable");
      res.status(503).json({ error: "Service temporarily unavailable" });
    }
  };
}
