import type {
  ManagerEvidenceSummary,
  ManagerHiringStage,
  ManagerNextDecision,
  ManagerPassActionState,
  ManagerPassViewState,
} from "@shared/pass-state";
import { configuredStages } from "@shared/hiring-workflow";

export type {
  ManagerEvidenceSummary,
  ManagerHiringStage,
  ManagerNextDecision,
  ManagerPassActionState,
  ManagerPassViewState,
} from "@shared/pass-state";

export type ManagerPassCandidateInput = {
  id: number;
  passId?: number | null;
  status?: string | null;
  aiScore?: number | null;
  interviewScore?: string | number | null;
  interviewRecommendation?: string | null;
  candidate?: {
    name?: string | null;
    currentTitle?: string | null;
    experienceYears?: number | null;
    cvSummary?: string | null;
  } | null;
};

export type ManagerPassStateInput = {
  link?: { isActive?: boolean | null; expiresAt?: Date | string | null } | null;
  pass?: {
    id?: number | null;
    jdStatus?: string | null;
    interviewSetupCompleted?: boolean | null;
    positionTitle?: string | null;
    status?: string | null;
    targetHireDate?: Date | string | null;
    enabledStages?: string[] | null;
  } | null;
  candidates?: ManagerPassCandidateInput[];
  interviews?: Array<{ id?: number; status?: string | null; interviewDate?: Date | string | null; passCandidateId?: number | null }>;
  now?: Date;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isActiveCandidate(candidate: ManagerPassCandidateInput): boolean {
  return !["rejected", "hired"].includes((candidate.status || "new").toLowerCase());
}

function buildEvidence(pass: ManagerPassStateInput["pass"], candidates: ManagerPassCandidateInput[]): ManagerEvidenceSummary {
  const activeCandidates = candidates.filter(isActiveCandidate);
  const topCandidate = activeCandidates[0];

  return {
    candidateCount: candidates.length,
    activeCandidateCount: activeCandidates.length,
    role: pass?.positionTitle || "Hiring request",
    topCandidate: topCandidate
      ? {
          id: topCandidate.id,
          name: topCandidate.candidate?.name || "Candidate",
          title: topCandidate.candidate?.currentTitle || "Profile under review",
          summary: topCandidate.candidate?.cvSummary || "Use the available candidate evidence to make this decision.",
        }
      : undefined,
  };
}

function hasUpcomingInterview(interviews: ManagerPassStateInput["interviews"], now: Date): boolean {
  return Boolean(
    interviews?.some((interview) => {
      const date = toDate(interview.interviewDate);
      return date && date >= now && interview.status !== "cancelled";
    }),
  );
}

function formatDate(value: Date | string | null | undefined): string | null {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function expectedMovement(input: ManagerPassStateInput, waitingOn: string, next: string, now: Date): string {
  const nextInterview = input.interviews
    ?.map((interview) => toDate(interview.interviewDate))
    .filter((date): date is Date => Boolean(date && date >= now))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (nextInterview) return `Expected movement: interview scheduled for ${nextInterview.toISOString().slice(0, 10)}.`;

  const targetHire = formatDate(input.pass?.targetHireDate);
  if (targetHire) return `Expected movement: the hiring team is working toward ${targetHire}.`;

  if (waitingOn === "Manager") {
    return `Expected movement: the hiring manager will ${actionPhrase(next)}.`;
  }
  if (waitingOn === "Hiring team") {
    return "Expected movement: the hiring team will update this Pass when the next step is ready.";
  }
  return "Expected movement: this Pass will update when the next step is recorded.";
}

function actionPhrase(next: string): string {
  const phrase = next
    .trim()
    .replace(/\.$/, "")
    .replace(/^Manager completes\s+/i, "")
    .replace(/^Hiring Manager completes\s+/i, "")
    .replace(/^HR completes\s+/i, "")
    .replace(/^Record\s+/i, "record ")
    .replace(/^Submit\s+/i, "submit ")
    .replace(/^Review\s+/i, "review ")
    .replace(/^Set\s+/i, "set ");
  return phrase || "complete the next step";
}

function withPassState(base: Omit<ManagerPassViewState, "waitingOn" | "next" | "expectedMovement" | "latestUpdate" | "passHandoff">, input: ManagerPassStateInput, now: Date): ManagerPassViewState {
  const waitingOn = base.actionState === "ACTION_REQUIRED"
    ? "Manager"
    : base.actionState === "UPCOMING"
      ? "Scheduled event"
      : base.actionState === "COMPLETED"
        ? "Hiring team"
        : base.actionState === "WAITING"
          ? "Hiring team"
          : "Hiring team";
  const next = base.nextDecision.description;
  return {
    ...base,
    waitingOn,
    next,
    expectedMovement: expectedMovement(input, waitingOn, next, now),
    latestUpdate: base.actionState === "ACTION_REQUIRED"
      ? `${base.nextDecision.label} is waiting for you.`
      : "The hiring team has your latest input.",
    passHandoff: base.actionState === "COMPLETED" || base.actionState === "WAITING" ? "Pass Handoff: Hiring stakeholder -> Hiring team" : null,
  };
}

export function isPassScopedCandidate(passId: number, passCandidate: { passId?: number | null } | null | undefined): boolean {
  return Boolean(passCandidate && passCandidate.passId === passId);
}

export function isPassScopedInterview(passId: number, interview: { passId?: number | null } | null | undefined): boolean {
  return Boolean(interview && interview.passId === passId);
}

export function resolveManagerPassState(input: ManagerPassStateInput): ManagerPassViewState {
  const now = input.now ?? new Date();
  const pass = input.pass;
  const candidates = input.candidates ?? [];
  const evidence = buildEvidence(pass, candidates);
  const expiresAt = toDate(input.link?.expiresAt);
  const stages = configuredStages(pass?.enabledStages);
  const interviewIndex = stages.indexOf("interview");
  const preInterview = interviewIndex >= 0 ? stages.slice(0, interviewIndex) : stages.slice(0, -1);
  const pendingCandidate = candidates.find((candidate) => {
    const status = (candidate.status || "new").toLowerCase();
    const index = preInterview.indexOf(status as any);
    return index >= 0 && (preInterview.length === 1 || index < preInterview.length - 1);
  });
  const completedInterviewCandidateIds = new Set(input.interviews?.filter((interview) => interview.status === "completed" || (toDate(interview.interviewDate)?.getTime() ?? Infinity) < now.getTime()).map((interview) => interview.passCandidateId));
  const interviewCandidate = candidates.find((candidate) => (candidate.status || "").toLowerCase() === "interview" && !candidate.interviewRecommendation && completedInterviewCandidateIds.has(candidate.id));
  const finalDecisionCandidate = candidates.find((candidate) => (candidate.status || "").toLowerCase() === "interview" && candidate.interviewRecommendation);

  if (!input.link?.isActive) {
    return withPassState({
      actionState: "REVOKED",
      hiringStage: "Request",
      stateLabel: "PASS NOT ACTIVE",
      headline: "This Manager Pass is no longer active.",
      summary: "Ask the hiring team to issue a fresh Pass if your input is still required.",
      urgency: "attention",
      nextDecision: { kind: "NONE", label: "Contact hiring team", description: "This Pass cannot accept decisions.", target: "none" },
      evidence,
    }, input, now);
  }

  if (expiresAt && expiresAt < now) {
    return withPassState({
      actionState: "EXPIRED",
      hiringStage: "Request",
      stateLabel: "PASS EXPIRED",
      headline: "This Manager Pass has expired.",
      summary: "Ask the hiring team to issue a fresh Pass if your input is still required.",
      urgency: "attention",
      nextDecision: { kind: "NONE", label: "Request fresh Pass", description: "This Pass cannot accept decisions.", target: "none" },
      evidence,
    }, input, now);
  }

  if (pass?.jdStatus !== "approved") {
    return withPassState({
      actionState: "ACTION_REQUIRED",
      hiringStage: "Request",
      stateLabel: "ACTION REQUIRED",
      headline: "Approve the hiring request.",
      summary: "Review the role details and either approve the request or ask the hiring team for changes.",
      urgency: "attention",
      nextDecision: {
        kind: "APPROVE_JD",
        label: "Review hiring request",
        description: "Approve the job description or request changes.",
        target: "request",
      },
      evidence,
    }, input, now);
  }

  if (pendingCandidate) {
    return withPassState({
      actionState: "ACTION_REQUIRED",
      hiringStage: "Screening",
      stateLabel: "ACTION REQUIRED",
      headline: "Review the next candidate.",
      summary: "Advance or reject the candidate using the evidence shown here.",
      urgency: "attention",
      nextDecision: {
        kind: "REVIEW_CANDIDATE",
        label: "Review candidate",
        description: "Make a screening decision from this pass.",
        target: "candidate",
        candidateId: pendingCandidate.id,
      },
      evidence,
    }, input, now);
  }

  if (interviewIndex >= 0 && !pass?.interviewSetupCompleted && candidates.some((candidate) => {
    const status = (candidate.status || "new").toLowerCase();
    return status === "interview" || status === preInterview.at(-1);
  })) {
    return withPassState({
      actionState: "ACTION_REQUIRED",
      hiringStage: "Interview",
      stateLabel: "ACTION REQUIRED",
      headline: "Set interview availability.",
      summary: "Give the hiring team the interview format and availability needed to proceed.",
      urgency: "attention",
      nextDecision: {
        kind: "SET_INTERVIEW_AVAILABILITY",
        label: "Set interview availability",
        description: "Configure interview details for shortlisted candidates.",
        target: "interview",
      },
      evidence,
    }, input, now);
  }

  if (interviewCandidate) {
    return withPassState({
      actionState: "ACTION_REQUIRED",
      hiringStage: "Interview",
      stateLabel: "ACTION REQUIRED",
      headline: "Submit interview evaluation.",
      summary: "Record evidence-based feedback so the hiring team can move the process forward.",
      urgency: "attention",
      nextDecision: {
        kind: "SUBMIT_EVALUATION",
        label: "Submit evaluation",
        description: "Submit a recommendation and evidence-based notes.",
        target: "evaluation",
        candidateId: interviewCandidate.id,
      },
      evidence,
    }, input, now);
  }

  if (finalDecisionCandidate) {
    return withPassState({
      actionState: "ACTION_REQUIRED",
      hiringStage: "Decision",
      stateLabel: "ACTION REQUIRED",
      headline: "Make the final hiring decision.",
      summary: "Choose hire, reserve, or reject for the evaluated candidate.",
      urgency: "attention",
      nextDecision: {
        kind: "MAKE_FINAL_DECISION",
        label: "Make final decision",
        description: "Submit your final decision to the hiring team.",
        target: "decision",
        candidateId: finalDecisionCandidate.id,
      },
      evidence,
    }, input, now);
  }

  if (hasUpcomingInterview(input.interviews, now)) {
    return withPassState({
      actionState: "UPCOMING",
      hiringStage: "Interview",
      stateLabel: "UPCOMING",
      headline: "Interview is scheduled.",
      summary: "No decision is needed until the interview is complete.",
      urgency: "normal",
      nextDecision: {
        kind: "NONE",
        label: "Review interview details",
        description: "Keep the upcoming interview details handy.",
        target: "none",
      },
      evidence,
    }, input, now);
  }

  if (candidates.length > 0 && candidates.every((candidate) => ["rejected", "hired", "offer"].includes((candidate.status || "").toLowerCase()))) {
    return withPassState({
      actionState: "COMPLETED",
      hiringStage: "Decision",
      stateLabel: "COMPLETED",
      headline: "You're done for now. The hiring team has your decision.",
      summary: "There are no open manager actions on this Pass.",
      urgency: "normal",
      nextDecision: {
        kind: "NONE",
        label: "No decision required",
        description: "The hiring team will handle the next step.",
        target: "none",
      },
      evidence,
    }, input, now);
  }

  return withPassState({
    actionState: "WAITING",
    hiringStage: "Screening",
    stateLabel: "ALL CAUGHT UP",
    headline: "You're done for now. The hiring team has what it needs.",
    summary: "This Pass will show a decision when your input is required again.",
    urgency: "normal",
    nextDecision: {
      kind: "NONE",
      label: "No decision required",
      description: "The hiring team will update this Pass when there is something to decide.",
      target: "none",
    },
    evidence,
  }, input, now);
}
