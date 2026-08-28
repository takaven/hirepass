import { resolveCandidatePassState } from "./candidate-pass-state";
import { resolveManagerPassState } from "./manager-pass-state";
import type {
  ActivityLog,
  Candidate,
  CandidateDocument,
  CandidateLink,
  CandidateMessage,
  Interview,
  InterviewSlot,
  Manager,
  Offer,
  Pass,
  PassCandidate,
  ShareLink,
} from "@shared/schema";

export type WaitingOn = "candidate" | "manager" | "hr" | "upcoming_event" | "no_action" | "completed" | "expired_revoked";
export type PassControlPriority = "attention" | "monitor" | "complete";

export type PassControlCandidate = {
  id: number;
  passId: number;
  candidateName: string;
  status: string;
  waitingOn: WaitingOn;
  stateLabel: string;
  nextAction: string;
  isStalled: boolean;
  lastMeaningfulAt: string | null;
  waitingAgeDays: number | null;
  expectedMovement: string;
  passHandoff: string | null;
  activeCandidateLink: CandidateLink | null;
  latestCandidateLink: CandidateLink | null;
};

export type PassControlItem = {
  passId: number;
  readablePassId: string | null;
  title: string;
  department: string | null;
  managerName: string | null;
  waitingOn: WaitingOn;
  priority: PassControlPriority;
  isStalled: boolean;
  status: string;
  nextAction: string;
  waitingSince: string | null;
  waitingAgeDays: number | null;
  expectedMovement: string;
  passHandoff: string | null;
  candidateActions: number;
  managerActions: number;
  upcomingEvents: number;
  expiredOrRevokedLinks: number;
  activeManagerLink: ShareLink | null;
  latestManagerLink: ShareLink | null;
  candidates: PassControlCandidate[];
  recentActivity: ActivityLog[];
};

export type PassControlSource = {
  pass: Pass;
  manager?: Manager | null;
  candidates: Array<PassCandidate & { candidate?: Candidate | null }>;
  candidateLinksByPassCandidateId: Map<number, CandidateLink[]>;
  managerLinks: ShareLink[];
  interviews: Interview[];
  interviewSlots: InterviewSlot[];
  messagesByPassCandidateId: Map<number, CandidateMessage[]>;
  documentsByPassCandidateId: Map<number, CandidateDocument[]>;
  offersByPassCandidateId: Map<number, Offer | undefined>;
  activity: ActivityLog[];
  now?: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const STALL_DAYS = 5;
const terminalStatuses = new Set(["hired", "rejected", "withdrawn"]);
type LinkWithDates = { expiresAt?: unknown; isActive?: boolean | null; createdAt?: unknown; lastAccessedAt?: unknown };

function dateValue(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isExpired(value: LinkWithDates | null | undefined, now: Date): boolean {
  if (!value) return false;
  const expiresAt = dateValue(value.expiresAt);
  return value.isActive === false || Boolean(expiresAt && expiresAt <= now);
}

function latestDate(...values: unknown[]): Date | null {
  const dates = values.map(dateValue).filter((value): value is Date => Boolean(value));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function latestByCreatedAt<T extends { createdAt?: unknown }>(items: T[]): T | null {
  return [...items].sort((a, b) => (dateValue(b.createdAt)?.getTime() || 0) - (dateValue(a.createdAt)?.getTime() || 0))[0] || null;
}

function activityDetails(activity: ActivityLog): Record<string, unknown> {
  return activity.details && typeof activity.details === "object" && !Array.isArray(activity.details)
    ? activity.details as Record<string, unknown>
    : {};
}

function meaningfulActivityLabel(activity: ActivityLog): string | null {
  switch (activity.action) {
    case "candidate_interview_slot_booked":
      return "Candidate booked interview slot";
    case "candidate_document_submitted":
      return "Candidate submitted document";
    case "candidate_assessment_completed":
      return "Candidate completed assessment";
    case "candidate_offer_accepted_handoff":
      return "Candidate accepted offer";
    case "candidate_offer_response_submitted":
      return "Candidate submitted offer response";
    case "manager_candidate_shortlisted":
      return "Manager shortlisted candidate";
    case "manager_candidate_rejected":
      return "Manager rejected candidate";
    case "manager_evaluation_submitted":
      return "Manager submitted evaluation";
    case "manager_final_decision_submitted":
      return "Manager submitted final decision";
    case "manager_interview_setup_completed":
      return "Manager set interview availability";
    case "manager_request_approved":
      return "Manager approved hiring request";
    case "candidate_pass_issued":
      return "Candidate Pass issued";
    case "manager_pass_issued":
      return "Manager Pass issued";
    case "pass_nudge_recorded":
      return "HR recorded follow-up";
    default:
      return null;
  }
}

function isCandidateActivity(passCandidateId: number, activity: ActivityLog): boolean {
  const details = activityDetails(activity);
  return details.passCandidateId === passCandidateId || activity.targetId === passCandidateId;
}

function latestMeaningfulActivity(activities: ActivityLog[], passCandidateId?: number): ActivityLog | null {
  return activities
    .filter((activity) => meaningfulActivityLabel(activity))
    .filter((activity) => passCandidateId ? isCandidateActivity(passCandidateId, activity) : true)
    .sort((a, b) => (dateValue(b.createdAt)?.getTime() || 0) - (dateValue(a.createdAt)?.getTime() || 0))[0] || null;
}

function waitingAgeDays(lastMeaningfulAt: Date | null, now: Date): number | null {
  if (!lastMeaningfulAt) return null;
  return Math.max(0, Math.floor((now.getTime() - lastMeaningfulAt.getTime()) / DAY_MS));
}

function candidateExpectedMovement(passState: ReturnType<typeof resolveCandidatePassState>): string {
  return passState.expectedMovement;
}

function passExpectedMovement(pass: Pass, candidateStates: PassControlCandidate[], managerState: ReturnType<typeof resolveManagerPassState>, waitingOn: WaitingOn): string {
  if (waitingOn === "candidate") return candidateStates.find((candidate) => candidate.waitingOn === "candidate")?.expectedMovement || "Expected movement: waiting for candidate action.";
  if (waitingOn === "manager") return managerState.expectedMovement;
  const targetHireDate = dateValue(pass.targetHireDate);
  if (targetHireDate) return `Expected movement: HR is working toward ${targetHireDate.toISOString().slice(0, 10)}.`;
  if (waitingOn === "completed") return "Expected movement: hiring workflow complete.";
  if (waitingOn === "upcoming_event") return "Expected movement: next scheduled event.";
  return "Expected movement: no checkpoint is set yet.";
}

function passHandoffFromActivity(activity: ActivityLog | null, waitingOn: WaitingOn): string | null {
  if (!activity) return null;
  const ownerLabel = waitingOn === "hr"
    ? "HR"
    : waitingOn === "manager"
      ? "Manager"
      : waitingOn === "candidate"
        ? "Candidate"
        : waitingOn === "upcoming_event"
          ? "Scheduled event"
          : waitingOn === "completed"
            ? "Completed"
            : "No current owner";
  if ((activity.action || "").startsWith("manager_")) return `Pass Handoff: Manager -> ${ownerLabel}`;
  if ((activity.action || "").startsWith("candidate_")) return `Pass Handoff: Candidate -> ${ownerLabel}`;
  if ((activity.action || "").startsWith("pass_") || (activity.action || "").includes("_pass_")) return `Pass Handoff: HR -> ${ownerLabel}`;
  return null;
}

function activeLatestLink<T extends LinkWithDates>(items: T[], now: Date): T | null {
  return [...items]
    .filter((item) => item.isActive !== false && !isExpired(item, now))
    .sort((a, b) => (dateValue(b.createdAt)?.getTime() || 0) - (dateValue(a.createdAt)?.getTime() || 0))[0] || null;
}

function isStalled(waitingOn: WaitingOn, lastMeaningfulAt: Date | null, now: Date): boolean {
  if (!["candidate", "manager", "hr"].includes(waitingOn)) return false;
  if (!lastMeaningfulAt) return true;
  return now.getTime() - lastMeaningfulAt.getTime() > STALL_DAYS * DAY_MS;
}

function candidateWaitingOn(actionState: string, waitingOn?: string): WaitingOn {
  if (actionState === "COMPLETED") return "completed";
  if (["EXPIRED", "REVOKED"].includes(actionState)) return "expired_revoked";
  if (actionState === "UPCOMING") return "upcoming_event";
  if (actionState === "ACTION_REQUIRED") return "candidate";
  if ((waitingOn || "").toLowerCase().includes("hiring")) return "hr";
  return "no_action";
}

function managerWaitingOn(actionState: string): WaitingOn {
  if (actionState === "COMPLETED") return "completed";
  if (["EXPIRED", "REVOKED"].includes(actionState)) return "expired_revoked";
  if (actionState === "UPCOMING") return "upcoming_event";
  if (actionState === "ACTION_REQUIRED") return "manager";
  return "no_action";
}

function pickPassWaitingOn(candidates: PassControlCandidate[], managerState: WaitingOn, hasExpiredOrRevoked: boolean): WaitingOn {
  if (candidates.some((candidate) => candidate.waitingOn === "candidate")) return "candidate";
  if (managerState === "manager") return "manager";
  if (candidates.some((candidate) => candidate.waitingOn === "hr")) return "hr";
  if (managerState === "upcoming_event" || candidates.some((candidate) => candidate.waitingOn === "upcoming_event")) return "upcoming_event";
  if (candidates.length && candidates.every((candidate) => candidate.waitingOn === "completed")) return "completed";
  if (hasExpiredOrRevoked) return "expired_revoked";
  return "no_action";
}

export function buildPassControlItem(source: PassControlSource): PassControlItem {
  const now = source.now || new Date();
  const activeManagerLink = activeLatestLink(source.managerLinks, now);
  const latestManagerLink = latestByCreatedAt(source.managerLinks);
  const managerState = resolveManagerPassState({
    link: activeManagerLink || latestManagerLink || { isActive: false, expiresAt: null },
    pass: source.pass,
    candidates: source.candidates,
    interviews: source.interviews,
    now,
  });
  const managerWaiting = managerWaitingOn(managerState.actionState);

  const candidates = source.candidates.map((passCandidate) => {
    const links = source.candidateLinksByPassCandidateId.get(passCandidate.id) || [];
    const activeCandidateLink = activeLatestLink(links, now);
    const latestCandidateLink = latestByCreatedAt(links);
    const passState = resolveCandidatePassState({
      link: activeCandidateLink || latestCandidateLink || { isActive: false, expiresAt: null },
      passCandidate,
      pass: source.pass,
      messages: source.messagesByPassCandidateId.get(passCandidate.id) || [],
      documents: source.documentsByPassCandidateId.get(passCandidate.id) || [],
      interviews: source.interviews.filter((interview) => interview.passCandidateId === passCandidate.id),
      offer: source.offersByPassCandidateId.get(passCandidate.id),
      interviewSlots: source.interviewSlots,
      now,
    });
    const waitingOn = terminalStatuses.has(passCandidate.status || "") ? "completed" : candidateWaitingOn(passState.actionState, passState.waitingOn);
    const latestActivity = latestMeaningfulActivity(source.activity, passCandidate.id);
    const lastMeaningfulAt = latestDate(latestActivity?.createdAt, passCandidate.updatedAt, passCandidate.addedAt, latestCandidateLink?.createdAt);
    return {
      id: passCandidate.id,
      passId: passCandidate.passId,
      candidateName: passCandidate.candidate?.name || "Candidate",
      status: passCandidate.status || "new",
      waitingOn,
      stateLabel: passState.stateLabel,
      nextAction: passState.nextAction.label,
      isStalled: isStalled(waitingOn, lastMeaningfulAt, now),
      lastMeaningfulAt: lastMeaningfulAt?.toISOString() || null,
      waitingAgeDays: waitingAgeDays(lastMeaningfulAt, now),
      expectedMovement: candidateExpectedMovement(passState),
      passHandoff: passHandoffFromActivity(latestActivity, waitingOn),
      activeCandidateLink,
      latestCandidateLink,
    };
  });

  const expiredOrRevokedLinks = source.managerLinks.filter((link) => isExpired(link, now)).length
    + Array.from(source.candidateLinksByPassCandidateId.values()).flat().filter((link) => isExpired(link, now)).length;
  const waitingOn = pickPassWaitingOn(candidates, managerWaiting, expiredOrRevokedLinks > 0);
  const latestPassActivity = latestMeaningfulActivity(source.activity);
  const managerLastMeaningfulAt = latestDate(latestPassActivity?.createdAt, source.pass.updatedAt, activeManagerLink?.lastAccessedAt, latestManagerLink?.createdAt);
  const stalled = candidates.some((candidate) => candidate.isStalled) || isStalled(managerWaiting, managerLastMeaningfulAt, now);

  return {
    passId: source.pass.id,
    readablePassId: source.pass.passId || null,
    title: source.pass.positionTitle,
    department: source.pass.department || null,
    managerName: source.manager?.name || null,
    waitingOn,
    priority: stalled || ["candidate", "manager", "hr", "expired_revoked"].includes(waitingOn) ? "attention" : waitingOn === "completed" ? "complete" : "monitor",
    isStalled: stalled,
    status: source.pass.status || "draft",
    nextAction: managerWaiting === "manager" ? managerState.nextDecision.label : candidates.find((candidate) => ["candidate", "hr"].includes(candidate.waitingOn))?.nextAction || "Monitor Pass",
    waitingSince: managerLastMeaningfulAt?.toISOString() || null,
    waitingAgeDays: waitingAgeDays(managerLastMeaningfulAt, now),
    expectedMovement: passExpectedMovement(source.pass, candidates, managerState, waitingOn),
    passHandoff: passHandoffFromActivity(latestPassActivity, waitingOn),
    candidateActions: candidates.filter((candidate) => candidate.waitingOn === "candidate").length,
    managerActions: managerWaiting === "manager" ? 1 : 0,
    upcomingEvents: source.interviews.filter((interview) => interview.status === "scheduled").length,
    expiredOrRevokedLinks,
    activeManagerLink,
    latestManagerLink,
    candidates,
    recentActivity: source.activity.slice(0, 5),
  };
}
