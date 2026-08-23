import type { NextFunction, Request, Response } from "express";

export function safeApiRequestLogger(logFn: (message: string) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const path = req.path;

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;
      const duration = Date.now() - start;
      logFn(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    });

    next();
  };
}
