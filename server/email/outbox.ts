import nodemailer from "nodemailer";
import { storage } from "../storage";
import { getEmailConfig } from "./config";

export type EmailIntent = {
  eventKey: string;
  to: string | null | undefined;
  recipientName?: string | null;
  subject: string;
  bodyText: string;
};

export async function enqueueEmail(intent: EmailIntent) {
  const config = getEmailConfig();
  if (!config.enabled || !intent.to || !config.configured) {
    return { queued: false, reason: !config.enabled ? "email_disabled" : !intent.to ? "missing_recipient" : "email_unconfigured" };
  }
  await storage.enqueueEmail({
    eventKey: intent.eventKey,
    recipientEmail: intent.to,
    recipientName: intent.recipientName || null,
    subject: intent.subject,
    bodyText: intent.bodyText,
    status: "pending",
    attemptCount: 0,
  });
  wakeEmailWorker();
  return { queued: true };
}

async function deliver(email: Awaited<ReturnType<typeof storage.claimPendingEmails>>[number]) {
  const config = getEmailConfig();
  if (!config.configured) throw new Error("email_not_configured");
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
  });
  await transport.sendMail({
    from: config.from,
    to: email.recipientEmail,
    subject: email.subject,
    text: email.bodyText,
  });
}

let running = false;
let timer: NodeJS.Timeout | null = null;

export async function drainEmailOutbox() {
  if (running) return;
  const config = getEmailConfig();
  if (!config.enabled) return;
  running = true;
  try {
    for (;;) {
      const emails = await storage.claimPendingEmails(10);
      if (!emails.length) break;
      for (const email of emails) {
        try {
          await deliver(email);
          await storage.markEmailSent(email.id);
        } catch {
          await storage.markEmailFailed(email.id, getEmailConfig().configured ? "email_delivery_failed" : "email_not_configured");
        }
      }
    }
  } finally {
    running = false;
  }
}

export function wakeEmailWorker(delayMs = 0) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    drainEmailOutbox().catch(() => undefined);
  }, delayMs);
  timer.unref?.();
}

export function startEmailWorker() {
  if (!getEmailConfig().enabled) return;
  wakeEmailWorker(500);
  const interval = setInterval(() => wakeEmailWorker(), 60_000);
  interval.unref?.();
}
