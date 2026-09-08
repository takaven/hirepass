import type { NextFunction, Request, Response } from "express";

const EXTERNAL_PASS_PREFIXES = ["candidate-pass", "manager-pass"];

export function safeApiPath(req: Request) {
  const routePath = req.route?.path;
  if (typeof routePath === "string") {
    return `${req.baseUrl || ""}${routePath}`;
  }

  const segments = req.path.split("/");
  const apiIndex = segments.indexOf("api");
  const passType = segments[apiIndex + 1];
  if (apiIndex >= 0 && EXTERNAL_PASS_PREFIXES.includes(passType) && segments[apiIndex + 2]) {
    segments[apiIndex + 2] = ":token";
  }
  return segments.join("/");
}

export function safeApiRequestLogger(logFn: (message: string) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      if (!req.path.startsWith("/api")) return;
      const duration = Date.now() - start;
      logFn(`${req.method} ${safeApiPath(req)} ${res.statusCode} in ${duration}ms`);
    });

    next();
  };
}
