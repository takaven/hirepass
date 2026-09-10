import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { configureInternalAuth } from "./auth";
import { safeApiRequestLogger } from "./request-logging";
import { persistentRateLimit, validateRateLimitConfig } from "./rate-limit";
import { startAiReviewWorker } from "./ai/worker";
import { startEmailWorker } from "./email/outbox";

const app = express();
const httpServer = createServer(app);

validateRateLimitConfig();
const trustProxyHops = Number(process.env.HIREPASS_TRUST_PROXY_HOPS || "0");
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) {
  throw new Error("HIREPASS_TRUST_PROXY_HOPS must be an integer from 0 to 5");
}
if (trustProxyHops > 0) app.set("trust proxy", trustProxyHops);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Throttle before parsing potentially large public request bodies.
app.use(persistentRateLimit());

app.use(
  express.json({
    limit: "14mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "14mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use(safeApiRequestLogger((message) => log(message)));

(async () => {
  configureInternalAuth(app);
  await registerRoutes(httpServer, app);
  startAiReviewWorker();
  startEmailWorker();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
