import type { Express, Response } from "express";
import { createServer, type Server } from "http";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { 
  insertManagerSchema, 
  insertPassSchema,
  insertPassPositionSchema,
  insertCandidateSchema, 
  insertPassCandidateSchema,
  insertInterviewSchema,
  insertInterviewEvaluationSchema,
  insertOfferSchema,
  insertShareLinkSchema,
  insertTechnicalAssessmentSchema,
  insertOnboardingRecordSchema,
} from "@shared/schema";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { resolvePassAccess } from "./pass-access";
import { resolveCandidatePassState } from "./candidate-pass-state";
import { isPassScopedCandidate, isPassScopedInterview, resolveManagerPassState } from "./manager-pass-state";
import {
  buildCandidatePassPayload,
  buildManagerPassPayload,
  isCandidateScopedInterviewSlot,
  isCandidateScopedMessage,
  toManagerPassPassDto,
} from "./external-pass-security";
import { buildPassControlItem } from "./hr-pass-control";
import { disableOutOfScopeProductionRoutes, requireInternalAdmin } from "./auth";
import { verifyDatabaseReady } from "./db";
import { eraseCandidatePii } from "./candidate-privacy";
import { PublicIntakeError, reuseCandidateForPass, submitPublicCandidate } from "./public-intake";
import { saveInternalCandidateCv } from "./internal-cv";
import { allowedCandidateStatus, configuredStages, nextConfiguredStage, validateConfiguredStages } from "@shared/hiring-workflow";
import {
  readStoredCandidateDocument,
  removeStoredCandidateDocument,
  setSafeDownloadHeaders,
  storeCandidateDocumentUpload,
  validateUploadRoot,
} from "./document-files";
import { aiStatus, getAiConfig } from "./ai/config";
import { criterionInputSchema, validateCriterionSafety } from "./ai/criteria";
import { suggestCriteriaWithAnthropic, suggestInterviewQuestionsWithAnthropic } from "./ai/provider";
import { processPendingAiReviews, queueLibraryMatchReview, queueReviewForApplication } from "./ai/review";
import { wakeAiReviewWorker } from "./ai/worker";
import { enqueueEmail, type EmailIntent } from "./email/outbox";
import { getEmailConfig, publicAppUrl } from "./email/config";
import { resolveCompanyAccentColor } from "@shared/public-branding";
import { externalPassLandingPath, isExternalPassToken } from "@shared/external-pass-links";
import {
  candidateSessionLink,
  requireExternalCandidateSession,
  requireExternalStakeholderSession,
  requireSameOrigin,
  setExternalPassSession,
  stakeholderSessionLink,
} from "./external-pass-session";

function publicCompanyLogoUrl() {
  const value = process.env.HIREPASS_COMPANY_LOGO_URL || "";
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

const publicPrivacyConfig = () => ({
  companyName: process.env.HIREPASS_COMPANY_NAME || "Hiring company",
  companyLocation: process.env.HIREPASS_COMPANY_LOCATION || "",
  careersContactEmail: process.env.HIREPASS_CAREERS_CONTACT_EMAIL || "",
  companyLogoUrl: publicCompanyLogoUrl(),
  companyAccentColor: resolveCompanyAccentColor(process.env.HIREPASS_COMPANY_ACCENT_COLOR),
  privacyNoticeUrl: process.env.HIREPASS_PRIVACY_NOTICE_URL || "",
  privacyNoticeVersion: process.env.HIREPASS_PRIVACY_NOTICE_VERSION || "launch-v1",
  aiEnabled: getAiConfig().enabled,
});

const anthropic = new Anthropic();

async function enqueueEmailSafely(intent: EmailIntent) {
  try {
    return await enqueueEmail(intent);
  } catch (error) {
    console.warn("Email enqueue failed after hiring action", { reason: error instanceof Error ? error.message : "unknown" });
    return { queued: false, reason: "email_enqueue_failed" };
  }
}

async function candidatePassUrlForApplication(passCandidateId: number): Promise<string | null> {
  const links = await storage.getCandidateLinksByPassCandidate(passCandidateId);
  const active = links.find((link: any) => link.isActive && (!link.expiresAt || new Date(link.expiresAt) > new Date()));
  return active ? publicAppUrl(externalPassLandingPath("candidate", active.token)) : null;
}

async function enqueueCandidateActionEmail(input: {
  passCandidateId: number;
  eventKey: string;
  subject: string;
  body: string;
}) {
  try {
    const config = getEmailConfig();
    if (!config.enabled) return { queued: false, reason: "email_disabled" };
    if (!config.configured) return { queued: false, reason: "email_unconfigured" };
    const passCandidate = await storage.getPassCandidateById(input.passCandidateId);
    if (!passCandidate) return { queued: false, reason: "application_missing" };
    const [candidate, url] = await Promise.all([
      storage.getCandidate(passCandidate.candidateId),
      candidatePassUrlForApplication(input.passCandidateId),
    ]);
    if (!candidate?.email || !url) return { queued: false, reason: url ? "missing_recipient" : "candidate_pass_unavailable" };
    return enqueueEmailSafely({
      eventKey: input.eventKey,
      to: candidate.email,
      recipientName: candidate.name,
      subject: input.subject,
      bodyText: `${input.body}\n\nOpen your Candidate Pass: ${url}`,
    });
  } catch (error) {
    console.warn("Candidate action email enqueue skipped", { reason: error instanceof Error ? error.message : "unknown" });
    return { queued: false, reason: "email_enqueue_failed" };
  }
}

async function enqueueStakeholderPassIssuedEmail(pass: any, link: any, managerId: number) {
  try {
    const stakeholder = await storage.getManager(managerId);
    return enqueueEmailSafely({
      eventKey: `stakeholder-pass-issued:${link.id}`,
      to: stakeholder?.email,
      recipientName: stakeholder?.name,
      subject: `Stakeholder Pass: ${pass.positionTitle}`,
      bodyText: `You have hiring input requested for ${pass.positionTitle}.\n\nOpen your Stakeholder Pass: ${publicAppUrl(externalPassLandingPath("stakeholder", link.token)) || "Ask the hiring team for your Stakeholder Pass link."}`,
    });
  } catch (error) {
    console.warn("Stakeholder Pass email enqueue skipped", { reason: error instanceof Error ? error.message : "unknown" });
    return { queued: false, reason: "email_enqueue_failed" };
  }
}

async function enqueueCandidatePassIssuedEmail(passCandidate: any, link: any, pass?: any) {
  try {
    const [candidate, resolvedPass] = await Promise.all([
      storage.getCandidate(passCandidate.candidateId),
      pass ? Promise.resolve(pass) : storage.getPass(passCandidate.passId),
    ]);
    return enqueueEmailSafely({
      eventKey: `candidate-pass-issued:${link.id}`,
      to: candidate?.email,
      recipientName: candidate?.name,
      subject: `Candidate Pass${resolvedPass?.positionTitle ? `: ${resolvedPass.positionTitle}` : ""}`,
      bodyText: `A Candidate Pass is available for your application${resolvedPass?.positionTitle ? ` for ${resolvedPass.positionTitle}` : ""}.\n\nOpen your Candidate Pass: ${publicAppUrl(externalPassLandingPath("candidate", link.token)) || "Ask the hiring team for your Candidate Pass link."}`,
    });
  } catch (error) {
    console.warn("Candidate Pass email enqueue skipped", { reason: error instanceof Error ? error.message : "unknown" });
    return { queued: false, reason: "email_enqueue_failed" };
  }
}

function interviewEndTime(startTime: string, duration: number): string {
  const match = /^(\d{2}):(\d{2})$/.exec(startTime);
  if (!match) throw new Error("Invalid interview start time");
  const total = Number(match[1]) * 60 + Number(match[2]) + duration;
  if (Number(match[1]) > 23 || Number(match[2]) > 59 || total >= 1440) throw new Error("Interview must end on the same day");
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function validInterviewDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

async function validInterviewer(managerId: unknown) {
  const id = z.coerce.number().int().positive().safeParse(managerId);
  if (!id.success) return null;
  const manager = await storage.getManager(id.data);
  return manager?.isActive && manager.canBeInterviewer ? manager : null;
}

async function validStakeholder(managerId: unknown) {
  const id = z.coerce.number().int().positive().safeParse(managerId);
  if (!id.success) return null;
  const manager = await storage.getManager(id.data);
  return manager?.isActive ? manager : null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const defaultExpiry = () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const createCandidatePassToken = () => `cand_${randomBytes(32).toString("base64url")}`;

  async function createOrReuseCandidatePassUrl(passCandidateId: number): Promise<string | null> {
    const existingUrl = await candidatePassUrlForApplication(passCandidateId);
    if (existingUrl) return existingUrl;
    const link = await storage.createCandidateLink({
      token: createCandidatePassToken(),
      passCandidateId,
      canFillApplication: true,
      canTakeAssessment: true,
      expiresAt: defaultExpiry(),
      isActive: true,
    });
    return publicAppUrl(externalPassLandingPath("candidate", link.token));
  }

  async function buildPassControl(passId: number) {
    const pass = await storage.getPass(passId);
    if (!pass) return null;
    const manager = pass.hiringManagerId ? await storage.getManager(pass.hiringManagerId) : null;
    const candidates = await storage.getPassCandidatesWithDetails(pass.id);
    const candidateLinksByPassCandidateId = new Map<number, any[]>();
    const messagesByPassCandidateId = new Map<number, any[]>();
    const documentsByPassCandidateId = new Map<number, any[]>();
    const offersByPassCandidateId = new Map<number, any | undefined>();
    for (const candidate of candidates) {
      candidateLinksByPassCandidateId.set(candidate.id, await storage.getCandidateLinksByPassCandidate(candidate.id));
      messagesByPassCandidateId.set(candidate.id, await storage.getCandidateMessages(candidate.id));
      documentsByPassCandidateId.set(candidate.id, await storage.getCandidateDocuments(candidate.id));
      offersByPassCandidateId.set(candidate.id, await storage.getOfferByPassCandidate(candidate.id));
    }

    return buildPassControlItem({
      pass,
      manager,
      candidates,
      candidateLinksByPassCandidateId,
      managerLinks: await storage.getShareLinksByPass(pass.id),
      interviews: await storage.getInterviewsByPass(pass.id),
      interviewSlots: await storage.getInterviewSlotsByPass(pass.id),
      messagesByPassCandidateId,
      documentsByPassCandidateId,
      offersByPassCandidateId,
      activity: await storage.getActivitiesByPass(pass.id),
    });
  }

  function parsePositiveId(value: string) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function isPendingDocument(document: { status?: string | null }) {
    return (document.status || "pending").toLowerCase() === "pending";
  }

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/ready", async (_req, res) => {
    try {
      if (process.env.NODE_ENV === "production") {
        if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
        if (!process.env.HIREPASS_SESSION_SECRET) throw new Error("HIREPASS_SESSION_SECRET missing");
        if (!process.env.HIREPASS_COMPANY_NAME) throw new Error("HIREPASS_COMPANY_NAME missing");
        if (!process.env.HIREPASS_PRIVACY_NOTICE_URL) throw new Error("HIREPASS_PRIVACY_NOTICE_URL missing");
        new URL(process.env.HIREPASS_PRIVACY_NOTICE_URL);
        if (!process.env.HIREPASS_PRIVACY_NOTICE_VERSION) throw new Error("HIREPASS_PRIVACY_NOTICE_VERSION missing");
        await verifyDatabaseReady();
      }
      await validateUploadRoot();
      res.json({ ok: true, ready: true });
    } catch (error) {
      res.status(503).json({ ok: false, ready: false });
    }
  });

  app.use(["/candidate-pass", "/manager-pass", "/api/external"], (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  app.use(disableOutOfScopeProductionRoutes);
  app.use(requireInternalAdmin);
  
  // ============ ANALYTICS ROUTES ============
  app.get("/api/analytics/stats", async (req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  });

  app.get("/api/analytics/pipeline", async (req, res) => {
    try {
      const pipeline = await storage.getPipelineCounts();
      res.json(pipeline);
    } catch (error) {
      console.error("Error fetching pipeline:", error);
      res.status(500).json({ error: "Failed to fetch pipeline data" });
    }
  });

  app.get("/api/analytics/trends", async (req, res) => {
    try {
      const trends = await storage.getRecruitmentTrends();
      res.json(trends);
    } catch (error) {
      console.error("Error fetching trends:", error);
      res.status(500).json({ error: "Failed to fetch trends" });
    }
  });

  // ============ HR PASS CONTROL ROUTES ============
  app.get("/api/hr-pass-control", async (req, res) => {
    try {
      const passes = await storage.getPasses();
      const items = (await Promise.all(passes.map((pass) => buildPassControl(pass.id))))
        .filter(Boolean)
        .sort((a, b) => {
          const priorityOrder = { attention: 0, monitor: 1, complete: 2 };
          return priorityOrder[a!.priority] - priorityOrder[b!.priority];
        });
      res.json({ items });
    } catch (error) {
      console.error("Error fetching HR pass control:", error);
      res.status(500).json({ error: "Failed to fetch HR pass control" });
    }
  });

  app.get("/api/hr-pass-control/passes/:passId", async (req, res) => {
    try {
      const passId = parsePositiveId(req.params.passId);
      if (!passId) return res.status(400).json({ error: "Valid passId is required" });
      const item = await buildPassControl(passId);
      if (!item) return res.status(404).json({ error: "Pass not found" });
      res.json(item);
    } catch (error) {
      console.error("Error fetching HR pass control detail:", error);
      res.status(500).json({ error: "Failed to fetch HR pass control detail" });
    }
  });

  app.post("/api/hr-pass-control/passes/:passId/manager-link", async (req, res) => {
    try {
      const passId = parsePositiveId(req.params.passId);
      if (!passId) return res.status(400).json({ error: "Valid passId is required" });
      const pass = await storage.getPass(passId);
      if (!pass) return res.status(404).json({ error: "Pass not found" });
      const managerId = req.body.managerId ?? pass.hiringManagerId;
      if (!managerId) return res.status(400).json({ error: "An actionable Stakeholder Pass must be assigned to a hiring stakeholder" });
      if (!await validStakeholder(managerId)) return res.status(404).json({ error: "Active hiring stakeholder not found" });
      const link = await storage.createShareLink({
        passId,
        managerId: managerId ? Number(managerId) : undefined,
        linkType: "manager",
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : defaultExpiry(),
      });
      await storage.logActivity({
        passId,
        actorType: "hr",
        actorName: "HR Team",
        action: "manager_pass_issued",
        targetType: "share_link",
        targetId: link.id,
        details: { managerId: managerId || null },
      });
      await enqueueStakeholderPassIssuedEmail(pass, link, Number(managerId));
      res.status(201).json(link);
    } catch (error) {
      console.error("Error issuing manager pass:", error);
      res.status(500).json({ error: "Failed to issue Manager Pass" });
    }
  });

  app.post("/api/hr-pass-control/passes/:passId/candidates/:passCandidateId/candidate-link", async (req, res) => {
    try {
      const passId = parsePositiveId(req.params.passId);
      const passCandidateId = parsePositiveId(req.params.passCandidateId);
      if (!passId || !passCandidateId) return res.status(400).json({ error: "Valid pass and candidate IDs are required" });
      const passCandidate = await storage.getPassCandidateById(passCandidateId);
      if (!passCandidate || passCandidate.passId !== passId) {
        return res.status(404).json({ error: "Candidate is not available for this Pass" });
      }
      const token = createCandidatePassToken();
      const link = await storage.createCandidateLink({
        token,
        passCandidateId,
        canFillApplication: true,
        canTakeAssessment: true,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : defaultExpiry(),
        isActive: true,
      });
      await storage.logActivity({
        passId,
        actorType: "hr",
        actorName: "HR Team",
        action: "candidate_pass_issued",
        targetType: "candidate_link",
        targetId: link.id,
        details: { passCandidateId },
      });
      await enqueueCandidatePassIssuedEmail(passCandidate, link);
      res.status(201).json(link);
    } catch (error) {
      console.error("Error issuing candidate pass:", error);
      res.status(500).json({ error: "Failed to issue Candidate Pass" });
    }
  });

  app.post("/api/hr-pass-control/passes/:passId/manager-links/:linkId/revoke", async (req, res) => {
    try {
      const passId = parsePositiveId(req.params.passId);
      const linkId = parsePositiveId(req.params.linkId);
      if (!passId || !linkId) return res.status(400).json({ error: "Valid pass and link IDs are required" });
      const links = await storage.getShareLinksByPass(passId);
      const link = links.find((item) => item.id === linkId);
      if (!link) return res.status(404).json({ error: "Manager Pass link is not available for this Pass" });
      const updated = await storage.updateShareLink(link.id, { isActive: false });
      await storage.logActivity({
        passId,
        actorType: "hr",
        actorName: "HR Team",
        action: "manager_pass_revoked",
        targetType: "share_link",
        targetId: link.id,
        details: { reason: req.body.reason || null },
      });
      res.json(updated);
    } catch (error) {
      console.error("Error revoking manager pass:", error);
      res.status(500).json({ error: "Failed to revoke Manager Pass" });
    }
  });

  app.post("/api/hr-pass-control/passes/:passId/candidate-links/:linkId/revoke", async (req, res) => {
    try {
      const passId = parsePositiveId(req.params.passId);
      const linkId = parsePositiveId(req.params.linkId);
      if (!passId || !linkId) return res.status(400).json({ error: "Valid pass and link IDs are required" });
      const candidates = await storage.getPassCandidatesWithDetails(passId);
      let foundLink: any | null = null;
      for (const candidate of candidates) {
        const links = await storage.getCandidateLinksByPassCandidate(candidate.id);
        foundLink = links.find((item) => item.id === linkId && item.passCandidateId === candidate.id) || foundLink;
      }
      if (!foundLink) return res.status(404).json({ error: "Candidate Pass link is not available for this Pass" });
      const updated = await storage.updateCandidateLink(foundLink.id, { isActive: false });
      await storage.logActivity({
        passId,
        actorType: "hr",
        actorName: "HR Team",
        action: "candidate_pass_revoked",
        targetType: "candidate_link",
        targetId: foundLink.id,
        details: { reason: req.body.reason || null },
      });
      res.json(updated);
    } catch (error) {
      console.error("Error revoking candidate pass:", error);
      res.status(500).json({ error: "Failed to revoke Candidate Pass" });
    }
  });

  const extendLinkSchema = z.object({
    expiresAt: z.coerce.date(),
  });

  app.post("/api/hr-pass-control/passes/:passId/manager-links/:linkId/extend", async (req, res) => {
    try {
      const passId = parsePositiveId(req.params.passId);
      const linkId = parsePositiveId(req.params.linkId);
      if (!passId || !linkId) return res.status(400).json({ error: "Valid pass and link IDs are required" });
      const { expiresAt } = extendLinkSchema.parse(req.body);
      const link = (await storage.getShareLinksByPass(passId)).find((item) => item.id === linkId);
      if (!link) return res.status(404).json({ error: "Manager Pass link is not available for this Pass" });
      if (link.isActive === false) {
        return res.status(409).json({ error: "Revoked Manager Pass links must be reissued, not extended" });
      }
      const updated = await storage.updateShareLink(link.id, { expiresAt });
      await storage.logActivity({
        passId,
        actorType: "hr",
        actorName: "HR Team",
        action: "manager_pass_extended",
        targetType: "share_link",
        targetId: link.id,
        details: { expiresAt: expiresAt.toISOString() },
      });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error extending manager pass:", error);
      res.status(500).json({ error: "Failed to extend Manager Pass" });
    }
  });

  app.post("/api/hr-pass-control/passes/:passId/candidate-links/:linkId/extend", async (req, res) => {
    try {
      const passId = parsePositiveId(req.params.passId);
      const linkId = parsePositiveId(req.params.linkId);
      if (!passId || !linkId) return res.status(400).json({ error: "Valid pass and link IDs are required" });
      const { expiresAt } = extendLinkSchema.parse(req.body);
      const candidates = await storage.getPassCandidatesWithDetails(passId);
      let foundLink: any | null = null;
      for (const candidate of candidates) {
        const links = await storage.getCandidateLinksByPassCandidate(candidate.id);
        foundLink = links.find((item) => item.id === linkId && item.passCandidateId === candidate.id) || foundLink;
      }
      if (!foundLink) return res.status(404).json({ error: "Candidate Pass link is not available for this Pass" });
      if (foundLink.isActive === false) {
        return res.status(409).json({ error: "Revoked Candidate Pass links must be reissued, not extended" });
      }
      const updated = await storage.updateCandidateLink(foundLink.id, { expiresAt });
      await storage.logActivity({
        passId,
        actorType: "hr",
        actorName: "HR Team",
        action: "candidate_pass_extended",
        targetType: "candidate_link",
        targetId: foundLink.id,
        details: { expiresAt: expiresAt.toISOString() },
      });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error extending candidate pass:", error);
      res.status(500).json({ error: "Failed to extend Candidate Pass" });
    }
  });

  const nudgeSchema = z.object({
    targetType: z.enum(["candidate", "manager", "hr"]),
    targetId: z.number().int().positive().optional(),
    reason: z.string().max(255).optional(),
  });

  app.post("/api/hr-pass-control/passes/:passId/nudge", async (req, res) => {
    try {
      const passId = parsePositiveId(req.params.passId);
      if (!passId) return res.status(400).json({ error: "Valid passId is required" });
      const pass = await storage.getPass(passId);
      if (!pass) return res.status(404).json({ error: "Pass not found" });
      const body = nudgeSchema.parse(req.body);
      const control = await buildPassControl(passId);
      if (!control) return res.status(404).json({ error: "Pass not found" });
      if (body.targetType === "candidate") {
        if (!body.targetId) return res.status(400).json({ error: "Candidate application target is required" });
        const passCandidate = await storage.getPassCandidateById(body.targetId);
        if (!passCandidate || passCandidate.passId !== passId) {
          return res.status(404).json({ error: "Candidate is not available for this Pass" });
        }
        const candidateState = control.candidates.find((candidate) => candidate.id === body.targetId);
        if (candidateState?.waitingOn !== "candidate") {
          return res.status(409).json({ error: "Candidate has no outstanding Pass action to nudge" });
        }
      }
      if (body.targetType === "manager" && body.targetId) {
        if (body.targetId !== pass.hiringManagerId) {
          return res.status(404).json({ error: "Manager is not assigned to this Pass" });
        }
      }
      if (body.targetType === "manager" && control.waitingOn !== "manager") {
        return res.status(409).json({ error: "Manager has no outstanding Pass decision to nudge" });
      }
      if (body.targetType === "hr" && control.waitingOn !== "hr") {
        return res.status(409).json({ error: "HR is not the current owner of this Pass action" });
      }
      const activity = await storage.logActivity({
        passId,
        actorType: "hr",
        actorName: "HR Team",
        action: "pass_nudge_recorded",
        targetType: body.targetType,
        targetId: body.targetId,
        details: { reason: body.reason || null },
      });
      res.status(201).json(activity);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error recording pass nudge:", error);
      res.status(500).json({ error: "Failed to record pass nudge" });
    }
  });

  // ============ MANAGER ROUTES ============
  app.get("/api/managers", async (req, res) => {
    try {
      const managersList = await storage.getManagers();
      res.json(managersList);
    } catch (error) {
      console.error("Error fetching managers:", error);
      res.status(500).json({ error: "Failed to fetch managers" });
    }
  });

  app.get("/api/managers/:id", async (req, res) => {
    try {
      const manager = await storage.getManager(parseInt(req.params.id));
      if (!manager) {
        return res.status(404).json({ error: "Manager not found" });
      }
      res.json(manager);
    } catch (error) {
      console.error("Error fetching manager:", error);
      res.status(500).json({ error: "Failed to fetch manager" });
    }
  });

  app.post("/api/managers", async (req, res) => {
    try {
      const validated = insertManagerSchema.parse(req.body);
      const manager = await storage.createManager(validated);
      res.status(201).json(manager);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating manager:", error);
      res.status(500).json({ error: "Failed to create manager" });
    }
  });

  app.patch("/api/managers/:id", async (req, res) => {
    try {
      const manager = await storage.updateManager(parseInt(req.params.id), insertManagerSchema.partial().parse(req.body));
      if (!manager) {
        return res.status(404).json({ error: "Manager not found" });
      }
      res.json(manager);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error updating manager:", error);
      res.status(500).json({ error: "Failed to update manager" });
    }
  });

  app.delete("/api/managers/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteManager(parseInt(req.params.id));
      if (!deleted) {
        return res.status(404).json({ error: "Manager not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting manager:", error);
      res.status(500).json({ error: "Failed to delete manager" });
    }
  });

  // ============ PASS ROUTES ============
  app.get("/api/passes", async (req, res) => {
    try {
      const passesList = await storage.getPasses();
      res.json(passesList);
    } catch (error) {
      console.error("Error fetching passes:", error);
      res.status(500).json({ error: "Failed to fetch passes" });
    }
  });

  app.get("/api/passes/:id", async (req, res) => {
    try {
      const pass = await storage.getPassWithDetails(parseInt(req.params.id));
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }
      res.json(pass);
    } catch (error) {
      console.error("Error fetching pass:", error);
      res.status(500).json({ error: "Failed to fetch pass" });
    }
  });

  // Lookup pass by readable passId. HP is the neutral default; legacy prefixes remain readable.
  app.get("/api/passes/lookup/:passId", async (req, res) => {
    try {
      let { passId } = req.params;
      const newFormat = /^(HP|BAYN)-(RP|CP|OP)-\d{4}-\d{3}$/;
      const legacyFormat = /^(RP|CP|OP)-\d{4}-\d{3}$/;
      
      if (!newFormat.test(passId) && !legacyFormat.test(passId)) {
        return res.status(400).json({ error: "Invalid pass ID format. Expected: HP-RP-YYYY-NNN or RP-YYYY-NNN" });
      }
      
      const lookupIds = Array.from(new Set([passId, passId.replace(/^(HP|BAYN)-/, "")]));
      let pass = undefined;
      for (const lookupId of lookupIds) {
        pass = await storage.getPassByPassId(lookupId);
        if (pass) break;
      }
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }
      // Get full details using numeric id
      const passWithDetails = await storage.getPassWithDetails(pass.id);
      res.json(passWithDetails);
    } catch (error) {
      console.error("Error fetching pass by passId:", error);
      res.status(500).json({ error: "Failed to fetch pass" });
    }
  });

  app.post("/api/passes", async (req, res) => {
    try {
      if (req.body.enabledStages !== undefined && !validateConfiguredStages(req.body.enabledStages)) return res.status(400).json({ error: "Workflow stages must be an ordered subset from Applied to Hired" });
      if (req.body.hiringManagerId != null) {
        const stakeholder = await storage.getManager(Number(req.body.hiringManagerId));
        if (!stakeholder?.isActive || !stakeholder.canBeHiringManager) return res.status(400).json({ error: "Hiring Manager must be an active eligible stakeholder" });
      }
      const validated = insertPassSchema.parse(req.body);
      const pass = await storage.createPass(validated);
      
      await storage.logActivity({
        passId: pass.id,
        actorType: 'admin',
        actorName: 'HR Admin',
        action: 'created_pass',
        targetType: 'pass',
        targetId: pass.id,
        details: { passId: pass.passId }
      });

      res.status(201).json(pass);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating pass:", error);
      res.status(500).json({ error: "Failed to create pass" });
    }
  });

  app.patch("/api/passes/:id", async (req, res) => {
    try {
      if (req.body.enabledStages !== undefined && !validateConfiguredStages(req.body.enabledStages)) return res.status(400).json({ error: "Workflow stages must be an ordered subset from Applied to Hired" });
      if (req.body.hiringManagerId != null) {
        const stakeholder = await storage.getManager(Number(req.body.hiringManagerId));
        if (!stakeholder?.isActive || !stakeholder.canBeHiringManager) return res.status(400).json({ error: "Hiring Manager must be an active eligible stakeholder" });
      }
      if (req.body.enabledStages !== undefined) {
        const activeStatuses = (await storage.getPassCandidates(parseInt(req.params.id))).map((candidate) => candidate.status || "new");
        const disabledInUse = activeStatuses.find((status) => !["rejected", "withdrawn"].includes(status) && !req.body.enabledStages.includes(status));
        if (disabledInUse) return res.status(409).json({ error: `Cannot disable the ${disabledInUse} stage while candidates are using it` });
      }
      const pass = await storage.updatePass(parseInt(req.params.id), req.body);
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }
      res.json(pass);
    } catch (error) {
      console.error("Error updating pass:", error);
      res.status(500).json({ error: "Failed to update pass" });
    }
  });

  app.delete("/api/passes/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePass(parseInt(req.params.id));
      if (!deleted) {
        return res.status(404).json({ error: "Pass not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting pass:", error);
      res.status(500).json({ error: "Failed to delete pass" });
    }
  });

  // ============ PASS POSITION ROUTES ============
  app.get("/api/passes/:passId/positions", async (req, res) => {
    try {
      const positions = await storage.getPassPositions(parseInt(req.params.passId));
      res.json(positions);
    } catch (error) {
      console.error("Error fetching pass positions:", error);
      res.status(500).json({ error: "Failed to fetch pass positions" });
    }
  });

  app.post("/api/passes/:passId/positions", async (req, res) => {
    try {
      const validated = insertPassPositionSchema.parse({
        ...req.body,
        passId: parseInt(req.params.passId)
      });
      const position = await storage.createPassPosition(validated);
      res.status(201).json(position);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating pass position:", error);
      res.status(500).json({ error: "Failed to create pass position" });
    }
  });

  app.patch("/api/pass-positions/:id", async (req, res) => {
    try {
      const position = await storage.updatePassPosition(parseInt(req.params.id), req.body);
      if (!position) {
        return res.status(404).json({ error: "Position not found" });
      }
      res.json(position);
    } catch (error) {
      console.error("Error updating pass position:", error);
      res.status(500).json({ error: "Failed to update pass position" });
    }
  });

  app.delete("/api/pass-positions/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePassPosition(parseInt(req.params.id));
      if (!deleted) {
        return res.status(404).json({ error: "Position not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting pass position:", error);
      res.status(500).json({ error: "Failed to delete pass position" });
    }
  });

  // ============ AI INTELLIGENCE ROUTES ============
  function sameTarget(positionId: number | null | undefined, expected: number | null) {
    return (positionId ?? null) === expected;
  }

  async function queueTargetApplications(passId: number, positionId: number | null) {
    const candidates = await storage.getPassCandidates(passId);
    const activeCandidates = candidates.filter((candidate) =>
      sameTarget(candidate.positionId, positionId) && !["rejected", "withdrawn", "hired"].includes(candidate.status || "new")
    );
    const limit = getAiConfig().maxBatch;
    let queued = 0;
    for (const candidate of activeCandidates.slice(0, limit)) {
      const result = await queueReviewForApplication(candidate.id, true);
      if (result.queued) queued += 1;
    }
    wakeAiReviewWorker();
    return { queued, eligible: activeCandidates.length, remaining: Math.max(0, activeCandidates.length - limit) };
  }

  function aiReviewSummary(review: any) {
    return {
      id: review.id,
      passId: review.passId,
      positionId: review.positionId,
      passCandidateId: review.passCandidateId,
      documentId: review.documentId,
      criteriaVersion: review.criteriaVersion,
      status: review.status,
      reviewBand: review.reviewBand,
      staleReason: review.staleReason,
      safeErrorCode: review.safeErrorCode,
      createdAt: review.createdAt,
      startedAt: review.startedAt,
      completedAt: review.completedAt,
      updatedAt: review.updatedAt,
    };
  }

  async function vacancyContext(passId: number, positionId: number | null) {
    const pass = await storage.getPass(passId);
    const position = positionId ? await storage.getPassPosition(positionId) : null;
    return {
      title: position?.positionTitle || pass?.positionTitle,
      department: pass?.department,
      location: pass?.location,
      employmentType: pass?.employmentType,
      requirements: position?.requirements,
      qualifications: position?.qualifications,
      jobDescription: position?.jobDescriptionFinal || pass?.jobDescriptionFinal || pass?.jobDescriptionDraft,
    };
  }

  app.get("/api/intelligence/status", (_req, res) => {
    res.json(aiStatus());
  });

  app.get("/api/intelligence/passes/:passId/criteria", async (req, res) => {
    const passId = parsePositiveId(req.params.passId);
    if (!passId) return res.status(400).json({ error: "Valid pass ID is required" });
    const positionId = req.query.positionId ? parsePositiveId(String(req.query.positionId)) : null;
    if (req.query.positionId && !positionId) return res.status(400).json({ error: "Valid position ID is required" });
    const pass = await storage.getPass(passId);
    if (!pass) return res.status(404).json({ error: "Pass not found" });
    const position = positionId ? await storage.getPassPosition(positionId) : null;
    if (positionId && position?.passId !== passId) return res.status(404).json({ error: "Position not found for this pass" });
    const criteria = await storage.getAiCriteria(passId, positionId);
    res.json({
      criteria,
      confirmedAt: positionId ? position?.aiCriteriaConfirmedAt : pass.aiCriteriaConfirmedAt,
      version: positionId ? position?.aiCriteriaVersion : pass.aiCriteriaVersion,
      target: { passId, positionId },
    });
  });

  app.post("/api/intelligence/passes/:passId/criteria/suggest", async (req, res) => {
    try {
      const passId = parsePositiveId(req.params.passId);
      if (!passId) return res.status(400).json({ error: "Valid pass ID is required" });
      const positionId = req.body.positionId ? z.coerce.number().int().positive().parse(req.body.positionId) : null;
      const pass = await storage.getPass(passId);
      if (!pass) return res.status(404).json({ error: "Pass not found" });
      const position = positionId ? await storage.getPassPosition(positionId) : null;
      if (positionId && position?.passId !== passId) return res.status(404).json({ error: "Position not found for this pass" });
      const config = getAiConfig();
      if (!config.configured) return res.status(409).json({ error: "AI criteria suggestions are not configured. Add criteria manually or configure the AI add-on." });
      const title = position?.positionTitle || pass.positionTitle;
      const sourceText = [position?.requirements, position?.qualifications, position?.jobDescriptionFinal, pass.jobDescriptionFinal, pass.jobDescriptionDraft].filter(Boolean).join("\n");
      const result = await suggestCriteriaWithAnthropic({
        title,
        vacancy: {
          passId,
          positionId,
          positionTitle: title,
          department: pass.department,
          location: pass.location,
          employmentType: pass.employmentType,
        },
        sourceText,
      });
      res.json({ ...result, source: sourceText ? "role_fields" : "role_title", target: { passId, positionId } });
    } catch (error) {
      console.error("AI criteria suggestion failed:", error);
      res.status(500).json({ error: "Failed to suggest AI review criteria" });
    }
  });

  app.post("/api/intelligence/passes/:passId/criteria/confirm", async (req, res) => {
    try {
      const passId = z.coerce.number().int().positive().parse(req.params.passId);
      const positionId = req.body.positionId ? z.coerce.number().int().positive().parse(req.body.positionId) : null;
      const input = z.object({ criteria: z.array(criterionInputSchema).min(1).max(12) }).parse(req.body);
      const pass = await storage.getPass(passId);
      if (!pass) return res.status(404).json({ error: "Pass not found" });
      const position = positionId ? await storage.getPassPosition(positionId) : null;
      if (positionId && position?.passId !== passId) return res.status(404).json({ error: "Position not found for this pass" });
      for (const criterion of input.criteria) {
        const unsafe = validateCriterionSafety(criterion);
        if (unsafe) return res.status(400).json({ error: unsafe, criterion: criterion.title });
      }
      const confirmed = await storage.replaceAiCriteriaAndConfirm(passId, positionId, input.criteria.map((criterion, index) => ({
        ...criterion,
        passId,
        positionId,
        sortOrder: criterion.sortOrder ?? index,
      })), "criteria_changed");
      const queue = await queueTargetApplications(passId, positionId);
      res.json({ confirmed: true, version: confirmed.version, ...queue });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to confirm AI review criteria" });
    }
  });

  app.get("/api/intelligence/passes/:passId/reviews", async (req, res) => {
    const passId = parsePositiveId(req.params.passId);
    if (!passId) return res.status(400).json({ error: "Valid pass ID is required" });
    const reviews = await storage.getAiReviewsByPass(passId);
    res.json(reviews.map(aiReviewSummary));
  });

  app.get("/api/intelligence/applications/:passCandidateId/review", async (req, res) => {
    const passCandidateId = parsePositiveId(req.params.passCandidateId);
    if (!passCandidateId) return res.status(400).json({ error: "Valid application ID is required" });
    const review = await storage.getLatestAiReview(passCandidateId);
    res.json(review || { status: "waiting_for_criteria" });
  });

  app.post("/api/intelligence/applications/:passCandidateId/review", async (req, res) => {
    const passCandidateId = parsePositiveId(req.params.passCandidateId);
    if (!passCandidateId) return res.status(400).json({ error: "Valid application ID is required" });
    const result = await queueReviewForApplication(passCandidateId, Boolean(req.body?.force));
    if (!result.queued) return res.status(409).json(result);
    wakeAiReviewWorker();
    res.status(202).json(result);
  });

  app.get("/api/intelligence/passes/:passId/library-matches", async (req, res) => {
    const passId = parsePositiveId(req.params.passId);
    if (!passId) return res.status(400).json({ error: "Valid vacancy ID is required" });
    const positionId = req.query.positionId ? parsePositiveId(String(req.query.positionId)) : null;
    if (req.query.positionId && !positionId) return res.status(400).json({ error: "Valid position ID is required" });
    const pass = await storage.getPass(passId);
    if (!pass) return res.status(404).json({ error: "Vacancy not found" });
    const position = positionId ? await storage.getPassPosition(positionId) : null;
    if (positionId && position?.passId !== passId) return res.status(404).json({ error: "Position not found for this vacancy" });
    const currentVersion = position ? position.aiCriteriaVersion : pass.aiCriteriaVersion;
    const reviews = (await storage.getAiReviewsByPass(passId)).filter((review) =>
      review.reviewType === "library_match" &&
      (positionId ? review.positionId === positionId : review.positionId === null) &&
      review.criteriaVersion === currentVersion &&
      ["pending", "processing", "completed", "failed"].includes(review.status)
    );
    const enriched = await Promise.all(reviews.map(async (review) => ({
      ...aiReviewSummary(review),
      reviewType: review.reviewType,
      candidate: await storage.getCandidate(review.candidateId),
    })));
    res.json(enriched.filter((row) => row.candidate && !(row.candidate as any).isAnonymized));
  });

  app.post("/api/intelligence/passes/:passId/library-matches", async (req, res) => {
    const passId = parsePositiveId(req.params.passId);
    if (!passId) return res.status(400).json({ error: "Valid vacancy ID is required" });
    const positionId = req.body?.positionId ? parsePositiveId(String(req.body.positionId)) : null;
    const pass = await storage.getPass(passId);
    if (!pass) return res.status(404).json({ error: "Vacancy not found" });
    const positions = await storage.getPassPositions(passId);
    if (positionId) {
      const position = positions.find((item) => item.id === positionId);
      if (!position) return res.status(404).json({ error: "Position not found for this vacancy" });
    } else if (positions.length > 1) {
      return res.status(409).json({ error: "Choose one position before finding existing candidates" });
    }
    const targetPositionId = positionId ?? (positions.length === 1 ? positions[0].id : null);
    const limit = Math.max(1, Math.min(Number(req.body?.limit || getAiConfig().maxBatch), getAiConfig().maxBatch));
    const allCandidates = await storage.getCandidates();
    const existing = await storage.getPassCandidates(passId);
    const attached = new Set(existing.map((application) => application.candidateId));
    const eligible = allCandidates.filter((candidate) => !candidate.isAnonymized && candidate.cvFilePath && !attached.has(candidate.id)).slice(0, limit);
    let queued = 0;
    for (const candidate of eligible) {
      const result = await queueLibraryMatchReview({ passId, candidateId: candidate.id, positionId: targetPositionId });
      if (result.queued) queued += 1;
    }
    if (queued) wakeAiReviewWorker();
    res.status(202).json({ queued, eligible: eligible.length, remaining: Math.max(0, allCandidates.length - attached.size - eligible.length) });
  });

  app.post("/api/intelligence/passes/:passId/compare", async (req, res) => {
    const passId = parsePositiveId(req.params.passId);
    if (!passId) return res.status(400).json({ error: "Valid vacancy ID is required" });
    const ids = z.array(z.number().int().positive()).min(2).max(4).parse(req.body?.passCandidateIds);
    const applications = await Promise.all(ids.map((id) => storage.getPassCandidateById(id)));
    if (applications.some((application) => !application || application.passId !== passId)) return res.status(400).json({ error: "Candidates must belong to this vacancy" });
    const positionIds = new Set(applications.map((application) => application?.positionId ?? null));
    if (positionIds.size !== 1) return res.status(409).json({ error: "Comparison requires candidates reviewed for the same role target" });
    const targetPositionId = applications[0]?.positionId ?? null;
    const [pass, position] = await Promise.all([
      storage.getPass(passId),
      targetPositionId !== null ? storage.getPassPosition(targetPositionId) : Promise.resolve(null),
    ]);
    if (!pass || (targetPositionId && position?.passId !== passId)) return res.status(404).json({ error: "Review target not found" });
    const currentCriteriaVersion = position ? position.aiCriteriaVersion : pass.aiCriteriaVersion;
    const reviews = await Promise.all(ids.map((id) => storage.getLatestAiReview(id)));
    if (reviews.some((review) =>
      !review ||
      review.status !== "completed" ||
      !review.result ||
      review.passId !== passId ||
      (review.positionId ?? null) !== targetPositionId ||
      review.criteriaVersion !== currentCriteriaVersion
    )) return res.status(409).json({ error: "Comparison needs current completed AI reviews for the same role target" });
    const candidates = await Promise.all(applications.map(async (application) => ({
      ...application,
      candidate: application ? await storage.getCandidate(application.candidateId) : null,
    })));
    res.json({ candidates, reviews });
  });

  app.post("/api/intelligence/applications/:passCandidateId/interview-questions", async (req, res) => {
    const passCandidateId = parsePositiveId(req.params.passCandidateId);
    if (!passCandidateId) return res.status(400).json({ error: "Valid application ID is required" });
    const review = await storage.getLatestAiReview(passCandidateId);
    const application = await storage.getPassCandidateById(passCandidateId);
    if (!review?.result || review.status !== "completed" || !application) return res.status(409).json({ error: "Completed AI review required" });
    const vacancy = await vacancyContext(application.passId, application.positionId ?? null);
    const questions = await suggestInterviewQuestionsWithAnthropic({
      vacancy,
      criteria: (review.criteriaSnapshot as any[]).map((criterion) => ({ id: criterion.id, title: criterion.title, importance: criterion.importance })),
      review: review.result as any,
    });
    res.json({ questions });
  });

  app.post("/api/intelligence/queue/process", async (_req, res) => {
    res.json(await processPendingAiReviews());
  });

  // ============ CANDIDATE ROUTES ============
  app.get("/api/candidates", async (req, res) => {
    try {
      const candidatesList = await storage.getCandidates();
      // Enrich each candidate with their linked passes
      const enrichedCandidates = await Promise.all(
        candidatesList.map(async (candidate) => {
          const passCandidates = await storage.getCandidatePasses(candidate.id);
          return {
            ...candidate,
            passCandidates,
          };
        })
      );
      res.json(enrichedCandidates);
    } catch (error) {
      console.error("Error fetching candidates:", error);
      res.status(500).json({ error: "Failed to fetch candidates" });
    }
  });

  app.get("/api/candidates/:id", async (req, res) => {
    try {
      const candidate = await storage.getCandidate(parseInt(req.params.id));
      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }
      res.json(candidate);
    } catch (error) {
      console.error("Error fetching candidate:", error);
      res.status(500).json({ error: "Failed to fetch candidate" });
    }
  });

  app.post("/api/candidates", async (req, res) => {
    try {
      const validated = insertCandidateSchema.parse(req.body);
      const candidate = await storage.createCandidate(validated);
      res.status(201).json(candidate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating candidate:", error);
      res.status(500).json({ error: "Failed to create candidate" });
    }
  });

  app.patch("/api/candidates/:id", async (req, res) => {
    try {
      const candidate = await storage.updateCandidate(parseInt(req.params.id), req.body);
      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }
      res.json(candidate);
    } catch (error) {
      console.error("Error updating candidate:", error);
      res.status(500).json({ error: "Failed to update candidate" });
    }
  });

  app.post("/api/candidates/:id/cv", async (req, res) => {
    const candidateId = parsePositiveId(req.params.id);
    if (!candidateId) return res.status(400).json({ error: "Valid candidate ID is required" });
    const candidate = await storage.getCandidate(candidateId);
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });
    const uploadSchema = z.object({
      fileName: z.string().min(1).max(255),
      mimeType: z.string().max(100).optional(),
      fileDataBase64: z.string().min(1),
    });
    try {
      const input = uploadSchema.parse(req.body);
      const upload = await saveInternalCandidateCv(candidateId, input);
      res.status(201).json({ fileName: upload.fileName, size: upload.size });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid CV upload" });
    }
  });

  app.get("/api/candidates/:id/cv", async (req, res) => {
    const candidateId = parsePositiveId(req.params.id);
    if (!candidateId) return res.status(400).json({ error: "Valid candidate ID is required" });
    const candidate = await storage.getCandidate(candidateId);
    if (!candidate?.cvFilePath) return res.status(404).json({ error: "CV not found" });
    try {
      const file = await readStoredCandidateDocument(candidate.cvFilePath);
      setSafeDownloadHeaders(res, candidate.cvFileName || "candidate-cv.pdf");
      res.type("application/pdf").send(file);
    } catch {
      res.status(404).json({ error: "CV not found" });
    }
  });

  app.get("/api/candidates/:id/library", async (req, res) => {
    const candidateId = parsePositiveId(req.params.id);
    if (!candidateId) return res.status(400).json({ error: "Valid candidate ID is required" });
    const candidate = await storage.getCandidate(candidateId);
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });
    const [applications, candidateDocuments] = await Promise.all([
      storage.getCandidatePasses(candidateId),
      storage.getDocumentsByCandidate(candidateId),
    ]);
    const vacancyTitles = new Map(applications.map((application) => [application.passId, application.pass.positionTitle]));
    res.json({
      candidate,
      applications,
      cvs: candidateDocuments.filter((document) => document.docType === "cv" && document.filePath).map((document) => ({
        id: document.id,
        passId: document.passId,
        passCandidateId: document.passCandidateId,
        fileName: document.fileName,
        createdAt: document.createdAt,
        current: document.filePath === candidate.cvFilePath,
        provenance: document.passId ? vacancyTitles.get(document.passId) || "Vacancy application" : "General submission",
      })),
    });
  });

  app.get("/api/candidates/:candidateId/cvs/:documentId", async (req, res) => {
    const candidateId = parsePositiveId(req.params.candidateId);
    const documentId = parsePositiveId(req.params.documentId);
    if (!candidateId || !documentId) return res.status(400).json({ error: "Valid candidate and document IDs are required" });
    const document = (await storage.getDocumentsByCandidate(candidateId)).find((item) => item.id === documentId && item.docType === "cv");
    if (!document?.filePath) return res.status(404).json({ error: "CV not found" });
    try {
      const file = await readStoredCandidateDocument(document.filePath);
      setSafeDownloadHeaders(res, document.fileName || "candidate-cv.pdf");
      res.type("application/pdf").send(file);
    } catch { res.status(404).json({ error: "CV not found" }); }
  });

  app.post("/api/candidates/:id/reuse", async (req, res) => {
    try {
      const candidateId = z.coerce.number().int().positive().parse(req.params.id);
      const passId = z.coerce.number().int().positive().parse(req.body.passId);
      res.status(201).json(await reuseCandidateForPass(candidateId, passId));
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      if (error instanceof PublicIntakeError) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: "Failed to reuse candidate" });
    }
  });

  app.delete("/api/candidates/:id", async (req, res) => {
    try {
      const candidateId = parsePositiveId(req.params.id);
      if (!candidateId) return res.status(400).json({ error: "Valid candidate ID is required" });
      const deleted = await eraseCandidatePii(candidateId);
      if (!deleted) {
        return res.status(404).json({ error: "Candidate not found" });
      }
      res.status(200).json({ erased: true, auditHistoryPreserved: true });
    } catch (error) {
      console.error("Error deleting candidate:", error);
      res.status(500).json({ error: "Failed to delete candidate" });
    }
  });

  // ============ PASS CANDIDATE ROUTES ============
  app.get("/api/passes/:passId/candidates", async (req, res) => {
    try {
      const passCandidates = await storage.getPassCandidates(parseInt(req.params.passId));
      res.json(passCandidates);
    } catch (error) {
      console.error("Error fetching pass candidates:", error);
      res.status(500).json({ error: "Failed to fetch pass candidates" });
    }
  });

  app.post("/api/passes/:passId/candidates", async (req, res) => {
    try {
      const owningPass = await storage.getPass(parseInt(req.params.passId));
      if (!owningPass) return res.status(404).json({ error: "Pass not found" });
      if (req.body.status && !allowedCandidateStatus(req.body.status, owningPass.enabledStages)) return res.status(400).json({ error: "Status is not enabled for this hiring workflow" });
      const validated = insertPassCandidateSchema.parse({
        ...req.body,
        passId: parseInt(req.params.passId)
      });
      const passCandidate = await storage.addCandidateToPass(validated);
      try {
        const queued = await queueReviewForApplication(passCandidate.id);
        if (queued.queued) wakeAiReviewWorker();
      } catch (queueError) {
        console.error("AI review enqueue failed after candidate assignment:", queueError);
      }
      res.status(201).json(passCandidate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error adding candidate to pass:", error);
      res.status(500).json({ error: "Failed to add candidate to pass" });
    }
  });

  app.patch("/api/pass-candidates/:id", async (req, res) => {
    try {
      const existing = await storage.getPassCandidateById(parseInt(req.params.id));
      if (!existing) return res.status(404).json({ error: "Pass candidate not found" });
      const owningPass = await storage.getPass(existing.passId);
      if (req.body.status && (!owningPass || !allowedCandidateStatus(req.body.status, owningPass.enabledStages))) return res.status(400).json({ error: "Status is not enabled for this hiring workflow" });
      const passCandidate = await storage.updatePassCandidate(parseInt(req.params.id), req.body);
      if (!passCandidate) {
        return res.status(404).json({ error: "Pass candidate not found" });
      }
      res.json(passCandidate);
    } catch (error) {
      console.error("Error updating pass candidate:", error);
      res.status(500).json({ error: "Failed to update pass candidate" });
    }
  });

  app.delete("/api/pass-candidates/:id", async (req, res) => {
    res.status(409).json({
      error: "Application hard-deletion is disabled because it is not a candidate privacy-erasure operation; update its workflow status instead",
    });
  });

  // Pass candidates pipeline view
  app.get("/api/passes/:passId/candidates/pipeline", async (req, res) => {
    try {
      const pipeline = await storage.getPassCandidatesPipeline(parseInt(req.params.passId));
      res.json(pipeline);
    } catch (error) {
      console.error("Error fetching pipeline:", error);
      res.status(500).json({ error: "Failed to fetch pipeline data" });
    }
  });

  // Bulk update pass candidate statuses
  const bulkUpdateSchema = z.object({
    ids: z.array(z.number()).min(1, "At least one ID is required"),
    status: z.string().min(1, "Status is required")
  });

  app.post("/api/pass-candidates/bulk-update", async (req, res) => {
    try {
      const validated = bulkUpdateSchema.parse(req.body);
      for (const id of validated.ids) {
        const candidate = await storage.getPassCandidateById(id);
        const pass = candidate ? await storage.getPass(candidate.passId) : null;
        if (!candidate || !pass || !allowedCandidateStatus(validated.status, pass.enabledStages)) return res.status(400).json({ error: "Status is not enabled for every selected hiring workflow" });
      }
      const updatedCount = await storage.bulkUpdatePassCandidateStatus(validated.ids, validated.status);
      res.json({ success: true, updatedCount });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error bulk updating pass candidates:", error);
      res.status(500).json({ error: "Failed to bulk update pass candidates" });
    }
  });

  // Update pass candidate status with notes
  const updateStatusSchema = z.object({
    status: z.string().min(1, "Status is required"),
    notes: z.string().optional()
  });

  app.patch("/api/pass-candidates/:id/status", async (req, res) => {
    try {
      const validated = updateStatusSchema.parse(req.body);
      const passCandidateId = parseInt(req.params.id);
      
      // Get the pass candidate to find the pass and candidate info
      const existingPC = await storage.getPassCandidate(passCandidateId);
      if (!existingPC) {
        return res.status(404).json({ error: "Pass candidate not found" });
      }
      const owningPass = await storage.getPass(existingPC.passId);
      if (!owningPass || !allowedCandidateStatus(validated.status, owningPass.enabledStages)) return res.status(400).json({ error: "Status is not enabled for this hiring workflow" });
      
      const oldStatus = existingPC.status;
      
      const passCandidate = await storage.updatePassCandidateStatus(
        passCandidateId,
        validated.status,
        validated.notes
      );
      if (!passCandidate) {
        return res.status(404).json({ error: "Pass candidate not found" });
      }
      
      // Create notification for status change
      try {
        const pass = await storage.getPass(existingPC.passId);
        const candidate = await storage.getCandidate(existingPC.candidateId);
        
        if (pass && candidate) {
          // Create a notification for the hiring manager (if exists) or use a mock user
          const notificationUserId = pass.hiringManagerId ? `manager-${pass.hiringManagerId}` : 'admin-user';
          
          const statusLabels: Record<string, string> = {
            new: 'New',
            screening: 'Screening',
            shortlisted: 'Shortlisted',
            interview: 'Interview',
            offer: 'Offer',
            hired: 'Hired',
            rejected: 'Rejected'
          };
          
          const newStatusLabel = statusLabels[validated.status] || validated.status;
          const oldStatusLabel = statusLabels[oldStatus || 'new'] || oldStatus || 'New';
          
          await storage.createNotification({
            userId: notificationUserId,
            candidateId: candidate.id,
            type: 'candidate_status_change',
            title: `Candidate Status Updated`,
            message: `${candidate.name} moved from ${oldStatusLabel} to ${newStatusLabel} for ${pass.positionTitle}`,
            link: `/passes/${pass.id}/candidates`
          });
        }
      } catch (notifError) {
        console.error("Error creating notification:", notifError);
        // Don't fail the main operation if notification fails
      }
      
      res.json(passCandidate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating pass candidate status:", error);
      res.status(500).json({ error: "Failed to update pass candidate status" });
    }
  });

  // Update pass candidate AI score
  const updateAiScoreSchema = z.object({
    aiScore: z.number().min(0).max(100),
    aiScoreDetails: z.object({}).passthrough().optional()
  });

  app.patch("/api/pass-candidates/:id/ai-score", async (req, res) => {
    try {
      const validated = updateAiScoreSchema.parse(req.body);
      const passCandidate = await storage.updatePassCandidateAiScore(
        parseInt(req.params.id),
        validated.aiScore,
        validated.aiScoreDetails
      );
      if (!passCandidate) {
        return res.status(404).json({ error: "Pass candidate not found" });
      }
      res.json(passCandidate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating pass candidate AI score:", error);
      res.status(500).json({ error: "Failed to update pass candidate AI score" });
    }
  });

  // Get all passes for a candidate
  app.get("/api/candidates/:candidateId/passes", async (req, res) => {
    try {
      const candidatePasses = await storage.getCandidatePasses(parseInt(req.params.candidateId));
      res.json(candidatePasses);
    } catch (error) {
      console.error("Error fetching candidate passes:", error);
      res.status(500).json({ error: "Failed to fetch candidate passes" });
    }
  });

  // ============ PUBLIC ROUTES ============
  // Get open passes (for public job listings)
  app.get("/api/public/passes", async (req, res) => {
    try {
      const openPasses = await storage.getOpenPasses();
      // Return only public-facing information
      const publicPasses = openPasses.map(pass => ({
        id: pass.id,
        passId: pass.passId,
        positionTitle: pass.positionTitle,
        department: pass.department,
        location: pass.location,
        employmentType: pass.employmentType,
        experienceMin: pass.experienceMin,
        experienceMax: pass.experienceMax,
        salaryRangeMin: pass.salaryRangeMin,
        salaryRangeMax: pass.salaryRangeMax,
        salaryCurrency: pass.salaryCurrency,
        jobDescriptionFinal: pass.jobDescriptionFinal,
        dateRequested: pass.dateRequested
      }));
      res.json(publicPasses);
    } catch (error) {
      console.error("Error fetching public passes:", error);
      res.status(500).json({ error: "Failed to fetch open positions" });
    }
  });

  const publicSubmissionSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Valid email is required"),
    phone: z.string().optional(),
    currentTitle: z.string().optional(),
    currentCompany: z.string().optional(),
    currentLocation: z.string().optional(),
    linkedinUrl: z.string().url().optional().or(z.literal("")),
    skills: z.array(z.string()).optional(),
    fileName: z.string().min(1),
    mimeType: z.string().optional(),
    fileDataBase64: z.string().min(1),
    privacyAcknowledged: z.literal(true),
  });

  const sendPublicIntakeError = (error: unknown, res: Response) => {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    if (error instanceof PublicIntakeError) return res.status(error.status).json({ error: error.message });
    console.error("Public candidate submission failed", error);
    return res.status(500).json({ error: "Submission could not be completed; no partial submission was retained" });
  };

  app.get("/api/public/config", (_req, res) => res.json(publicPrivacyConfig()));

  app.get("/api/public/passes/:id", async (req, res) => {
    try {
      const pass = await storage.getPass(Number(req.params.id));
      if (!pass) return res.status(404).json({ error: "Position not found" });
      if (!["sourcing", "screening", "active"].includes(pass.status || "")) return res.status(409).json({ error: "This position is no longer accepting applications" });
      res.json({
        id: pass.id, passId: pass.passId, positionTitle: pass.positionTitle,
        department: pass.department, location: pass.location, employmentType: pass.employmentType,
        experienceMin: pass.experienceMin, experienceMax: pass.experienceMax,
        salaryRangeMin: pass.salaryRangeMin, salaryRangeMax: pass.salaryRangeMax,
        salaryCurrency: pass.salaryCurrency, jobDescriptionFinal: pass.jobDescriptionFinal,
        dateRequested: pass.dateRequested,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch position" });
    }
  });

  app.post("/api/public/submit-cv", async (req, res) => {
    try {
      const validated = publicSubmissionSchema.parse(req.body);
      const result = await submitPublicCandidate({ ...validated, privacyNoticeVersion: publicPrivacyConfig().privacyNoticeVersion });
      await enqueueEmailSafely({
        eventKey: `talent-pool-received:${result.candidateId}`,
        to: validated.email,
        recipientName: validated.name,
        subject: "CV received",
        bodyText: "Your CV has been received and stored in the hiring company's candidate library. The hiring team may consider it for suitable future vacancies.",
      });
      res.status(201).json({ success: true, message: "Your CV has been submitted", ...result });
    } catch (error) { return sendPublicIntakeError(error, res); }
  });

  app.post("/api/public/passes/:id/apply", async (req, res) => {
    try {
      const validated = publicSubmissionSchema.parse(req.body);
      const result = await submitPublicCandidate({ ...validated, privacyNoticeVersion: publicPrivacyConfig().privacyNoticeVersion, passId: Number(req.params.id) });
      const mayReturnImmediateStatusLink = Boolean(result.applicationId && !result.duplicateApplication && !result.reusedCandidate);
      const candidatePassUrl = mayReturnImmediateStatusLink ? await createOrReuseCandidatePassUrl(result.applicationId!) : null;
      if (result.applicationId && !result.duplicateApplication) {
        try {
          const queued = await queueReviewForApplication(result.applicationId);
          if (queued.queued) wakeAiReviewWorker();
        } catch (queueError) {
          console.error("AI review enqueue failed after public application:", queueError);
        }
      }
      const pass = await storage.getPass(Number(req.params.id));
      await enqueueEmailSafely({
        eventKey: `application-received:${result.applicationId || result.candidateId}:${result.duplicateApplication ? "duplicate" : "new"}`,
        to: validated.email,
        recipientName: validated.name,
        subject: result.duplicateApplication ? "Application already received" : `Application received${pass?.positionTitle ? `: ${pass.positionTitle}` : ""}`,
        bodyText: result.duplicateApplication
          ? "Your application is already on file with the hiring team. Your retry did not replace the CV already attached to that application."
          : "Your application has been received. The hiring team will manage any next step in HirePass.",
      });
      res.status(result.duplicateApplication ? 200 : 201).json({
        success: true,
        message: result.duplicateApplication ? "Your application was already received" : "Application submitted successfully",
        candidatePassUrl,
        ...result,
      });
    } catch (error) { return sendPublicIntakeError(error, res); }
  });

  // Compatibility for already-published links using the original endpoint.
  app.post("/api/public/apply", async (req, res) => {
    try {
      const passId = z.number().int().positive().parse(req.body.passId);
      const validated = publicSubmissionSchema.parse(req.body);
      const result = await submitPublicCandidate({ ...validated, privacyNoticeVersion: publicPrivacyConfig().privacyNoticeVersion, passId });
      const mayReturnImmediateStatusLink = Boolean(result.applicationId && !result.duplicateApplication && !result.reusedCandidate);
      const candidatePassUrl = mayReturnImmediateStatusLink ? await createOrReuseCandidatePassUrl(result.applicationId!) : null;
      if (result.applicationId && !result.duplicateApplication) {
        try {
          const queued = await queueReviewForApplication(result.applicationId);
          if (queued.queued) wakeAiReviewWorker();
        } catch (queueError) {
          console.error("AI review enqueue failed after public application:", queueError);
        }
      }
      const pass = await storage.getPass(passId);
      await enqueueEmailSafely({
        eventKey: `application-received:${result.applicationId || result.candidateId}:${result.duplicateApplication ? "duplicate" : "new"}`,
        to: validated.email,
        recipientName: validated.name,
        subject: result.duplicateApplication ? "Application already received" : `Application received${pass?.positionTitle ? `: ${pass.positionTitle}` : ""}`,
        bodyText: result.duplicateApplication
          ? "Your application is already on file with the hiring team. Your retry did not replace the CV already attached to that application."
          : "Your application has been received. The hiring team will manage any next step in HirePass.",
      });
      res.status(result.duplicateApplication ? 200 : 201).json({ success: true, candidatePassUrl, ...result });
    } catch (error) { return sendPublicIntakeError(error, res); }
  });

  // ============ INTERVIEW ROUTES ============
  app.get("/api/interviews", async (req, res) => {
    try {
      const interviewsList = await storage.getInterviews();
      res.json(interviewsList);
    } catch (error) {
      console.error("Error fetching interviews:", error);
      res.status(500).json({ error: "Failed to fetch interviews" });
    }
  });

  app.get("/api/interviews/upcoming", async (req, res) => {
    try {
      const upcoming = await storage.getUpcomingInterviews();
      res.json(upcoming);
    } catch (error) {
      console.error("Error fetching upcoming interviews:", error);
      res.status(500).json({ error: "Failed to fetch upcoming interviews" });
    }
  });

  app.get("/api/interviews/:id", async (req, res) => {
    try {
      const interview = await storage.getInterview(parseInt(req.params.id));
      if (!interview) {
        return res.status(404).json({ error: "Interview not found" });
      }
      res.json(interview);
    } catch (error) {
      console.error("Error fetching interview:", error);
      res.status(500).json({ error: "Failed to fetch interview" });
    }
  });

  app.post("/api/interviews", async (req, res) => {
    try {
      const passId = z.coerce.number().int().positive().parse(req.body.passId);
      const passCandidateId = z.coerce.number().int().positive().parse(req.body.passCandidateId);
      const [pass, passCandidate, interviewer] = await Promise.all([
        storage.getPass(passId), storage.getPassCandidateById(passCandidateId), validInterviewer(req.body.interviewerId),
      ]);
      if (!pass) return res.status(404).json({ error: "Pass not found" });
      if (!configuredStages(pass.enabledStages).includes("interview")) return res.status(409).json({ error: "Interview is not enabled for this hiring workflow" });
      if (!passCandidate || passCandidate.passId !== pass.id) return res.status(400).json({ error: "Candidate application does not belong to this Pass" });
      if (!interviewer) return res.status(400).json({ error: "An active interview-eligible stakeholder is required" });
      const duration = z.coerce.number().int().min(15).max(240).parse(req.body.duration);
      const validated = insertInterviewSchema.parse({ ...req.body, passId, passCandidateId, interviewerId: interviewer.id, duration, endTime: interviewEndTime(req.body.startTime, duration) });
      const interview = await storage.createInterviewAndAdvanceCandidate(validated);
      await enqueueCandidateActionEmail({
        passCandidateId,
        eventKey: `candidate-interview-scheduled:${interview.id}`,
        subject: `Interview scheduled: ${pass.positionTitle}`,
        body: `Your interview details have been scheduled for ${pass.positionTitle}.`,
      });
      res.status(201).json(interview);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating interview:", error);
      res.status(500).json({ error: "Failed to create interview" });
    }
  });

  app.patch("/api/interviews/:id", async (req, res) => {
    try {
      const existing = await storage.getInterview(parseInt(req.params.id));
      if (!existing) return res.status(404).json({ error: "Interview not found" });
      if ((req.body.passId !== undefined && Number(req.body.passId) !== existing.passId) || (req.body.passCandidateId !== undefined && Number(req.body.passCandidateId) !== existing.passCandidateId)) {
        return res.status(409).json({ error: "Rescheduling cannot change the interview's Pass or candidate" });
      }
      const { passId: _passId, passCandidateId: _passCandidateId, ...mutableBody } = req.body;
      if (mutableBody.interviewerId !== undefined && !await validInterviewer(mutableBody.interviewerId)) return res.status(400).json({ error: "An active interview-eligible stakeholder is required" });
      const isReschedule = ["interviewDate", "startTime", "duration", "format", "location", "meetingLink", "interviewerId"].some((field) => field in req.body);
      const changes = isReschedule
        ? (() => {
            const duration = z.coerce.number().int().min(15).max(240).parse(req.body.duration ?? existing.duration);
            const startTime = req.body.startTime ?? existing.startTime;
            return insertInterviewSchema.omit({ passId: true, passCandidateId: true }).partial().parse({ ...mutableBody, duration, startTime, endTime: interviewEndTime(startTime, duration) });
          })()
        : insertInterviewSchema.omit({ passId: true, passCandidateId: true }).partial().parse(mutableBody);
      const interview = isReschedule ? await storage.rescheduleInterview(existing.id, changes) : await storage.updateInterview(existing.id, changes);
      if (!interview) {
        return res.status(404).json({ error: "Interview not found" });
      }
      if (isReschedule) {
        await enqueueCandidateActionEmail({
          passCandidateId: interview.passCandidateId,
          eventKey: `candidate-interview-updated:${interview.id}:${new Date(interview.updatedAt || Date.now()).getTime()}`,
          subject: "Interview details updated",
          body: "Your interview details have been updated.",
        });
      }
      res.json(interview);
    } catch (error) {
      console.error("Error updating interview:", error);
      res.status(500).json({ error: "Failed to update interview" });
    }
  });

  app.delete("/api/interviews/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteInterview(parseInt(req.params.id));
      if (!deleted) {
        return res.status(404).json({ error: "Interview not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting interview:", error);
      res.status(500).json({ error: "Failed to delete interview" });
    }
  });

  // ============ EVALUATION ROUTES ============
  app.post("/api/evaluations", async (req, res) => {
    try {
      const validated = insertInterviewEvaluationSchema.parse(req.body);
      const evaluation = await storage.createEvaluation(validated);
      res.status(201).json(evaluation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating evaluation:", error);
      res.status(500).json({ error: "Failed to create evaluation" });
    }
  });

  app.get("/api/interviews/:interviewId/evaluations", async (req, res) => {
    try {
      const evaluations = await storage.getEvaluationsByInterview(parseInt(req.params.interviewId));
      res.json(evaluations);
    } catch (error) {
      console.error("Error fetching evaluations:", error);
      res.status(500).json({ error: "Failed to fetch evaluations" });
    }
  });

  // ============ SETTINGS ROUTES ============
  app.get("/api/settings", async (req, res) => {
    try {
      const settingsList = await storage.getSettings();
      res.json(settingsList);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.put("/api/settings/:key", async (req, res) => {
    try {
      const { value, description } = req.body;
      const setting = await storage.upsertSetting(req.params.key, value, description);
      res.json(setting);
    } catch (error) {
      console.error("Error updating setting:", error);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });

  // ============ OFFER ROUTES ============
  app.get("/api/passes/:passId/offers", async (req, res) => {
    try {
      const offersList = await storage.getOffers(parseInt(req.params.passId));
      res.json(offersList);
    } catch (error) {
      console.error("Error fetching offers:", error);
      res.status(500).json({ error: "Failed to fetch offers" });
    }
  });

  app.post("/api/offers", async (req, res) => {
    try {
      const validated = insertOfferSchema.parse(req.body);
      const offer = await storage.createOffer(validated);
      if (offer.passCandidateId && offer.status && ["pending", "draft"].includes(offer.status)) {
        await enqueueCandidateActionEmail({
          passCandidateId: offer.passCandidateId,
          eventKey: `candidate-offer-made:${offer.id}`,
          subject: "Offer available",
          body: "An offer is available for your review.",
        });
      }
      res.status(201).json(offer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating offer:", error);
      res.status(500).json({ error: "Failed to create offer" });
    }
  });

  app.patch("/api/offers/:id", async (req, res) => {
    try {
      const offer = await storage.updateOffer(parseInt(req.params.id), req.body);
      if (!offer) {
        return res.status(404).json({ error: "Offer not found" });
      }
      if (offer.passCandidateId && offer.status && ["pending", "negotiating"].includes(offer.status)) {
        await enqueueCandidateActionEmail({
          passCandidateId: offer.passCandidateId,
          eventKey: `candidate-offer-updated:${offer.id}:${new Date(offer.updatedAt || Date.now()).getTime()}`,
          subject: "Offer updated",
          body: "Your offer details have been updated.",
        });
      }
      res.json(offer);
    } catch (error) {
      console.error("Error updating offer:", error);
      res.status(500).json({ error: "Failed to update offer" });
    }
  });

  // Get offers for a specific pass-candidate
  app.get("/api/pass-candidates/:passCandidateId/offers", async (req, res) => {
    try {
      const offers = await storage.getOffersByPassCandidate(parseInt(req.params.passCandidateId));
      res.json(offers);
    } catch (error) {
      console.error("Error fetching offers for pass-candidate:", error);
      res.status(500).json({ error: "Failed to fetch offers" });
    }
  });

  // Get interviews for a specific pass-candidate
  app.get("/api/pass-candidates/:passCandidateId/interviews", async (req, res) => {
    try {
      const interviews = await storage.getInterviewsByPassCandidate(parseInt(req.params.passCandidateId));
      res.json(interviews);
    } catch (error) {
      console.error("Error fetching interviews for pass-candidate:", error);
      res.status(500).json({ error: "Failed to fetch interviews" });
    }
  });

  // ============ ONBOARDING ROUTES ============
  app.get("/api/onboarding/:passCandidateId", async (req, res) => {
    try {
      const record = await storage.getOnboardingRecord(parseInt(req.params.passCandidateId));
      if (!record) {
        return res.status(404).json({ error: "Onboarding record not found" });
      }
      res.json(record);
    } catch (error) {
      console.error("Error fetching onboarding record:", error);
      res.status(500).json({ error: "Failed to fetch onboarding record" });
    }
  });

  app.post("/api/onboarding", async (req, res) => {
    try {
      const validated = insertOnboardingRecordSchema.parse(req.body);
      const record = await storage.createOnboardingRecord(validated);
      res.status(201).json(record);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating onboarding record:", error);
      res.status(500).json({ error: "Failed to create onboarding record" });
    }
  });

  app.patch("/api/onboarding/:id", async (req, res) => {
    try {
      const record = await storage.updateOnboardingRecord(parseInt(req.params.id), req.body);
      if (!record) {
        return res.status(404).json({ error: "Onboarding record not found" });
      }
      res.json(record);
    } catch (error) {
      console.error("Error updating onboarding record:", error);
      res.status(500).json({ error: "Failed to update onboarding record" });
    }
  });

  // ============ SHARE LINK ROUTES ============
  app.post("/api/share-links", async (req, res) => {
    try {
      const { passId, managerId, linkType, expiresAt } = req.body;
      const pass = await storage.getPass(Number(passId));
      if (!pass) return res.status(404).json({ error: "Pass not found" });
      const resolvedManagerId = managerId ?? pass.hiringManagerId;
      if (!resolvedManagerId) return res.status(400).json({ error: "An actionable Stakeholder Pass must be assigned to a hiring stakeholder" });
      if (!await validStakeholder(resolvedManagerId)) return res.status(404).json({ error: "Active hiring stakeholder not found" });
      const shareLink = await storage.createShareLink({
        passId,
        managerId: Number(resolvedManagerId),
        linkType: linkType || "manager",
        expiresAt: expiresAt ? new Date(expiresAt) : defaultExpiry()
      });
      const stakeholder = await storage.getManager(Number(resolvedManagerId));
      await enqueueEmailSafely({
        eventKey: `stakeholder-pass-issued:${shareLink.id}`,
        to: stakeholder?.email,
        recipientName: stakeholder?.name,
        subject: `Stakeholder Pass: ${pass.positionTitle}`,
        bodyText: `You have hiring input requested for ${pass.positionTitle}.\n\nOpen your Stakeholder Pass: ${publicAppUrl(externalPassLandingPath("stakeholder", shareLink.token)) || "Ask the hiring team for your Stakeholder Pass link."}`,
      });
      res.status(201).json(shareLink);
    } catch (error) {
      console.error("Error creating share link:", error);
      res.status(500).json({ error: "Failed to create share link" });
    }
  });

  // ============ CANDIDATE LINK ROUTES ============
  app.post("/api/candidate-links", async (req, res) => {
    try {
      const { passCandidateId, expiresAt } = req.body;
      
      // Validate passCandidateId is provided and is a number
      if (!passCandidateId || typeof passCandidateId !== 'number') {
        return res.status(400).json({ error: "Valid passCandidateId is required" });
      }
      
      // Verify the pass candidate exists
      const passCandidate = await storage.getPassCandidateById(passCandidateId);
      if (!passCandidate) {
        return res.status(404).json({ error: "Pass candidate not found" });
      }
      
      // Generate a unique token
      const token = createCandidatePassToken();
      
      const candidateLink = await storage.createCandidateLink({
        token,
        passCandidateId,
        isActive: true,
        expiresAt: expiresAt ? new Date(expiresAt) : defaultExpiry(),
      });
      const candidate = await storage.getCandidate(passCandidate.candidateId);
      const pass = await storage.getPass(passCandidate.passId);
      await enqueueEmailSafely({
        eventKey: `candidate-pass-issued:${candidateLink.id}`,
        to: candidate?.email,
        recipientName: candidate?.name,
        subject: `Candidate Pass${pass?.positionTitle ? `: ${pass.positionTitle}` : ""}`,
        bodyText: `A Candidate Pass is available for your application${pass?.positionTitle ? ` for ${pass.positionTitle}` : ""}.\n\nOpen your Candidate Pass: ${publicAppUrl(externalPassLandingPath("candidate", candidateLink.token)) || "Ask the hiring team for your Candidate Pass link."}`,
      });
      
      res.status(201).json(candidateLink);
    } catch (error) {
      console.error("Error creating candidate link:", error);
      res.status(500).json({ error: "Failed to create candidate link" });
    }
  });

  // ============ STAKEHOLDER PASS ROUTES (scoped external session) ============

  app.post("/api/external/stakeholder-pass/session", requireSameOrigin, async (req, res) => {
    const token = req.body?.token;
    if (!isExternalPassToken("stakeholder", token)) return res.status(404).json({ error: "Invalid share link" });
    const shareLink = await storage.getShareLinkByToken(token);
    const access = resolvePassAccess(shareLink, { inactive: "Invalid share link", expired: "Share link has expired" });
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    setExternalPassSession(res, "stakeholder", access.link);
    res.status(204).end();
  });
  app.use("/api/external/stakeholder-pass", requireExternalStakeholderSession());

  // Get Stakeholder Pass data from the scoped session.
  app.get("/api/external/stakeholder-pass", async (req, res) => {
    try {
      const activeShareLink = stakeholderSessionLink(res);
      
      // Update access tracking
      await storage.updateShareLink(activeShareLink.id, {
        accessCount: (activeShareLink.accessCount || 0) + 1,
        lastAccessedAt: new Date()
      });
      
      const pass = await storage.getPassWithDetails(activeShareLink.passId);
      const candidates = await storage.getPassCandidatesWithDetails(activeShareLink.passId);
      const interviews = await storage.getInterviewsByPass(activeShareLink.passId);
      const manager = activeShareLink.managerId ? await storage.getManager(activeShareLink.managerId) : null;
      const interviewSlots = await storage.getInterviewSlotsByPass(activeShareLink.passId);
      const managerPassState = resolveManagerPassState({
        link: activeShareLink,
        pass,
        candidates,
        interviews,
      });
      
      res.json(buildManagerPassPayload({
        shareLink: activeShareLink,
        pass,
        candidates,
        interviews,
        manager,
        interviewSlots,
        managerPassState
      }));
    } catch (error) {
      console.error("Error fetching manager pass:", error);
      res.status(500).json({ error: "Failed to fetch manager pass data" });
    }
  });
  
  // Manager approves JD
  app.post("/api/external/stakeholder-pass/approve-jd", requireSameOrigin, async (req, res) => {
    try {
      const activeShareLink = stakeholderSessionLink(res);
      if (!activeShareLink.managerId) return res.status(403).json({ error: "This actionable Stakeholder Pass is not assigned" });
      
      const pass = await storage.updatePass(activeShareLink.passId, {
        jdStatus: 'approved',
        jdApprovedAt: new Date(),
        jdApprovedBy: activeShareLink.managerId
      });
      await storage.logActivity({
        passId: activeShareLink.passId,
        actorType: "manager",
        actorName: "Hiring Manager",
        action: "manager_request_approved",
        targetType: "share_link",
        targetId: activeShareLink.id,
        details: { managerId: activeShareLink.managerId },
      });
      
      res.json({ message: "JD approved successfully", pass: toManagerPassPassDto(pass) });
    } catch (error) {
      console.error("Error approving JD:", error);
      res.status(500).json({ error: "Failed to approve JD" });
    }
  });
  
  // Manager requests JD changes
  app.post("/api/external/stakeholder-pass/request-jd-changes", requireSameOrigin, async (req, res) => {
    try {
      const activeShareLink = stakeholderSessionLink(res);
      if (!activeShareLink.managerId) return res.status(403).json({ error: "This actionable Stakeholder Pass is not assigned" });
      
      const { feedback } = req.body;
      
      await storage.createManagerFeedback({
        passId: activeShareLink.passId,
        managerId: activeShareLink.managerId!,
        feedbackType: 'jd_changes',
        feedback
      });
      
      const pass = await storage.updatePass(activeShareLink.passId, {
        jdStatus: 'changes_requested'
      });
      await storage.logActivity({
        passId: activeShareLink.passId,
        actorType: "manager",
        actorName: "Hiring Manager",
        action: "manager_request_changes_requested",
        targetType: "share_link",
        targetId: activeShareLink.id,
        details: { managerId: activeShareLink.managerId },
      });
      
      res.json({ message: "Feedback submitted successfully", pass: toManagerPassPassDto(pass) });
    } catch (error) {
      console.error("Error submitting JD feedback:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });
  
  // Manager updates salary range
  app.patch("/api/external/stakeholder-pass/salary-range", requireSameOrigin, async (req, res) => {
    try {
      const activeShareLink = stakeholderSessionLink(res);
      if (!activeShareLink.managerId) return res.status(403).json({ error: "This actionable Stakeholder Pass is not assigned" });
      
      const { salaryRangeMin, salaryRangeMax } = req.body;
      
      const pass = await storage.updatePass(activeShareLink.passId, {
        salaryRangeMin,
        salaryRangeMax
      });
      
      res.json({ message: "Salary range updated", pass: toManagerPassPassDto(pass) });
    } catch (error) {
      console.error("Error updating salary range:", error);
      res.status(500).json({ error: "Failed to update salary range" });
    }
  });
  
  // Manager sets interview availability
  app.post("/api/external/stakeholder-pass/interview-setup", requireSameOrigin, async (req, res) => {
    try {
      const activeShareLink = stakeholderSessionLink(res);
      if (!activeShareLink.managerId) return res.status(403).json({ error: "This actionable Stakeholder Pass is not assigned" });
      const interviewer = await validInterviewer(activeShareLink.managerId);
      if (!interviewer) return res.status(403).json({ error: "Interview availability requires an active interview-eligible stakeholder" });
      
      const { 
        technicalAssessmentRequired,
        interviewFormat,
        interviewRounds,
        interviewDuration,
        availableDates,
        timeSlots,
        additionalInterviewers,
        isPanelInterview,
        location,
        meetingLink,
      } = req.body;
      const setup = z.object({
        availableDates: z.array(z.string().refine(validInterviewDate, "Invalid interview date")).min(1),
        timeSlots: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1),
        interviewDuration: z.coerce.number().int().min(15).max(240),
        interviewFormat: z.enum(["online", "in-person", "hybrid"]),
        location: z.string().max(255).optional().nullable(),
        meetingLink: z.string().url().max(500).optional().nullable(),
      }).parse({ availableDates, timeSlots, interviewDuration, interviewFormat, location, meetingLink });

      let slots;
      try {
        slots = setup.availableDates.flatMap((date) => setup.timeSlots.map((startTime) => ({
          passId: activeShareLink.passId,
          slotDate: date,
          startTime,
          endTime: interviewEndTime(startTime, setup.interviewDuration),
          duration: setup.interviewDuration,
          format: setup.interviewFormat,
          location: setup.location,
          meetingLink: setup.meetingLink,
          interviewerId: interviewer.id,
        })));
      } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid interview availability" });
      }

      await storage.configureInterviewSetup(activeShareLink.passId, {
        technicalAssessmentRequired,
        interviewFormat,
        interviewRounds,
        interviewDuration,
        isPanelInterview,
        interviewSetupCompleted: true
      }, slots);
      
      // Add additional panel interviewers
      if (additionalInterviewers && additionalInterviewers.length > 0) {
        for (const interviewerId of additionalInterviewers) {
          await storage.createPanelInterviewer({
            passId: activeShareLink.passId,
            managerId: interviewerId
          });
        }
      }
      await storage.logActivity({
        passId: activeShareLink.passId,
        actorType: "manager",
        actorName: "Hiring Manager",
        action: "manager_interview_setup_completed",
        targetType: "share_link",
        targetId: activeShareLink.id,
        details: { managerId: activeShareLink.managerId, interviewFormat, interviewRounds },
      });
      
      res.json({ message: "Interview setup completed" });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error setting up interviews:", error);
      res.status(500).json({ error: "Failed to set up interviews" });
    }
  });
  
  // Manager shortlists candidate
  app.post("/api/external/stakeholder-pass/candidates/:candidateId/shortlist", requireSameOrigin, async (req, res) => {
    try {
      const activeShareLink = stakeholderSessionLink(res);
      if (!activeShareLink.managerId) return res.status(403).json({ error: "This actionable Stakeholder Pass is not assigned" });
      const passCandidate = await storage.getPassCandidateById(parseInt(req.params.candidateId));
      if (!isPassScopedCandidate(activeShareLink.passId, passCandidate)) {
        return res.status(404).json({ error: "Candidate is not available for this Manager Pass" });
      }
      
      const pass = await storage.getPass(activeShareLink.passId);
      const targetStatus = pass ? nextConfiguredStage(passCandidate!.status || "new", pass.enabledStages) : null;
      if (!targetStatus) return res.status(400).json({ error: "Candidate cannot advance from the current configured stage" });
      const updatedPassCandidate = await storage.updatePassCandidate(passCandidate!.id, {
        status: targetStatus,
        shortlistedAt: new Date()
      });
      await storage.logActivity({
        passId: activeShareLink.passId,
        actorType: "manager",
        actorName: "Hiring Manager",
        action: "manager_candidate_shortlisted",
        targetType: "pass_candidate",
        targetId: passCandidate!.id,
        details: { managerId: activeShareLink.managerId },
      });
      
      res.json({ message: "Candidate shortlisted", passCandidate: updatedPassCandidate });
    } catch (error) {
      console.error("Error shortlisting candidate:", error);
      res.status(500).json({ error: "Failed to shortlist candidate" });
    }
  });
  
  // Manager rejects candidate
  app.post("/api/external/stakeholder-pass/candidates/:candidateId/reject", requireSameOrigin, async (req, res) => {
    try {
      const activeShareLink = stakeholderSessionLink(res);
      if (!activeShareLink.managerId) return res.status(403).json({ error: "This actionable Stakeholder Pass is not assigned" });
      const existingPassCandidate = await storage.getPassCandidateById(parseInt(req.params.candidateId));
      if (!isPassScopedCandidate(activeShareLink.passId, existingPassCandidate)) {
        return res.status(404).json({ error: "Candidate is not available for this Manager Pass" });
      }
      
      const { reason, notes } = req.body;
      
      const passCandidate = await storage.updatePassCandidate(existingPassCandidate!.id, {
        status: 'rejected',
        rejectionReason: reason,
        rejectionNotes: notes,
        rejectedAt: new Date()
      });
      await storage.logActivity({
        passId: activeShareLink.passId,
        actorType: "manager",
        actorName: "Hiring Manager",
        action: "manager_candidate_rejected",
        targetType: "pass_candidate",
        targetId: existingPassCandidate!.id,
        details: { managerId: activeShareLink.managerId, reason: reason || null },
      });
      
      res.json({ message: "Candidate rejected", passCandidate });
    } catch (error) {
      console.error("Error rejecting candidate:", error);
      res.status(500).json({ error: "Failed to reject candidate" });
    }
  });
  
  // Manager submits interview evaluation
  app.post("/api/external/stakeholder-pass/evaluations", requireSameOrigin, async (req, res) => {
    try {
      const activeShareLink = stakeholderSessionLink(res);
      if (!activeShareLink.managerId) return res.status(403).json({ error: "This actionable Stakeholder Pass is not assigned" });
      const interview = await storage.getInterview(req.body.interviewId);
      if (!isPassScopedInterview(activeShareLink.passId, interview)) {
        return res.status(404).json({ error: "Interview is not available for this Manager Pass" });
      }
      
      const input = z.object({
        interviewId: z.number().int().positive(),
        recommendation: z.string().min(1).max(50),
        notesObservations: z.string().min(1).max(5000),
        finalComments: z.string().max(5000).optional(),
      }).parse(req.body);
      const evaluation = await storage.submitInterviewEvaluation({ ...input, evaluatorId: activeShareLink.managerId }, interview!.passCandidateId);
      await storage.logActivity({
        passId: activeShareLink.passId,
        actorType: "manager",
        actorName: "Hiring Manager",
        action: "manager_evaluation_submitted",
        targetType: "interview",
        targetId: interview!.id,
        details: { managerId: activeShareLink.managerId, recommendation: req.body.recommendation || null },
      });
      res.status(201).json(evaluation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error submitting evaluation:", error);
      res.status(500).json({ error: "Failed to submit evaluation" });
    }
  });
  
  // Manager makes final decision on candidates
  app.post("/api/external/stakeholder-pass/final-decisions", requireSameOrigin, async (req, res) => {
    try {
      const activeShareLink = stakeholderSessionLink(res);
      if (!activeShareLink.managerId) return res.status(403).json({ error: "This actionable Stakeholder Pass is not assigned" });
      const pass = await storage.getPass(activeShareLink.passId);
      if (!pass) return res.status(404).json({ error: "Pass not found" });
      
      const { decisions } = req.body; // Array of { passCandidateId, decision: 'hire' | 'reserve' | 'reject', notes }
      
      for (const { passCandidateId, decision, notes } of decisions) {
        const passCandidate = await storage.getPassCandidateById(passCandidateId);
        if (!isPassScopedCandidate(activeShareLink.passId, passCandidate)) {
          return res.status(404).json({ error: "Candidate is not available for this Manager Pass" });
        }
        if (decision === 'hire') {
          await storage.updatePassCandidate(passCandidateId, {
            status: configuredStages(pass.enabledStages).includes("offer") ? 'offer' : 'hired',
            selectionNotes: notes
          });
        } else if (decision === 'reject') {
          await storage.updatePassCandidate(passCandidateId, {
            status: 'rejected',
            rejectionReason: 'Not selected after interview',
            rejectionNotes: notes,
            rejectedAt: new Date()
          });
        } else if (decision === 'reserve') {
          const stages = configuredStages(pass.enabledStages);
          const interviewIndex = stages.indexOf("interview");
          const reserveStage = interviewIndex > 0 ? stages[interviewIndex - 1] : "new";
          await storage.updatePassCandidate(passCandidateId, {
            status: reserveStage,
            selectionNotes: `RESERVE: ${notes || ''}`
          });
        }
        await storage.logActivity({
          passId: activeShareLink.passId,
          actorType: "manager",
          actorName: "Hiring Manager",
          action: "manager_final_decision_submitted",
          targetType: "pass_candidate",
          targetId: passCandidateId,
          details: { managerId: activeShareLink.managerId, decision },
        });
      }
      
      res.json({ message: "Final decisions submitted" });
    } catch (error) {
      console.error("Error submitting final decisions:", error);
      res.status(500).json({ error: "Failed to submit final decisions" });
    }
  });
  
  // ============ CANDIDATE PASS ROUTES (scoped external session) ============

  app.post("/api/external/candidate-pass/session", requireSameOrigin, async (req, res) => {
    const token = req.body?.token;
    if (!isExternalPassToken("candidate", token)) return res.status(404).json({ error: "Invalid or inactive link" });
    const candidateLink = await storage.getCandidateLinkByToken(token);
    const access = resolvePassAccess(candidateLink, { inactive: "Invalid or inactive link", expired: "Link has expired" });
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    setExternalPassSession(res, "candidate", access.link);
    res.status(204).end();
  });
  app.use("/api/external/candidate-pass", requireExternalCandidateSession());

  // Get Candidate Pass data from the scoped session.
  app.get("/api/external/candidate-pass", async (req, res) => {
    try {
      const activeCandidateLink = candidateSessionLink(res);
      
      const passCandidate = await storage.getPassCandidateById(activeCandidateLink.passCandidateId);
      if (!passCandidate) {
        return res.status(404).json({ error: "Candidate application not found" });
      }
      
      const candidate = await storage.getCandidate(passCandidate.candidateId);
      const pass = await storage.getPass(passCandidate.passId);
      const messages = await storage.getCandidateMessages(activeCandidateLink.passCandidateId);
      const documents = await storage.getCandidateDocuments(activeCandidateLink.passCandidateId);
      const timeline = await storage.getCandidateTimelineEvents(activeCandidateLink.passCandidateId);
      const interviews = await storage.getInterviewsByPassCandidate(activeCandidateLink.passCandidateId);
      const offer = await storage.getOfferByPassCandidate(activeCandidateLink.passCandidateId);
      const interviewSlots = pass ? await storage.getAvailableInterviewSlots(pass.id) : [];
      const activity = pass ? await storage.getActivitiesByPass(pass.id) : [];
      const managerState = pass ? resolveManagerPassState({
        link: { isActive: true, expiresAt: null },
        pass,
        candidates: [{ ...passCandidate, candidate }],
        interviews,
      }) : null;
      const passState = resolveCandidatePassState({
        link: activeCandidateLink,
        passCandidate,
        pass,
        messages,
        documents,
        interviews,
        offer,
        interviewSlots,
        activity,
        managerPassState: managerState,
      });
      
      res.json(buildCandidatePassPayload({
        candidateLink: activeCandidateLink,
        candidate,
        passCandidate,
        pass,
        messages,
        documents,
        timeline,
        interviews,
        offer,
        interviewSlots,
        passState
      }));
    } catch (error) {
      console.error("Error fetching candidate pass:", error);
      res.status(500).json({ error: "Failed to fetch candidate pass data" });
    }
  });
  
  // Candidate selects interview slot
  app.post("/api/external/candidate-pass/interview-slot", requireSameOrigin, async (req, res) => {
    try {
      const candidateLink = candidateSessionLink(res);
      
      const { slotId } = req.body;
      const passCandidate = await storage.getPassCandidateById(candidateLink.passCandidateId);
      if (!passCandidate) {
        return res.status(404).json({ error: "Candidate application not found" });
      }
      const owningPass = await storage.getPass(passCandidate.passId);
      if (!owningPass || !configuredStages(owningPass.enabledStages).includes("interview")) return res.status(409).json({ error: "Interview is not enabled for this hiring workflow" });

      const availableSlots = await storage.getAvailableInterviewSlots(passCandidate.passId);
      const requestedSlot = availableSlots.find((slot) => slot.id === slotId);
      if (!isCandidateScopedInterviewSlot(passCandidate.passId, requestedSlot)) {
        return res.status(404).json({ error: "Interview slot is not available for this Candidate Pass" });
      }
      
      const booking = await storage.bookInterviewSlotAndCreateInterview(slotId, candidateLink.passCandidateId, passCandidate.passId);
      if (!booking) {
        return res.status(400).json({ error: "Slot not available" });
      }
      const { slot } = booking;
      if (passCandidate) {
        await storage.logActivity({
          passId: passCandidate.passId,
          actorType: "candidate",
          actorName: "Candidate",
          action: "candidate_interview_slot_booked",
          targetType: "pass_candidate",
          targetId: candidateLink.passCandidateId,
          details: { slotId: slot.id },
        });
      }
      await enqueueCandidateActionEmail({
        passCandidateId: candidateLink.passCandidateId,
        eventKey: `candidate-interview-booked:${slot.id}:${candidateLink.passCandidateId}`,
        subject: "Interview confirmed",
        body: "Your interview time has been confirmed.",
      });
      
      res.json({ message: "Interview slot booked", slot });
    } catch (error) {
      console.error("Error booking interview slot:", error);
      res.status(500).json({ error: "Failed to book interview slot" });
    }
  });
  
  // Candidate uploads document
  app.post("/api/external/candidate-pass/documents", requireSameOrigin, async (req, res) => {
    try {
      const candidateLink = candidateSessionLink(res);
      
      const passCandidate = await storage.getPassCandidateById(candidateLink.passCandidateId);
      if (!passCandidate) {
        return res.status(404).json({ error: "Candidate application not found" });
      }

      const uploadSchema = z.object({
        documentId: z.number().int().positive().optional(),
        docType: z.string().min(1).max(50).optional(),
        label: z.string().min(1).max(255).optional(),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(100).optional(),
        fileDataBase64: z.string().min(1),
      });
      const { documentId, docType, label, fileName, mimeType, fileDataBase64 } = uploadSchema.parse(req.body);

      const documents = await storage.getCandidateDocuments(candidateLink.passCandidateId);
      const requestedDocument = documentId
        ? documents.find((document) => document.id === Number(documentId))
        : documents.find((document) => isPendingDocument(document) && document.docType === docType);
      if (documentId && !requestedDocument) {
        return res.status(404).json({ error: "Document request is not available for this Candidate Pass" });
      }
      if (requestedDocument && !isPendingDocument(requestedDocument)) {
        return res.status(409).json({ error: "Document request has already been completed" });
      }

      let storedUpload: Awaited<ReturnType<typeof storeCandidateDocumentUpload>>;
      try {
        storedUpload = await storeCandidateDocumentUpload({
          passCandidateId: candidateLink.passCandidateId,
          documentId: requestedDocument?.id || 0,
          fileName,
          mimeType,
          fileDataBase64,
        });
      } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid document upload" });
      }

      const resolvedDocType = requestedDocument?.docType || docType;
      const resolvedLabel = requestedDocument?.label || label;
      if (!resolvedDocType || !resolvedLabel) {
        await removeStoredCandidateDocument(storedUpload.storageKey);
        return res.status(400).json({ error: "Document type and label are required" });
      }

      const documentData = {
        docType: resolvedDocType,
        label: resolvedLabel,
        fileName: storedUpload.originalName,
        filePath: storedUpload.storageKey,
        fileSize: storedUpload.size,
        status: 'uploaded',
        uploadedAt: new Date()
      };

      const document = requestedDocument
        ? await storage.updateCandidateDocument(requestedDocument.id, documentData)
        : await storage.createCandidateDocument({
            passCandidateId: candidateLink.passCandidateId,
            ...documentData,
          });
      if (!document) {
        await removeStoredCandidateDocument(storedUpload.storageKey);
        return res.status(500).json({ error: "Failed to record candidate document" });
      }
      if (requestedDocument?.filePath && requestedDocument.filePath !== storedUpload.storageKey) {
        await removeStoredCandidateDocument(requestedDocument.filePath);
      }
      await storage.logActivity({
        passId: passCandidate.passId,
        actorType: "candidate",
        actorName: "Candidate",
        action: "candidate_document_submitted",
        targetType: "candidate_document",
        targetId: document.id,
        details: { passCandidateId: candidateLink.passCandidateId, docType: document.docType },
      });
      
      res.status(201).json(document);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error uploading document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  app.get("/api/pass-candidates/:id/documents/:documentId/download", async (req, res) => {
    try {
      const passCandidateId = parsePositiveId(req.params.id);
      const documentId = parsePositiveId(req.params.documentId);
      if (!passCandidateId || !documentId) {
        return res.status(400).json({ error: "Valid candidate/document IDs are required" });
      }
      const documents = await storage.getCandidateDocuments(passCandidateId);
      const document = documents.find((item) => item.id === documentId && item.passCandidateId === passCandidateId);
      if (!document?.filePath || document.status !== "uploaded") {
        return res.status(404).json({ error: "Document file not found" });
      }
      const file = await readStoredCandidateDocument(document.filePath);
      const lowerName = (document.fileName || "").toLowerCase();
      const contentType = lowerName.endsWith(".png")
        ? "image/png"
        : lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")
          ? "image/jpeg"
          : "application/pdf";
      setSafeDownloadHeaders(res, document.fileName || "document");
      res.type(contentType);
      res.send(file);
    } catch (error) {
      console.error("Error retrieving candidate document:", error);
      res.status(500).json({ error: "Failed to retrieve candidate document" });
    }
  });
  
  // Candidate sends message
  app.post("/api/external/candidate-pass/messages", requireSameOrigin, async (req, res) => {
    try {
      const candidateLink = candidateSessionLink(res);
      
      const passCandidate = await storage.getPassCandidateById(candidateLink.passCandidateId);
      const candidate = passCandidate ? await storage.getCandidate(passCandidate.candidateId) : null;
      
      const { message, attachments } = req.body;
      
      const msg = await storage.createCandidateMessage({
        passCandidateId: candidateLink.passCandidateId,
        senderType: 'candidate',
        senderName: candidate?.name || 'Candidate',
        message,
        attachments
      });
      if (passCandidate) {
        await storage.logActivity({
          passId: passCandidate.passId,
          actorType: "candidate",
          actorName: candidate?.name || "Candidate",
          action: "candidate_message_sent",
          targetType: "candidate_message",
          targetId: msg.id,
          details: { passCandidateId: candidateLink.passCandidateId },
        });
      }
      
      res.status(201).json(msg);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });
  
  // Candidate marks message as read
  app.patch("/api/external/candidate-pass/messages/:messageId/read", requireSameOrigin, async (req, res) => {
    try {
      const candidateLink = candidateSessionLink(res);
      
      const messageId = parseInt(req.params.messageId);
      const messages = await storage.getCandidateMessages(candidateLink.passCandidateId);
      const message = messages.find((candidateMessage) => candidateMessage.id === messageId);
      if (!isCandidateScopedMessage(candidateLink.passCandidateId, message)) {
        return res.status(404).json({ error: "Message is not available for this Candidate Pass" });
      }

      await storage.markMessageAsRead(messageId);
      res.json({ message: "Message marked as read" });
    } catch (error) {
      console.error("Error marking message as read:", error);
      res.status(500).json({ error: "Failed to mark message as read" });
    }
  });
  
  // Candidate responds to offer
  const candidateOfferResponseSchema = z.object({
    response: z.enum(["accept", "negotiate", "decline"]),
    reason: z.string().trim().max(2000).optional(),
    message: z.string().trim().max(2000).optional(),
  }).strict();
  app.post("/api/external/candidate-pass/offer-response", requireSameOrigin, async (req, res) => {
    try {
      const candidateLink = candidateSessionLink(res);

      const { response, reason, message } = candidateOfferResponseSchema.parse(req.body);
      
      const offer = await storage.getOfferByPassCandidate(candidateLink.passCandidateId);
      if (!offer) {
        return res.status(404).json({ error: "No offer found" });
      }
      if (offer.status === "accepted" || offer.status === "declined") {
        return res.status(409).json({ error: "This offer already has a final response" });
      }
      if (offer.status !== "pending" && offer.status !== "negotiating") {
        return res.status(409).json({ error: "This offer is not awaiting a candidate response" });
      }
      const candidateText = response === "negotiate" ? message?.trim() || null : response === "decline" ? reason?.trim() || null : null;
      const updatedOffer = await storage.respondToCandidateOffer(offer, response, candidateText);
      res.json({ message: "Offer response submitted", status: updatedOffer.status });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      if (error instanceof Error && error.message === "Offer is no longer awaiting a response") return res.status(409).json({ error: error.message });
      console.error("Error responding to offer:", error);
      res.status(500).json({ error: "Failed to respond to offer" });
    }
  });
  
  // Candidate confirms assessment completion
  app.post("/api/external/candidate-pass/assessment-complete", requireSameOrigin, async (req, res) => {
    try {
      const candidateLink = candidateSessionLink(res);
      
      const { assessmentType } = req.body; // 'softSkills' | 'technical'
      
      if (assessmentType === 'softSkills') {
        await storage.updatePassCandidate(candidateLink.passCandidateId, {
          softSkillsCompletedAt: new Date()
        });
      } else if (assessmentType === 'technical') {
        await storage.updatePassCandidate(candidateLink.passCandidateId, {
          technicalCompletedAt: new Date()
        });
      }
      const passCandidate = await storage.getPassCandidateById(candidateLink.passCandidateId);
      if (passCandidate) {
        await storage.logActivity({
          passId: passCandidate.passId,
          actorType: "candidate",
          actorName: "Candidate",
          action: "candidate_assessment_completed",
          targetType: "pass_candidate",
          targetId: candidateLink.passCandidateId,
          details: { assessmentType },
        });
      }
      
      res.json({ message: "Assessment completion recorded" });
    } catch (error) {
      console.error("Error recording assessment completion:", error);
      res.status(500).json({ error: "Failed to record assessment completion" });
    }
  });
  
  // ============ HR ACTIONS FOR CANDIDATE PORTAL ============
  
  // HR sends message to candidate
  app.post("/api/pass-candidates/:id/messages", async (req, res) => {
    try {
      const { message, attachments, senderName, senderId } = req.body;
      
      const msg = await storage.createCandidateMessage({
        passCandidateId: parseInt(req.params.id),
        senderType: 'hr',
        senderId,
        senderName: senderName || 'HR Team',
        message,
        attachments
      });
      
      res.status(201).json(msg);
    } catch (error) {
      console.error("Error sending message to candidate:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });
  
  // HR requests document from candidate
  app.post("/api/pass-candidates/:id/document-requests", async (req, res) => {
    try {
      const { docType, label, isRequired, dueDate } = req.body;
      
      const document = await storage.createCandidateDocument({
        passCandidateId: parseInt(req.params.id),
        docType,
        label,
        isRequired: isRequired ?? true,
        status: 'pending',
        dueDate: dueDate ? new Date(dueDate) : undefined
      });
      await enqueueCandidateActionEmail({
        passCandidateId: parseInt(req.params.id),
        eventKey: `candidate-document-requested:${document.id}`,
        subject: "Document requested",
        body: `The hiring team has requested ${label || docType || "a document"}.`,
      });
      
      res.status(201).json(document);
    } catch (error) {
      console.error("Error creating document request:", error);
      res.status(500).json({ error: "Failed to create document request" });
    }
  });
  
  // HR shares document with candidate
  app.post("/api/pass-candidates/:id/documents/from-hr", async (req, res) => {
    try {
      const { docType, label, fileName, filePath } = req.body;
      
      const document = await storage.createCandidateDocument({
        passCandidateId: parseInt(req.params.id),
        docType,
        label,
        fileName,
        filePath,
        isFromHr: true,
        status: 'uploaded',
        uploadedAt: new Date()
      });
      
      res.status(201).json(document);
    } catch (error) {
      console.error("Error sharing document with candidate:", error);
      res.status(500).json({ error: "Failed to share document" });
    }
  });
  
  // Generate candidate portal link
  app.post("/api/pass-candidates/:id/generate-link", async (req, res) => {
    try {
      const passCandidateId = parseInt(req.params.id);
      const { expiresAt } = req.body;
      
      // Generate a unique token
      const token = createCandidatePassToken();
      
      const link = await storage.createCandidateLink({
        token,
        passCandidateId,
        canFillApplication: true,
        canTakeAssessment: true,
        expiresAt: expiresAt ? new Date(expiresAt) : defaultExpiry(),
        isActive: true
      });
      const passCandidate = await storage.getPassCandidateById(passCandidateId);
      const candidate = passCandidate ? await storage.getCandidate(passCandidate.candidateId) : undefined;
      const pass = passCandidate ? await storage.getPass(passCandidate.passId) : undefined;
      await enqueueEmailSafely({
        eventKey: `candidate-pass-reissued:${link.id}`,
        to: candidate?.email,
        recipientName: candidate?.name,
        subject: `Candidate Pass${pass?.positionTitle ? `: ${pass.positionTitle}` : ""}`,
        bodyText: `A Candidate Pass is available for your application${pass?.positionTitle ? ` for ${pass.positionTitle}` : ""}.\n\nOpen your Candidate Pass: ${publicAppUrl(externalPassLandingPath("candidate", link.token)) || "Ask the hiring team for your Candidate Pass link."}`,
      });
      
      res.status(201).json(link);
    } catch (error) {
      console.error("Error generating candidate link:", error);
      res.status(500).json({ error: "Failed to generate link" });
    }
  });

  // ============ ONBOARDING PORTAL ROUTES ============
  
  const STAGE_NAMES: Record<number, string> = {
    1: "Document Collection",
    2: "Medical Examination",
    3: "Visa Processing",
    4: "Contract Generation",
    5: "Emirates ID Application",
    6: "Bank Account Setup",
    7: "IT Setup & Access",
    8: "Orientation & Training",
    9: "Department Onboarding"
  };
  
  const VALID_TASK_IDS = ["documents", "medical", "visa", "contract", "emirates_id", "bank", "it_setup", "training", "department"];
  
  // Get onboarding portal data by token
  app.get("/api/onboarding-portal/:token", async (req, res) => {
    try {
      const link = await storage.getOnboardingLinkByToken(req.params.token);
      if (!link || !link.isActive) {
        return res.status(404).json({ error: "Invalid or expired link" });
      }
      
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        return res.status(404).json({ error: "Link has expired" });
      }
      
      // Update access count
      await storage.updateOnboardingLinkAccess(link.id);
      
      const onboardingRecord = await storage.getOnboardingRecordById(link.onboardingRecordId);
      if (!onboardingRecord) {
        return res.status(404).json({ error: "Onboarding record not found" });
      }
      
      const passCandidate = await storage.getPassCandidate(onboardingRecord.passCandidateId);
      if (!passCandidate) {
        return res.status(404).json({ error: "Pass candidate not found" });
      }
      
      const candidate = await storage.getCandidate(passCandidate.candidateId);
      const pass = await storage.getPass(passCandidate.passId);
      const offers = await storage.getOffersByPassCandidate(passCandidate.id);
      
      // Initialize Stage 1 if no stages exist yet
      let stageProgress = await storage.getOnboardingStageProgress(onboardingRecord.id);
      if (stageProgress.length === 0) {
        await storage.createOnboardingStageProgress({
          onboardingRecordId: onboardingRecord.id,
          stageNumber: 1,
          stageName: STAGE_NAMES[1],
          status: 'in_progress',
          startedAt: new Date()
        });
        stageProgress = await storage.getOnboardingStageProgress(onboardingRecord.id);
      }
      
      res.json({
        onboardingLink: link,
        onboardingRecord,
        stageProgress,
        candidate,
        pass,
        offer: offers[0] || null
      });
    } catch (error) {
      console.error("Error fetching onboarding portal data:", error);
      res.status(500).json({ error: "Failed to fetch onboarding data" });
    }
  });
  
  // Complete a task in a stage
  app.post("/api/onboarding-portal/:token/complete-task", async (req, res) => {
    try {
      const link = await storage.getOnboardingLinkByToken(req.params.token);
      if (!link || !link.isActive) {
        return res.status(404).json({ error: "Invalid link" });
      }
      
      // Validate request body
      const completeTaskSchema = z.object({
        stageNumber: z.number().int().min(1).max(9),
        taskId: z.enum(["documents", "medical", "visa", "contract", "emirates_id", "bank", "it_setup", "training", "department"])
      });
      
      const parseResult = completeTaskSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request data", details: parseResult.error.errors });
      }
      
      const { stageNumber, taskId } = parseResult.data;
      
      const onboardingRecord = await storage.getOnboardingRecordById(link.onboardingRecordId);
      if (!onboardingRecord) {
        return res.status(404).json({ error: "Onboarding record not found" });
      }
      
      // Get or create stage progress
      const stage = await storage.getOrCreateStageProgress(
        onboardingRecord.id,
        stageNumber,
        STAGE_NAMES[stageNumber]
      );
      
      // Mark stage as completed
      await storage.updateOnboardingStageProgress(stage.id, {
        status: 'completed',
        completedAt: new Date()
      });
      
      // Unlock next stage if exists
      if (stageNumber < 9) {
        await storage.getOrCreateStageProgress(
          onboardingRecord.id,
          stageNumber + 1,
          STAGE_NAMES[stageNumber + 1]
        );
        const stages = await storage.getOnboardingStageProgress(onboardingRecord.id);
        const nextStage = stages.find(s => s.stageNumber === stageNumber + 1);
        if (nextStage && nextStage.status === 'locked') {
          await storage.updateOnboardingStageProgress(nextStage.id, {
            status: 'in_progress',
            startedAt: new Date()
          });
        }
      }
      
      // Check if all stages are completed
      const allStages = await storage.getOnboardingStageProgress(onboardingRecord.id);
      const completedCount = allStages.filter(s => s.status === 'completed').length;
      if (completedCount >= 9) {
        await storage.updateOnboardingRecord(onboardingRecord.id, {
          status: 'completed',
          completedAt: new Date()
        });
      }
      
      res.json({ message: "Task completed", stageNumber, taskId });
    } catch (error) {
      console.error("Error completing task:", error);
      res.status(500).json({ error: "Failed to complete task" });
    }
  });
  
  // Sign contract
  app.post("/api/onboarding-portal/:token/sign-contract", async (req, res) => {
    try {
      const link = await storage.getOnboardingLinkByToken(req.params.token);
      if (!link || !link.isActive) {
        return res.status(404).json({ error: "Invalid link" });
      }
      
      // Validate request body
      const signContractSchema = z.object({
        signatureName: z.string().min(2, "Signature name must be at least 2 characters")
      });
      
      const parseResult = signContractSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request data", details: parseResult.error.errors });
      }
      
      const { signatureName } = parseResult.data;
      
      const onboardingRecord = await storage.getOnboardingRecordById(link.onboardingRecordId);
      if (!onboardingRecord) {
        return res.status(404).json({ error: "Onboarding record not found" });
      }
      
      // Complete stage 4 (Contract Generation)
      const stage = await storage.getOrCreateStageProgress(
        onboardingRecord.id,
        4,
        STAGE_NAMES[4]
      );
      
      await storage.updateOnboardingStageProgress(stage.id, {
        status: 'completed',
        stageData: { signedBy: signatureName, signedAt: new Date().toISOString() },
        completedAt: new Date()
      });
      
      // Unlock stage 5
      await storage.getOrCreateStageProgress(
        onboardingRecord.id,
        5,
        STAGE_NAMES[5]
      );
      const stages = await storage.getOnboardingStageProgress(onboardingRecord.id);
      const nextStage = stages.find(s => s.stageNumber === 5);
      if (nextStage && nextStage.status === 'locked') {
        await storage.updateOnboardingStageProgress(nextStage.id, {
          status: 'in_progress',
          startedAt: new Date()
        });
      }
      
      res.json({ message: "Contract signed successfully" });
    } catch (error) {
      console.error("Error signing contract:", error);
      res.status(500).json({ error: "Failed to sign contract" });
    }
  });
  
  // Upload document
  app.post("/api/onboarding-portal/:token/upload-document", async (req, res) => {
    try {
      const link = await storage.getOnboardingLinkByToken(req.params.token);
      if (!link || !link.isActive) {
        return res.status(404).json({ error: "Invalid link" });
      }
      
      // Validate request body
      const uploadDocSchema = z.object({
        stageNumber: z.number().int().min(1).max(9),
        docType: z.string().min(1),
        fileName: z.string().min(1)
      });
      
      const parseResult = uploadDocSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request data", details: parseResult.error.errors });
      }
      
      const { stageNumber, docType, fileName } = parseResult.data;
      
      const onboardingRecord = await storage.getOnboardingRecordById(link.onboardingRecordId);
      if (!onboardingRecord) {
        return res.status(404).json({ error: "Onboarding record not found" });
      }
      
      const stage = await storage.getOrCreateStageProgress(
        onboardingRecord.id,
        stageNumber,
        STAGE_NAMES[stageNumber]
      );
      
      // Update documents uploaded (just log it for now - real implementation would store files)
      const currentDocs = (stage.documentsUploaded as any[]) || [];
      currentDocs.push({
        docType,
        fileName,
        uploadedAt: new Date().toISOString()
      });
      
      await storage.updateOnboardingStageProgress(stage.id, {
        documentsUploaded: currentDocs
      });
      
      res.json({ message: "Document uploaded", docType, fileName });
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });
  
  // Generate onboarding portal link (HR action)
  app.post("/api/onboarding-records/:id/generate-link", async (req, res) => {
    try {
      const onboardingRecordId = parseInt(req.params.id);
      const { expiresAt } = req.body;
      
      const link = await storage.createOnboardingLink({
        onboardingRecordId,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        isActive: true
      });
      
      res.status(201).json(link);
    } catch (error) {
      console.error("Error generating onboarding link:", error);
      res.status(500).json({ error: "Failed to generate link" });
    }
  });

  // ============ ACTIVITY LOG ROUTES ============
  app.get("/api/passes/:passId/activities", async (req, res) => {
    try {
      const activities = await storage.getActivitiesByPass(parseInt(req.params.passId));
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });

  // ============ DOCUMENT/RESUME UPLOAD ROUTES ============
  app.post("/api/candidates/:id/resume", async (req, res) => {
    res.status(410).json({ error: "Legacy text-resume upload is disabled; use the secure candidate CV endpoint" });
  });

  // ============ AI ROUTES ============
  
  // AI Agent Tools Definition
  const aiAgentTools: any[] = [
    {
      name: "create_recruitment_pass",
      description: "Create a new recruitment pass (job requisition) in the system. Use this when the user wants to start hiring for a new position.",
      input_schema: {
        type: "object",
        properties: {
          positionTitle: { type: "string", description: "The job title for the position" },
          department: { type: "string", description: "Department name (e.g., Engineering, Sales, Marketing, Finance, Operations, HR, Executive)" },
          location: { type: "string", description: "Work location, default is the configured work location" },
          employmentType: { type: "string", enum: ["Full-time", "Part-time", "Contract", "Temporary"], description: "Type of employment" },
          headcount: { type: "number", description: "Number of positions to fill, default is 1" },
          experienceMin: { type: "number", description: "Minimum years of experience required" },
          experienceMax: { type: "number", description: "Maximum years of experience" },
          salaryRangeMin: { type: "number", description: "Minimum salary in AED" },
          salaryRangeMax: { type: "number", description: "Maximum salary in AED" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Hiring priority level" },
          notes: { type: "string", description: "Additional notes about the position" }
        },
        required: ["positionTitle", "department"]
      }
    },
    {
      name: "add_candidate",
      description: "Add a new candidate to the system. Use this when the user wants to add a person to the candidate database.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Full name of the candidate" },
          email: { type: "string", description: "Email address" },
          phone: { type: "string", description: "Phone number" },
          currentTitle: { type: "string", description: "Current job title" },
          currentCompany: { type: "string", description: "Current employer" },
          experienceYears: { type: "number", description: "Years of experience" },
          skills: { type: "array", items: { type: "string" }, description: "List of skills" },
          currentLocation: { type: "string", description: "Current location" },
          expectedSalary: { type: "number", description: "Expected salary in AED" },
          source: { type: "string", description: "How the candidate was found (e.g., LinkedIn, Referral, Direct)" }
        },
        required: ["name"]
      }
    },
    {
      name: "link_candidate_to_pass",
      description: "Link an existing candidate to a recruitment pass, adding them to the hiring pipeline for that position.",
      input_schema: {
        type: "object",
        properties: {
          candidateId: { type: "number", description: "The ID of the candidate" },
          passId: { type: "number", description: "The ID of the recruitment pass" },
          status: { type: "string", enum: ["new", "screening", "shortlisted", "interview", "offer", "hired", "rejected"], description: "Initial status in the pipeline" }
        },
        required: ["candidateId", "passId"]
      }
    },
    {
      name: "update_candidate_status",
      description: "Move a candidate to a different stage in the recruitment pipeline.",
      input_schema: {
        type: "object",
        properties: {
          passCandidateId: { type: "number", description: "The ID of the pass-candidate link" },
          newStatus: { type: "string", enum: ["new", "screening", "shortlisted", "interview", "offer", "hired", "rejected"], description: "The new status" },
          notes: { type: "string", description: "Optional notes about the status change" }
        },
        required: ["passCandidateId", "newStatus"]
      }
    },
    {
      name: "schedule_interview",
      description: "Schedule an interview for a candidate.",
      input_schema: {
        type: "object",
        properties: {
          passCandidateId: { type: "number", description: "The ID of the pass-candidate link" },
          interviewDate: { type: "string", description: "Date and time of the interview (ISO format)" },
          interviewType: { type: "string", enum: ["phone", "video", "in-person", "technical", "panel"], description: "Type of interview" },
          stage: { type: "string", enum: ["initial", "technical", "hr", "final", "cultural"], description: "Interview stage" },
          location: { type: "string", description: "Location or video call link" },
          interviewerIds: { type: "array", items: { type: "number" }, description: "IDs of interviewers (managers)" },
          notes: { type: "string", description: "Interview notes or instructions" }
        },
        required: ["passCandidateId", "interviewDate", "interviewType", "stage"]
      }
    },
    {
      name: "generate_job_description",
      description: "Generate a professional job description for a recruitment pass and save it.",
      input_schema: {
        type: "object",
        properties: {
          passId: { type: "number", description: "The ID of the recruitment pass" }
        },
        required: ["passId"]
      }
    },
    {
      name: "list_passes",
      description: "Get a list of all recruitment passes in the system to show current openings.",
      input_schema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "open", "on_hold", "filled", "cancelled"], description: "Filter by status (optional)" }
        }
      }
    },
    {
      name: "list_candidates",
      description: "Get a list of candidates, optionally filtered by pass or search term.",
      input_schema: {
        type: "object",
        properties: {
          passId: { type: "number", description: "Filter by recruitment pass ID (optional)" },
          searchTerm: { type: "string", description: "Search by name (optional)" }
        }
      }
    },
    {
      name: "get_pass_details",
      description: "Get detailed information about a specific recruitment pass including candidates.",
      input_schema: {
        type: "object",
        properties: {
          passId: { type: "number", description: "The ID of the recruitment pass" }
        },
        required: ["passId"]
      }
    },
    {
      name: "get_analytics",
      description: "Get recruitment analytics and statistics.",
      input_schema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "create_offer",
      description: "Create a job offer for a candidate who has been selected for hire.",
      input_schema: {
        type: "object",
        properties: {
          passCandidateId: { type: "number", description: "The ID of the pass-candidate link" },
          positionTitle: { type: "string", description: "Job title for the offer" },
          baseSalary: { type: "number", description: "Base monthly salary in AED" },
          startDate: { type: "string", description: "Proposed start date (YYYY-MM-DD)" },
          benefits: { type: "string", description: "Benefits package description" },
          notes: { type: "string", description: "Additional offer notes" }
        },
        required: ["passCandidateId", "positionTitle", "baseSalary"]
      }
    },
    {
      name: "score_candidate",
      description: "Use AI to score a candidate against a recruitment pass requirements. Returns a score 0-100 with breakdown.",
      input_schema: {
        type: "object",
        properties: {
          passCandidateId: { type: "number", description: "The ID of the pass-candidate link to score" }
        },
        required: ["passCandidateId"]
      }
    },
    {
      name: "shortlist_candidate",
      description: "Move a candidate to the shortlisted stage.",
      input_schema: {
        type: "object",
        properties: {
          passCandidateId: { type: "number", description: "The ID of the pass-candidate link" },
          notes: { type: "string", description: "Reason for shortlisting" }
        },
        required: ["passCandidateId"]
      }
    },
    {
      name: "reject_candidate",
      description: "Reject a candidate from a recruitment pass.",
      input_schema: {
        type: "object",
        properties: {
          passCandidateId: { type: "number", description: "The ID of the pass-candidate link" },
          reason: { type: "string", description: "Reason for rejection" }
        },
        required: ["passCandidateId"]
      }
    },
    {
      name: "get_managers",
      description: "Get a list of managers who can be interviewers or hiring managers.",
      input_schema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "update_pass_status",
      description: "Update the status of a recruitment pass (e.g., open it for applications, put on hold, close it).",
      input_schema: {
        type: "object",
        properties: {
          passId: { type: "number", description: "The ID of the recruitment pass" },
          status: { type: "string", enum: ["draft", "open", "on_hold", "filled", "cancelled"], description: "New status" }
        },
        required: ["passId", "status"]
      }
    },
    {
      name: "compare_candidates",
      description: "Compare multiple candidates side-by-side for a specific recruitment pass. Provides detailed comparison of skills, experience, fit, and recommendation.",
      input_schema: {
        type: "object",
        properties: {
          passId: { type: "number", description: "The recruitment pass ID to compare candidates for" },
          candidateIds: { type: "array", items: { type: "number" }, description: "Array of candidate IDs to compare (2-5 candidates)" }
        },
        required: ["passId"]
      }
    },
    {
      name: "analyze_ideal_candidate",
      description: "Analyze a job description and provide detailed profile of the ideal candidate including skills, experience, personality traits, and what to look for in interviews.",
      input_schema: {
        type: "object",
        properties: {
          passId: { type: "number", description: "The recruitment pass ID to analyze" }
        },
        required: ["passId"]
      }
    },
    {
      name: "uae_recruitment_advice",
      description: "Get market-specific recruitment advice including salary benchmarks, employment considerations, notice periods, and market insights for a specific role.",
      input_schema: {
        type: "object",
        properties: {
          positionTitle: { type: "string", description: "The job title to get advice for" },
          department: { type: "string", description: "Department (e.g., Engineering, Sales, HR)" },
          experienceLevel: { type: "string", enum: ["entry", "mid", "senior", "executive"], description: "Experience level" },
          topic: { type: "string", enum: ["salary", "visa", "labor_law", "market", "all"], description: "Specific topic or 'all' for comprehensive advice" }
        },
        required: ["positionTitle"]
      }
    },
    {
      name: "draft_candidate_email",
      description: "Draft professional emails to candidates: rejection letters, interview invitations, offer letters, or follow-ups.",
      input_schema: {
        type: "object",
        properties: {
          emailType: { type: "string", enum: ["rejection", "interview_invite", "offer", "followup", "onboarding"], description: "Type of email to draft" },
          candidateName: { type: "string", description: "Candidate's name" },
          positionTitle: { type: "string", description: "Position they applied for" },
          additionalDetails: { type: "string", description: "Additional context (interview date/time, salary for offer, rejection reason, etc.)" }
        },
        required: ["emailType", "candidateName", "positionTitle"]
      }
    },
    {
      name: "hiring_process_advice",
      description: "Get recommendations for hiring timeline, interview process, and best practices based on the role and urgency.",
      input_schema: {
        type: "object",
        properties: {
          passId: { type: "number", description: "The recruitment pass ID (optional, for context)" },
          positionTitle: { type: "string", description: "The job title" },
          urgency: { type: "string", enum: ["urgent", "normal", "flexible"], description: "How urgently the position needs to be filled" },
          question: { type: "string", description: "Specific question about the hiring process (optional)" }
        },
        required: ["positionTitle"]
      }
    },
    {
      name: "generate_interview_questions",
      description: "Generate tailored interview questions based on the role, focusing on technical skills, behavioral competencies, and cultural fit.",
      input_schema: {
        type: "object",
        properties: {
          passId: { type: "number", description: "Recruitment pass ID for context" },
          interviewType: { type: "string", enum: ["screening", "technical", "behavioral", "cultural", "final"], description: "Type of interview" },
          focusAreas: { type: "array", items: { type: "string" }, description: "Specific areas to focus on" }
        },
        required: ["passId", "interviewType"]
      }
    }
  ];

  // Tool execution handler
  async function executeAiTool(toolName: string, toolInput: any): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      switch (toolName) {
        case "create_recruitment_pass": {
          const pass = await storage.createPass({
            positionTitle: toolInput.positionTitle,
            department: toolInput.department || "General",
            location: toolInput.location || "Configured work location",
            employmentType: toolInput.employmentType || "Full-time",
            headcount: toolInput.headcount || 1,
            experienceMin: toolInput.experienceMin,
            experienceMax: toolInput.experienceMax,
            salaryRangeMin: toolInput.salaryRangeMin,
            salaryRangeMax: toolInput.salaryRangeMax,
            salaryCurrency: "AED",
            priority: toolInput.priority || "medium",
            notes: toolInput.notes || "",
            status: "draft",
            currentStep: "request"
          });
          return { success: true, result: { message: `Created recruitment pass ${pass.passId} for ${toolInput.positionTitle}`, pass } };
        }

        case "add_candidate": {
          const candidate = await storage.createCandidate({
            name: toolInput.name,
            email: toolInput.email || null,
            phone: toolInput.phone || null,
            currentTitle: toolInput.currentTitle || null,
            currentCompany: toolInput.currentCompany || null,
            experienceYears: toolInput.experienceYears || null,
            skills: toolInput.skills || [],
            currentLocation: toolInput.currentLocation || null,
            expectedSalary: toolInput.expectedSalary || null,
            source: toolInput.source || "AI Assistant",
            inTalentPool: false
          });
          return { success: true, result: { message: `Added candidate ${toolInput.name} to the system`, candidate } };
        }

        case "link_candidate_to_pass": {
          const owningPass = await storage.getPass(toolInput.passId);
          const requestedStatus = toolInput.status || "new";
          if (!owningPass || !allowedCandidateStatus(requestedStatus, owningPass.enabledStages)) return { success: false, error: "Status is not enabled for this hiring workflow" };
          const passCandidate = await storage.addCandidateToPass({
            passId: toolInput.passId,
            candidateId: toolInput.candidateId,
            status: requestedStatus
          });
          return { success: true, result: { message: `Linked candidate to recruitment pass`, passCandidate } };
        }

        case "update_candidate_status": {
          const existing = await storage.getPassCandidateById(toolInput.passCandidateId);
          const owningPass = existing ? await storage.getPass(existing.passId) : null;
          if (!existing || !owningPass || !allowedCandidateStatus(toolInput.newStatus, owningPass.enabledStages)) return { success: false, error: "Status is not enabled for this hiring workflow" };
          const updated = await storage.updatePassCandidate(toolInput.passCandidateId, {
            status: toolInput.newStatus
          });
          return { success: true, result: { message: `Updated candidate status to ${toolInput.newStatus}`, updated } };
        }

        case "schedule_interview": {
          // Get the pass ID from the pass-candidate link
          const passCandidate = await storage.getPassCandidate(toolInput.passCandidateId);
          if (!passCandidate) {
            return { success: false, error: "Pass-candidate link not found" };
          }
          const interview = await storage.createInterview({
            passId: passCandidate.passId,
            passCandidateId: toolInput.passCandidateId,
            interviewDate: toolInput.interviewDate,
            startTime: "09:00",
            endTime: "10:00",
            duration: 60,
            format: toolInput.interviewType,
            location: toolInput.location || "TBD",
            roundName: toolInput.stage,
            status: "scheduled"
          });
          return { success: true, result: { message: `Scheduled ${toolInput.stage} ${toolInput.interviewType} interview`, interview } };
        }

        case "generate_job_description": {
          const pass = await storage.getPass(toolInput.passId);
          if (!pass) {
            return { success: false, error: "Recruitment pass not found" };
          }
          
          const jdMessage = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Generate a professional job description for:
Position: ${pass.positionTitle}
Department: ${pass.department}
Location: ${pass.location}
Employment Type: ${pass.employmentType}
Experience: ${pass.experienceMin || 0}-${pass.experienceMax || 'open'} years
Salary Range: AED ${pass.salaryRangeMin || 'Negotiable'} - ${pass.salaryRangeMax || 'Negotiable'}

Company: Hiring organization
Industry: Atmospheric Water Generation - sustainable water technology

Create a compelling JD with:
1. Brief company intro (1-2 sentences about our water-from-air technology)
2. Role summary
3. Key responsibilities (5-7 bullet points)
4. Required qualifications
5. Preferred qualifications  
6. What we offer

Make it professional and appealing to candidates in the target market.`
            }]
          });
          
          const jdContent = jdMessage.content[0];
          if (jdContent.type === "text") {
            await storage.updatePass(toolInput.passId, {
              jobDescriptionDraft: jdContent.text,
              jdStatus: "pending_review"
            });
            return { success: true, result: { message: "Generated and saved job description", jobDescription: jdContent.text } };
          }
          return { success: false, error: "Failed to generate job description" };
        }

        case "list_passes": {
          let passes = await storage.getPasses();
          if (toolInput.status) {
            passes = passes.filter(p => p.status === toolInput.status);
          }
          return { success: true, result: { passes: passes.map(p => ({ id: p.id, passId: p.passId, title: p.positionTitle, department: p.department, status: p.status, headcount: p.headcount })) } };
        }

        case "list_candidates": {
          let candidates = await storage.getCandidates();
          if (toolInput.searchTerm) {
            const term = toolInput.searchTerm.toLowerCase();
            candidates = candidates.filter(c => c.name.toLowerCase().includes(term));
          }
          if (toolInput.passId) {
            const passCandidates = await storage.getPassCandidates(toolInput.passId);
            const candidateIds = passCandidates.map(pc => pc.candidateId);
            candidates = candidates.filter(c => candidateIds.includes(c.id));
          }
          return { success: true, result: { candidates: candidates.map(c => ({ id: c.id, name: c.name, email: c.email, currentTitle: c.currentTitle, experienceYears: c.experienceYears })) } };
        }

        case "get_pass_details": {
          const pass = await storage.getPass(toolInput.passId);
          if (!pass) {
            return { success: false, error: "Recruitment pass not found" };
          }
          const passCandidates = await storage.getPassCandidates(toolInput.passId);
          const positions = await storage.getPassPositions(toolInput.passId);
          return { success: true, result: { pass, candidateCount: passCandidates.length, positions } };
        }

        case "get_analytics": {
          const passes = await storage.getPasses();
          const candidates = await storage.getCandidates();
          const interviews = await storage.getInterviews();
          return {
            success: true,
            result: {
              totalPasses: passes.length,
              activePasses: passes.filter(p => p.status === "open").length,
              totalCandidates: candidates.length,
              scheduledInterviews: interviews.filter(i => i.status === "scheduled").length,
              passBreakdown: {
                draft: passes.filter(p => p.status === "draft").length,
                open: passes.filter(p => p.status === "open").length,
                filled: passes.filter(p => p.status === "filled").length
              }
            }
          };
        }

        case "create_offer": {
          const passCandidate = await storage.getPassCandidate(Number(toolInput.passCandidateId));
          if (!passCandidate) {
            return { success: false, error: "Pass-candidate link not found" };
          }
          const candidate = await storage.getCandidate(passCandidate.candidateId);
          const offer = await storage.createOffer({
            passId: passCandidate.passId,
            passCandidateId: Number(toolInput.passCandidateId),
            salary: toolInput.baseSalary,
            salaryCurrency: "AED",
            startDate: toolInput.startDate || null,
            benefits: toolInput.benefits ? { description: toolInput.benefits } : null,
            negotiationNotes: toolInput.notes || null,
            status: "draft"
          });
          return { success: true, result: { message: `Created offer for ${candidate?.name || "candidate"} - ${toolInput.positionTitle}`, offer } };
        }

        case "score_candidate": {
          const passCandidate = await storage.getPassCandidate(Number(toolInput.passCandidateId));
          if (!passCandidate) {
            return { success: false, error: "Pass-candidate link not found" };
          }
          const candidate = await storage.getCandidate(passCandidate.candidateId);
          const pass = await storage.getPass(passCandidate.passId);
          if (!candidate || !pass) {
            return { success: false, error: "Candidate or pass not found" };
          }
          
          // Handle skills safely - could be array or empty object
          const skillsArray = Array.isArray(candidate.skills) ? candidate.skills : [];
          
          const scoreMessage = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            messages: [{
              role: "user",
              content: `Score this candidate for the position. Return ONLY a JSON object.
              
Position: ${pass.positionTitle}
Department: ${pass.department}
Required Experience: ${pass.experienceMin || 0}-${pass.experienceMax || 'any'} years

Candidate: ${candidate.name}
Experience: ${candidate.experienceYears || 'unknown'} years
Current Title: ${candidate.currentTitle || 'unknown'}
Skills: ${skillsArray.length > 0 ? skillsArray.join(', ') : 'unknown'}
CV Summary: ${candidate.cvSummary || 'Not available'}

Return JSON: {"score": 0-100, "skillsMatch": 0-100, "experienceMatch": 0-100, "overallFit": "strong/moderate/weak", "strengths": ["..."], "gaps": ["..."]}`
            }]
          });
          
          try {
            const scoreContent = scoreMessage.content[0];
            if (scoreContent.type === "text") {
              const scoreData = JSON.parse(scoreContent.text);
              await storage.updatePassCandidate(Number(toolInput.passCandidateId), {
                aiScore: scoreData.score,
                aiBrief: `${scoreData.overallFit} fit - Strengths: ${scoreData.strengths?.join(', ')}. Gaps: ${scoreData.gaps?.join(', ')}`
              });
              return { success: true, result: { message: `Scored ${candidate.name}: ${scoreData.score}/100 (${scoreData.overallFit} fit)`, score: scoreData } };
            }
          } catch (e) {
            return { success: false, error: "Failed to parse AI scoring response" };
          }
          return { success: false, error: "Failed to score candidate" };
        }

        case "shortlist_candidate": {
          const passCandidate = await storage.getPassCandidate(Number(toolInput.passCandidateId));
          if (!passCandidate) {
            return { success: false, error: "Pass-candidate link not found" };
          }
          const candidate = await storage.getCandidate(passCandidate.candidateId);
          await storage.updatePassCandidate(Number(toolInput.passCandidateId), {
            status: "shortlisted",
            selectionNotes: toolInput.notes || "Shortlisted via AI assistant",
            shortlistedAt: new Date()
          });
          return { success: true, result: { message: `Shortlisted ${candidate?.name || "candidate"}` } };
        }

        case "reject_candidate": {
          const passCandidate = await storage.getPassCandidate(Number(toolInput.passCandidateId));
          if (!passCandidate) {
            return { success: false, error: "Pass-candidate link not found" };
          }
          const candidate = await storage.getCandidate(passCandidate.candidateId);
          await storage.updatePassCandidate(Number(toolInput.passCandidateId), {
            status: "rejected",
            rejectionReason: toolInput.reason || "Rejected via AI assistant",
            rejectedAt: new Date()
          });
          return { success: true, result: { message: `Rejected ${candidate?.name || "candidate"}: ${toolInput.reason || "No reason specified"}` } };
        }

        case "get_managers": {
          const managers = await storage.getManagers();
          return { success: true, result: { managers: managers.filter(m => m.isActive).map(m => ({ id: m.id, name: m.name, email: m.email, jobTitle: m.jobTitle })) } };
        }

        case "update_pass_status": {
          const pass = await storage.getPass(Number(toolInput.passId));
          if (!pass) {
            return { success: false, error: "Recruitment pass not found" };
          }
          await storage.updatePass(Number(toolInput.passId), { status: toolInput.status });
          return { success: true, result: { message: `Updated ${pass.passId} status to ${toolInput.status}` } };
        }

        case "compare_candidates": {
          const pass = await storage.getPass(Number(toolInput.passId));
          if (!pass) {
            return { success: false, error: "Recruitment pass not found" };
          }
          
          const allPassCandidates = await storage.getPassCandidates(Number(toolInput.passId));
          if (allPassCandidates.length < 2) {
            return { success: false, error: "Need at least 2 candidates to compare. This pass has fewer candidates." };
          }
          
          // Use provided candidateIds or default to top 5 candidates
          let passCandidates = allPassCandidates;
          if (toolInput.candidateIds && Array.isArray(toolInput.candidateIds) && toolInput.candidateIds.length >= 2) {
            passCandidates = allPassCandidates.filter(pc => 
              toolInput.candidateIds.includes(pc.candidateId)
            );
          }
          
          // Get candidate details (max 5)
          const candidateDetails = await Promise.all(
            passCandidates.slice(0, 5).map(async (pc) => {
              const candidate = await storage.getCandidate(pc.candidateId);
              return { passCandidate: pc, candidate };
            })
          );
          
          const compareMessage = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Compare these candidates for the ${pass.positionTitle} position at the hiring organization.

Position Requirements:
- Department: ${pass.department}
- Experience: ${pass.experienceMin || 0}-${pass.experienceMax || 'open'} years
- Job Description: ${pass.jobDescriptionDraft || 'Not available'}

Candidates:
${candidateDetails.map((cd, i) => {
  const skills = Array.isArray(cd.candidate?.skills) ? cd.candidate.skills : [];
  return `
${i + 1}. ${cd.candidate?.name || 'Unknown'}
   - Current Title: ${cd.candidate?.currentTitle || 'N/A'}
   - Experience: ${cd.candidate?.experienceYears || 'N/A'} years
   - Skills: ${skills.length > 0 ? skills.join(', ') : 'N/A'}
   - AI Score: ${cd.passCandidate.aiScore || 'Not scored'}
   - Status: ${cd.passCandidate.status}
`;
}).join('')}

Provide a detailed comparison with:
1. Side-by-side strengths/weaknesses table
2. Best fit for the role and why
3. Recommended ranking (1st, 2nd, 3rd choice)
4. Key differentiators between candidates
5. Interview focus areas for each candidate`
            }]
          });
          
          const compareContent = compareMessage.content[0];
          if (compareContent.type === "text") {
            return { success: true, result: { comparison: compareContent.text } };
          }
          return { success: false, error: "Failed to generate comparison" };
        }

        case "analyze_ideal_candidate": {
          const pass = await storage.getPass(Number(toolInput.passId));
          if (!pass) {
            return { success: false, error: "Recruitment pass not found" };
          }
          
          const analyzeMessage = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Analyze this position and describe the ideal candidate profile.

Position: ${pass.positionTitle}
Department: ${pass.department}
Location: ${pass.location}
Employment Type: ${pass.employmentType}
Experience Required: ${pass.experienceMin || 0}-${pass.experienceMax || 'open'} years
Salary Range: AED ${pass.salaryRangeMin || 'Negotiable'} - ${pass.salaryRangeMax || 'Negotiable'}
Job Description: ${pass.jobDescriptionDraft || 'Not provided yet'}

Company: Hiring organization
Industry: Configured business sector

Provide a comprehensive ideal candidate profile including:

1. MUST-HAVE Skills & Qualifications (non-negotiable)
2. NICE-TO-HAVE Skills (differentiators)
3. Experience Background (ideal career path)
4. Personality Traits & Soft Skills
5. Cultural Fit Indicators
6. Red Flags to Watch For
7. Interview Questions to Assess Fit
8. Where to Source This Candidate (job boards, LinkedIn groups, etc.)`
            }]
          });
          
          const analyzeContent = analyzeMessage.content[0];
          if (analyzeContent.type === "text") {
            return { success: true, result: { idealCandidate: analyzeContent.text } };
          }
          return { success: false, error: "Failed to analyze ideal candidate" };
        }

        case "uae_recruitment_advice": {
          const adviceMessage = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Provide market-specific recruitment advice for hiring a ${toolInput.positionTitle} (${toolInput.experienceLevel || 'mid-level'}) in ${toolInput.department || 'General'} department.

Topic Focus: ${toolInput.topic || 'all'}

Please provide expert advice on:

${toolInput.topic === 'salary' || toolInput.topic === 'all' ? `
SALARY BENCHMARKS:
- Entry level range
- Mid-level range  
- Senior level range
- Common benefits/allowances (housing, transport, education)
- Bonus structures typical for the target market
` : ''}

${toolInput.topic === 'visa' || toolInput.topic === 'all' ? `
VISA & WORK PERMITS:
- Types of work visas available
- Sponsorship requirements
- Processing timelines
- Documents needed from candidate
- Medical fitness requirements
- Emirates ID process
` : ''}

${toolInput.topic === 'labor_law' || toolInput.topic === 'all' ? `
EMPLOYMENT LAW CONSIDERATIONS:
- Probation period rules (max 6 months)
- Notice period requirements
- End of service gratuity calculation
- Annual leave entitlements
- Working hours regulations
- Termination procedures
` : ''}

${toolInput.topic === 'market' || toolInput.topic === 'all' ? `
MARKET INSIGHTS:
- Talent availability in the target market
- Competition for this role
- Best sourcing channels
- Typical time-to-hire
- Candidate expectations
- Nationalization considerations (Emiratization)
` : ''}

Be specific to the configured market. Include practical tips for a solo HR professional.`
            }]
          });
          
          const adviceContent = adviceMessage.content[0];
          if (adviceContent.type === "text") {
            return { success: true, result: { advice: adviceContent.text } };
          }
          return { success: false, error: "Failed to generate market advice" };
        }

        case "draft_candidate_email": {
          const emailMessage = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            messages: [{
              role: "user",
              content: `Draft a professional ${toolInput.emailType} email for a candidate.

Candidate Name: ${toolInput.candidateName}
Position: ${toolInput.positionTitle}
Additional Details: ${toolInput.additionalDetails || 'None provided'}
Company: Hiring organization
Location: Configured work location

${toolInput.emailType === 'rejection' ? 
`Draft a respectful, professional rejection email that:
- Thanks them for their interest and time
- Is warm but clear about the decision
- Encourages them for future opportunities
- Maintains company reputation
- Is brief but not cold` : ''}

${toolInput.emailType === 'interview_invite' ? 
`Draft an interview invitation email that:
- Confirms the interview date/time/location from additional details
- Explains what to expect
- Provides preparation guidance
- Includes contact for questions
- Is professional and welcoming` : ''}

${toolInput.emailType === 'offer' ? 
`Draft a job offer email that:
- Congratulates the candidate
- Summarizes key offer details from additional details
- Expresses enthusiasm about them joining
- Provides next steps
- Sets deadline for response` : ''}

${toolInput.emailType === 'followup' ? 
`Draft a follow-up email that:
- Checks in professionally
- References the context from additional details
- Maintains positive relationship
- Has clear call to action` : ''}

${toolInput.emailType === 'onboarding' ? 
`Draft an onboarding welcome email that:
- Warmly welcomes to the team
- Provides first day details
- Lists documents to bring
- Shares what to expect
- Provides HR contact` : ''}

Make it professional, warm, and appropriate for the hiring organization's business culture.`
            }]
          });
          
          const emailContent = emailMessage.content[0];
          if (emailContent.type === "text") {
            return { success: true, result: { email: emailContent.text, emailType: toolInput.emailType } };
          }
          return { success: false, error: "Failed to draft email" };
        }

        case "hiring_process_advice": {
          let passContext = "";
          if (toolInput.passId) {
            const pass = await storage.getPass(Number(toolInput.passId));
            if (pass) {
              passContext = `
Current Pass Status: ${pass.status}
Current Step: ${pass.currentStep}
Headcount: ${pass.headcount}
Priority: ${pass.priority}`;
            }
          }
          
          const processMessage = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Provide hiring process recommendations for a ${toolInput.positionTitle} position.

Urgency: ${toolInput.urgency || 'normal'}
${passContext}
${toolInput.question ? `Specific Question: ${toolInput.question}` : ''}

As a recruitment expert, provide:

1. RECOMMENDED TIMELINE
   - Realistic time-to-hire for this role in the target market
   - Key milestones and deadlines
   - Buffer time for visa processing if needed

2. INTERVIEW PROCESS DESIGN
   - Number of interview rounds
   - Who should be involved
   - What to assess at each stage
   - Technical vs behavioral balance

3. EVALUATION CRITERIA
   - Scorecard template for this role
   - Must-have vs nice-to-have checklist
   - Red flags specific to this role

4. EFFICIENCY TIPS FOR SOLO HR
   - How to manage multiple candidates efficiently
   - Tools/templates to speed up process
   - When to involve hiring manager
   - Common bottlenecks and how to avoid them

5. MARKET-SPECIFIC CONSIDERATIONS
   - Notice period expectations
   - Visa timeline impact
   - Cultural interview considerations

Be practical and actionable for someone managing recruitment alone.`
            }]
          });
          
          const processContent = processMessage.content[0];
          if (processContent.type === "text") {
            return { success: true, result: { advice: processContent.text } };
          }
          return { success: false, error: "Failed to generate process advice" };
        }

        case "generate_interview_questions": {
          const pass = await storage.getPass(Number(toolInput.passId));
          if (!pass) {
            return { success: false, error: "Recruitment pass not found" };
          }
          
          const questionsMessage = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Generate ${toolInput.interviewType} interview questions for ${pass.positionTitle} position.

Position: ${pass.positionTitle}
Department: ${pass.department}
Experience Level: ${pass.experienceMin || 0}-${pass.experienceMax || 'senior'} years
Interview Type: ${toolInput.interviewType}
Focus Areas: ${toolInput.focusAreas?.join(', ') || 'General assessment'}
Job Description: ${pass.jobDescriptionDraft || 'Not available'}

Generate 10-15 tailored interview questions with:

1. The question
2. What it assesses (skill/competency)
3. What a GOOD answer looks like
4. What a RED FLAG answer looks like
5. Follow-up probing questions

${toolInput.interviewType === 'screening' ? 
'Focus on: Basic qualifications, motivation, availability, salary expectations, notice period' : ''}

${toolInput.interviewType === 'technical' ? 
'Focus on: Technical skills, problem-solving, hands-on experience, knowledge depth' : ''}

${toolInput.interviewType === 'behavioral' ? 
'Focus on: STAR method questions, past experiences, conflict resolution, teamwork' : ''}

${toolInput.interviewType === 'cultural' ? 
'Focus on: Values alignment, work style, adaptability to the work environment, team fit' : ''}

${toolInput.interviewType === 'final' ? 
'Focus on: Leadership potential, long-term goals, strategic thinking, final concerns' : ''}

Make questions specific to the role, not generic.`
            }]
          });
          
          const questionsContent = questionsMessage.content[0];
          if (questionsContent.type === "text") {
            return { success: true, result: { questions: questionsContent.text, interviewType: toolInput.interviewType } };
          }
          return { success: false, error: "Failed to generate interview questions" };
        }

        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error: any) {
      console.error(`Error executing tool ${toolName}:`, error);
      return { success: false, error: error.message || "Tool execution failed" };
    }
  }

  // General AI Chat endpoint with tool use
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { prompt } = req.body;
      
      if (!prompt || prompt.length < 3) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      // Get current context for the AI
      const passes = await storage.getPasses();
      const candidates = await storage.getCandidates();
      const currentContext = `
Current System State:
- ${passes.length} recruitment passes (${passes.filter(p => p.status === "open").length} open)
- ${candidates.length} candidates in database
- Recent passes: ${passes.slice(0, 3).map(p => `${p.passId}: ${p.positionTitle}`).join(", ") || "None"}
`;

      const messages: any[] = [
        { role: "user", content: prompt }
      ];

      let response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: `You are an expert AI recruitment assistant for the hiring organization. You are a knowledgeable HR partner who can both PERFORM ACTIONS and provide practical recruitment guidance.

${currentContext}

YOUR CAPABILITIES:

ACTIONS YOU CAN PERFORM:
1. CREATE recruitment passes for new job openings
2. ADD candidates to the system and LINK them to positions
3. SCHEDULE interviews with candidates
4. UPDATE candidate status (shortlist, reject, move through pipeline)
5. GENERATE professional job descriptions
6. CREATE job offers for selected candidates
7. SCORE candidates using AI analysis

EXPERT ADVICE YOU CAN PROVIDE:
8. COMPARE candidates side-by-side for a position
9. ANALYZE ideal candidate profile based on job requirements
10. RECRUITMENT EXPERTISE: salary benchmarks, employment requirements, labor law, market insights
11. DRAFT professional emails: rejections, interview invites, offers, onboarding
12. HIRING PROCESS recommendations and timelines
13. GENERATE tailored interview questions for any stage

YOU ARE A RECRUITMENT EXPERT:
- Know relevant labor law (probation periods, notice periods, benefits, working hours)
- Understand visa/work permit processes and timelines
- Have knowledge of salary benchmarks across industries
- Familiar with Emiratization requirements
- Understand cultural considerations for hiring in the GCC region

When users ask you to do something, USE THE TOOLS to actually perform the action. Don't just explain how - DO IT.

When users ask for advice (salary guidance, candidate comparison, ideal profile), use the appropriate analysis tools.

Be concise but thorough. You're supporting a solo HR professional who needs efficient, expert guidance.`,
        messages,
        tools: aiAgentTools
      });

      // Process tool calls in a loop until we get a final response
      const actionsPerformed: any[] = [];
      let maxIterations = 5;
      
      while (response.stop_reason === "tool_use" && maxIterations > 0) {
        maxIterations--;
        
        const toolUseBlocks = response.content.filter((block) => block.type === "tool_use") as Array<{
          type: "tool_use";
          id: string;
          name: string;
          input: Record<string, any>;
        }>;
        const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];
        
        for (const toolUse of toolUseBlocks) {
          const result = await executeAiTool(toolUse.name, toolUse.input);
          actionsPerformed.push({ tool: toolUse.name, input: toolUse.input, result });
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          });
        }
        
        // Continue conversation with tool results - proper Anthropic API format
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResults as any });
        
        response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: `You are an AI recruitment assistant for the hiring organization. You just performed some actions - summarize what you did clearly and helpfully.`,
          messages,
          tools: aiAgentTools
        });
      }

      // Handle case where max iterations reached but still in tool_use mode
      if (response.stop_reason === "tool_use") {
        return res.json({
          response: "I was working on your request but it required more steps than expected. Please try a simpler request or break it into smaller parts.",
          actionsPerformed: actionsPerformed.length > 0 ? actionsPerformed : undefined
        });
      }

      // Extract final text response
      const textBlocks = response.content.filter((block: any) => block.type === "text");
      const responseText = textBlocks.map((block: any) => block.text).join("\n\n") || "I completed the requested actions.";

      res.json({ 
        response: responseText,
        actionsPerformed: actionsPerformed.length > 0 ? actionsPerformed : undefined
      });
    } catch (error: any) {
      console.error("Error in AI chat:", error);
      if (error?.status === 429) {
        return res.status(429).json({ error: "AI service rate limit reached. Please try again in a moment." });
      }
      res.status(500).json({ error: "Failed to process AI request. Please try again." });
    }
  });

  app.post("/api/ai/analyze-resume", async (req, res) => {
    try {
      const resumeText = req.body.resumeText || "";
      
      if (!resumeText || resumeText.length < 50) {
        return res.status(400).json({ error: "Resume text too short for analysis" });
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Analyze this resume and extract the following information in JSON format:
{
  "name": "string (full name)",
  "email": "string",
  "phone": "string", 
  "currentTitle": "string",
  "currentCompany": "string",
  "experienceYears": number,
  "skills": ["array", "of", "skills"],
  "cvSummary": "brief professional summary (2-3 sentences)"
}

Resume text:
${resumeText}

Return only valid JSON, no additional text.`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const analysis = JSON.parse(content.text);
          res.json(analysis);
        } catch {
          res.json({ 
            error: "Could not parse AI response",
            raw: content.text 
          });
        }
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error) {
      console.error("Error analyzing resume:", error);
      res.status(500).json({ error: "Failed to analyze resume" });
    }
  });

  app.post("/api/ai/generate-jd", async (req, res) => {
    try {
      const { passId } = req.body;
      const pass = await storage.getPass(passId);
      
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `Generate a professional job description for:
Position: ${pass.positionTitle}
Department: ${pass.department}
Location: ${pass.location}
Employment Type: ${pass.employmentType}
Experience: ${pass.experienceMin || 0}-${pass.experienceMax || 'open'} years
Salary Range: ${pass.salaryCurrency || 'AED'} ${pass.salaryRangeMin || 'Negotiable'} - ${pass.salaryRangeMax || 'Negotiable'}

Company: Hiring organization
Industry: Atmospheric Water Generation - sustainable water technology

Create a compelling JD with:
1. Brief company intro (1-2 sentences about our water-from-air technology)
2. Role summary
3. Key responsibilities (5-7 bullet points)
4. Required qualifications
5. Preferred qualifications  
6. What we offer

Make it professional and appealing to candidates in the target market.`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        await storage.updatePass(passId, {
          jobDescriptionDraft: content.text,
          jdStatus: "pending_review"
        });
        res.json({ jobDescription: content.text });
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error) {
      console.error("Error generating JD:", error);
      res.status(500).json({ error: "Failed to generate job description" });
    }
  });

  app.post("/api/ai/evaluate-candidate", async (req, res) => {
    try {
      const { passId, candidateInfo } = req.body;
      const pass = await storage.getPass(passId);
      
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `Evaluate this candidate against the job requirements:

JOB: ${pass.positionTitle}
Department: ${pass.department}
Experience Required: ${pass.experienceMin}-${pass.experienceMax} years
Location: ${pass.location}
JD: ${pass.jobDescriptionDraft || pass.jobDescriptionFinal || 'Not available'}

CANDIDATE PROFILE:
${candidateInfo}

Provide evaluation in JSON format:
{
  "matchScore": number (0-100),
  "strengths": ["strength1", "strength2"],
  "concerns": ["concern1", "concern2"],
  "recommendation": "should_interview" | "maybe" | "pass",
  "interviewFocus": ["area to explore 1", "area to explore 2"],
  "summary": "2-3 sentence summary"
}

Be direct and practical. This is for the target market.`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const evaluation = JSON.parse(content.text);
          res.json(evaluation);
        } catch {
          res.json({ raw: content.text });
        }
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error) {
      console.error("Error evaluating candidate:", error);
      res.status(500).json({ error: "Failed to evaluate candidate" });
    }
  });

  // Generate Technical Assessment
  app.post("/api/ai/generate-assessment", async (req, res) => {
    try {
      const { passId, areas, difficulty } = req.body;
      const pass = await storage.getPass(passId);
      
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `Generate a technical assessment for:
Position: ${pass.positionTitle}
Department: ${pass.department}
Assessment Areas: ${areas || pass.technicalAssessmentAreas || 'General technical skills'}
Difficulty: ${difficulty || 'intermediate'}

Create a practical assessment with:
1. 3-4 multiple choice questions (with answers)
2. 2 short answer/coding questions
3. 1 problem-solving scenario

Return in JSON format:
{
  "title": "Assessment title",
  "duration": number (minutes),
  "questions": [
    {
      "type": "multiple_choice" | "short_answer" | "scenario",
      "question": "string",
      "options": ["a", "b", "c", "d"] (for multiple choice),
      "correctAnswer": "string",
      "points": number,
      "rubric": "grading criteria"
    }
  ],
  "totalPoints": number
}

Make questions practical and relevant to the target market.`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const assessment = JSON.parse(content.text);
          res.json(assessment);
        } catch {
          res.json({ raw: content.text });
        }
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error) {
      console.error("Error generating assessment:", error);
      res.status(500).json({ error: "Failed to generate assessment" });
    }
  });

  // Generate Interview Questions
  app.post("/api/ai/generate-interview-questions", async (req, res) => {
    try {
      const { passId, interviewType, candidateInfo } = req.body;
      const pass = await storage.getPass(passId);
      
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `Generate interview questions for:
Position: ${pass.positionTitle}
Department: ${pass.department}
Interview Type: ${interviewType || 'general'}
${candidateInfo ? `Candidate Background: ${candidateInfo}` : ''}

Generate 8-10 tailored interview questions including:
- 2 behavioral/cultural fit questions
- 3 technical/competency questions
- 2 situational/problem-solving questions
- 2 career motivation questions

Return in JSON format:
{
  "questions": [
    {
      "category": "behavioral" | "technical" | "situational" | "motivation",
      "question": "string",
      "followUp": "optional follow-up question",
      "lookFor": "what a good answer should include"
    }
  ]
}

Questions should be relevant to the hiring organization's work culture.`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const questions = JSON.parse(content.text);
          res.json(questions);
        } catch {
          res.json({ raw: content.text });
        }
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error) {
      console.error("Error generating interview questions:", error);
      res.status(500).json({ error: "Failed to generate interview questions" });
    }
  });

  // Technical Assessment CRUD Routes
  app.get("/api/passes/:passId/assessments", async (req, res) => {
    try {
      const assessments = await storage.getAssessmentsByPass(parseInt(req.params.passId));
      res.json(assessments);
    } catch (error) {
      console.error("Error fetching assessments:", error);
      res.status(500).json({ error: "Failed to fetch assessments" });
    }
  });

  app.post("/api/assessments", async (req, res) => {
    try {
      const validated = insertTechnicalAssessmentSchema.parse(req.body);
      const assessment = await storage.createAssessment(validated);
      res.status(201).json(assessment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating assessment:", error);
      res.status(500).json({ error: "Failed to create assessment" });
    }
  });

  app.post("/api/ai/rank-candidates", async (req, res) => {
    try {
      const { passId } = req.body;
      if (!passId) {
        return res.status(400).json({ error: "passId is required" });
      }

      const pass = await storage.getPass(passId);
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }

      const passCandidates = await storage.getPassCandidates(passId);
      if (!passCandidates.length) {
        return res.json({ ranked: [], message: "No candidates to rank" });
      }

      const candidateProfiles = passCandidates.map(pc => ({
        id: pc.id,
        candidateId: pc.candidateId,
        name: pc.candidate?.name || "Unknown",
        title: pc.candidate?.currentTitle || "",
        company: pc.candidate?.currentCompany || "",
        experience: pc.candidate?.experienceYears || 0,
        skills: pc.candidate?.skills || [],
        currentStatus: pc.status,
        existingScore: pc.aiScore
      }));

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `Rank and score these candidates for the position:

JOB DETAILS:
Position: ${pass.positionTitle}
Department: ${pass.department}
Experience Required: ${pass.experienceMin || 0}-${pass.experienceMax || 10} years
${pass.jobDescriptionDraft ? `Description: ${pass.jobDescriptionDraft.substring(0, 500)}` : ''}

CANDIDATES:
${candidateProfiles.map((c, i) => `
${i + 1}. ${c.name}
   - Current Title: ${c.title}
   - Company: ${c.company}
   - Experience: ${c.experience} years
   - Skills: ${Array.isArray(c.skills) ? c.skills.join(', ') : 'Not specified'}
`).join('')}

Return in JSON format:
{
  "rankings": [
    {
      "passCandidateId": number,
      "rank": number (1 being best),
      "score": number (0-100),
      "matchStrength": "excellent" | "good" | "moderate" | "weak",
      "keyStrengths": ["string"],
      "gaps": ["string"],
      "brief": "1-2 sentence summary of fit"
    }
  ]
}

Rank based on skills match, experience level, and seniority alignment with market expectations.`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const rankings = JSON.parse(content.text);
          
          for (const rank of rankings.rankings) {
            await storage.updatePassCandidate(rank.passCandidateId, {
              aiScore: rank.score,
              aiRank: rank.rank,
              aiBrief: rank.brief
            });
          }
          
          const updatedCandidates = await storage.getPassCandidates(passId);
          res.json({ ranked: updatedCandidates, rankings: rankings.rankings });
        } catch {
          res.json({ raw: content.text });
        }
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error) {
      console.error("Error ranking candidates:", error);
      res.status(500).json({ error: "Failed to rank candidates" });
    }
  });

  app.post("/api/ai/match-skills", async (req, res) => {
    try {
      const { passId, candidateId } = req.body;
      
      const pass = await storage.getPass(passId);
      const candidate = await storage.getCandidate(candidateId);
      
      if (!pass || !candidate) {
        return res.status(404).json({ error: "Pass or candidate not found" });
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `Analyze skill match between this candidate and position:

POSITION:
${pass.positionTitle} at ${pass.department}
${pass.jobDescriptionDraft || ''}

CANDIDATE:
Name: ${candidate.name}
Current Role: ${candidate.currentTitle} at ${candidate.currentCompany}
Experience: ${candidate.experienceYears} years
Skills: ${Array.isArray(candidate.skills) ? candidate.skills.join(', ') : 'Not specified'}
${candidate.cvSummary ? `CV Summary: ${candidate.cvSummary}` : ''}

Return in JSON format:
{
  "overallMatch": number (0-100),
  "skillAnalysis": {
    "matched": ["skill that matches requirement"],
    "missing": ["required skill candidate lacks"],
    "bonus": ["candidate skill that adds value beyond requirements"]
  },
  "experienceAssessment": {
    "level": "junior" | "mid" | "senior" | "lead" | "executive",
    "meetsRequirement": boolean,
    "notes": "string"
  },
  "cultureFit": {
    "uaeMarketRelevance": "high" | "medium" | "low",
    "notes": "string"
  },
  "recommendation": {
    "action": "proceed" | "consider" | "reject",
    "priority": "high" | "medium" | "low",
    "reasoning": "string"
  }
}`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const analysis = JSON.parse(content.text);
          res.json(analysis);
        } catch {
          res.json({ raw: content.text });
        }
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error) {
      console.error("Error matching skills:", error);
      res.status(500).json({ error: "Failed to match skills" });
    }
  });

  // ============ AI CANDIDATE SCORING ENDPOINTS ============
  
  // Score a single candidate with detailed AI analysis
  app.post("/api/ai/score-candidate", async (req, res) => {
    try {
      const { passId, passCandidateId } = req.body;
      
      if (!passId || !passCandidateId) {
        return res.status(400).json({ error: "passId and passCandidateId are required" });
      }

      const pass = await storage.getPass(passId);
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }

      const passCandidates = await storage.getPassCandidates(passId);
      const passCandidate = passCandidates.find(pc => pc.id === passCandidateId);
      
      if (!passCandidate) {
        return res.status(404).json({ error: "Pass candidate not found" });
      }

      const candidate = passCandidate.candidate;

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `Perform a comprehensive AI scoring analysis for this candidate applying to a position.

JOB REQUIREMENTS:
Position: ${pass.positionTitle}
Department: ${pass.department}
Location: ${pass.location}
Employment Type: ${pass.employmentType}
Experience Required: ${pass.experienceMin || 0} - ${pass.experienceMax || 10} years
${pass.jobDescriptionDraft ? `Job Description: ${pass.jobDescriptionDraft.substring(0, 1000)}` : ''}
${pass.jobDescriptionFinal ? `Final JD: ${pass.jobDescriptionFinal.substring(0, 1000)}` : ''}

CANDIDATE PROFILE:
Name: ${candidate?.name || 'Unknown'}
Current Title: ${candidate?.currentTitle || 'Not specified'}
Current Company: ${candidate?.currentCompany || 'Not specified'}
Experience: ${candidate?.experienceYears || 0} years
Skills: ${Array.isArray(candidate?.skills) ? candidate.skills.join(', ') : 'Not specified'}
Location: ${candidate?.currentLocation || 'Not specified'}
Expected Salary: ${candidate?.expectedSalary || 'Not specified'} ${candidate?.expectedSalaryCurrency || 'AED'}
${candidate?.cvSummary ? `Resume Summary: ${candidate.cvSummary}` : ''}
${candidate?.linkedinUrl ? `LinkedIn: ${candidate.linkedinUrl}` : ''}

Analyze this candidate and provide a detailed scoring. Consider market expectations and professional standards.

Return ONLY valid JSON in this exact format:
{
  "overallScore": <number 0-100>,
  "skillsMatch": <number 0-100>,
  "experienceMatch": <number 0-100>,
  "cultureMatch": <number 0-100>,
  "recommendation": "strong_yes" | "yes" | "maybe" | "no",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "improvements": ["area 1", "area 2"],
  "summary": "2-3 sentence executive summary of candidate fit",
  "matchBreakdown": {
    "technicalSkills": <number 0-100>,
    "softSkills": <number 0-100>,
    "industryExperience": <number 0-100>,
    "growthPotential": <number 0-100>
  }
}`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const scoreData = JSON.parse(content.text);
          
          // Save score to database
          await storage.updatePassCandidateAiScore(
            passCandidateId,
            scoreData.overallScore,
            scoreData
          );
          
          res.json({
            success: true,
            passCandidateId,
            ...scoreData
          });
        } catch (parseError) {
          console.error("Failed to parse AI response:", content.text);
          res.status(500).json({ error: "Failed to parse AI scoring response" });
        }
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error: any) {
      console.error("Error scoring candidate:", error);
      
      // Handle rate limiting
      if (error.status === 429) {
        return res.status(429).json({ 
          error: "Rate limit exceeded. Please try again in a moment.",
          retryAfter: error.headers?.['retry-after'] || 30
        });
      }
      
      res.status(500).json({ error: "Failed to score candidate" });
    }
  });

  // Batch score multiple candidates
  app.post("/api/ai/batch-score", async (req, res) => {
    try {
      const { passId, passCandidateIds } = req.body;
      
      if (!passId || !passCandidateIds || !Array.isArray(passCandidateIds)) {
        return res.status(400).json({ error: "passId and passCandidateIds array are required" });
      }

      const pass = await storage.getPass(passId);
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }

      const passCandidates = await storage.getPassCandidates(passId);
      const results: any[] = [];
      const errors: any[] = [];

      // Process candidates sequentially to avoid rate limits
      for (const pcId of passCandidateIds) {
        const passCandidate = passCandidates.find(pc => pc.id === pcId);
        
        if (!passCandidate) {
          errors.push({ passCandidateId: pcId, error: "Not found" });
          continue;
        }

        const candidate = passCandidate.candidate;

        try {
          const message = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            messages: [
              {
                role: "user",
                content: `Score this candidate for the ${pass.positionTitle} position at ${pass.department}.

Job Requirements:
- Experience: ${pass.experienceMin || 0}-${pass.experienceMax || 10} years
- Location: ${pass.location}
${pass.jobDescriptionDraft ? `- Description: ${pass.jobDescriptionDraft.substring(0, 500)}` : ''}

Candidate:
- Name: ${candidate?.name || 'Unknown'}
- Title: ${candidate?.currentTitle || 'N/A'}
- Experience: ${candidate?.experienceYears || 0} years
- Skills: ${Array.isArray(candidate?.skills) ? candidate.skills.join(', ') : 'N/A'}
${candidate?.cvSummary ? `- Summary: ${candidate.cvSummary.substring(0, 300)}` : ''}

Return ONLY valid JSON:
{
  "overallScore": <0-100>,
  "skillsMatch": <0-100>,
  "experienceMatch": <0-100>,
  "cultureMatch": <0-100>,
  "recommendation": "strong_yes" | "yes" | "maybe" | "no",
  "strengths": ["str1", "str2"],
  "improvements": ["imp1"],
  "summary": "Brief 1-sentence summary"
}`
              }
            ]
          });

          const content = message.content[0];
          if (content.type === "text") {
            const scoreData = JSON.parse(content.text);
            
            await storage.updatePassCandidateAiScore(pcId, scoreData.overallScore, scoreData);
            
            results.push({
              passCandidateId: pcId,
              candidateName: candidate?.name,
              ...scoreData
            });
          }

          // Add small delay between requests to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (scoreError: any) {
          console.error(`Error scoring candidate ${pcId}:`, scoreError);
          
          if (scoreError.status === 429) {
            // If rate limited, wait and add to errors
            errors.push({ 
              passCandidateId: pcId, 
              candidateName: candidate?.name,
              error: "Rate limited - please retry later"
            });
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            errors.push({ 
              passCandidateId: pcId, 
              candidateName: candidate?.name,
              error: scoreError.message || "Scoring failed"
            });
          }
        }
      }

      res.json({
        success: true,
        scored: results.length,
        failed: errors.length,
        results,
        errors
      });
    } catch (error) {
      console.error("Error batch scoring candidates:", error);
      res.status(500).json({ error: "Failed to batch score candidates" });
    }
  });

  app.post("/api/ai/generate-offer-letter", async (req, res) => {
    try {
      const { passId, passCandidateId, salary, startDate, benefits } = req.body;
      
      const pass = await storage.getPass(passId);
      const passCandidates = await storage.getPassCandidates(passId);
      const passCandidate = passCandidates.find(pc => pc.id === passCandidateId);
      
      if (!pass || !passCandidate) {
        return res.status(404).json({ error: "Pass or candidate not found" });
      }

      const candidate = passCandidate.candidate;

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2500,
        messages: [
          {
            role: "user",
            content: `Generate a professional offer letter for the hiring organization. Use formal business English.

COMPANY: Hiring organization
LOCATION: Configured work location

CANDIDATE DETAILS:
Name: ${candidate?.name}
Current Title: ${candidate?.currentTitle || 'N/A'}

OFFER DETAILS:
Position: ${pass.positionTitle}
Department: ${pass.department}
Location: ${pass.location}
Employment Type: ${pass.employmentType}
Salary: ${salary} AED per month
Start Date: ${startDate}
${benefits ? `Benefits: ${benefits}` : ''}

Generate a complete, professional offer letter that includes:
1. Warm welcome and offer statement
2. Position details and reporting structure
3. Compensation and benefits summary
4. Start date and onboarding information
5. Employment terms and conditions suitable for the configured market
6. Acceptance instructions
7. Professional closing

Return the letter in JSON format:
{
  "subject": "Employment Offer - [Position Title]",
  "body": "Full letter content with proper formatting using \\n for line breaks",
  "summary": "One-line summary of the offer"
}`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const letter = JSON.parse(content.text);
          res.json(letter);
        } catch {
          res.json({ raw: content.text });
        }
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error) {
      console.error("Error generating offer letter:", error);
      res.status(500).json({ error: "Failed to generate offer letter" });
    }
  });

  // ============ NOTIFICATION ROUTES ============
  // Get notifications for current user (using mock user for now)
  app.get("/api/notifications", async (req, res) => {
    try {
      // In a real app, we'd get the user from the session
      // For now, use a mock user ID or get all notifications
      const managerId = req.query.managerId as string;
      const userId = managerId ? `manager-${managerId}` : 'admin-user';
      
      const notificationsList = await storage.getNotifications(userId);
      res.json(notificationsList);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Mark notification as read
  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const marked = await storage.markNotificationRead(parseInt(req.params.id));
      if (!marked) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  // Mark all notifications as read for a user
  app.patch("/api/notifications/mark-all-read", async (req, res) => {
    try {
      const managerId = req.query.managerId as string;
      const userId = managerId ? `manager-${managerId}` : 'admin-user';
      
      const notificationsList = await storage.getNotifications(userId);
      let markedCount = 0;
      
      for (const notification of notificationsList) {
        if (!notification.isRead) {
          await storage.markNotificationRead(notification.id);
          markedCount++;
        }
      }
      
      res.json({ success: true, markedCount });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  return httpServer;
}
