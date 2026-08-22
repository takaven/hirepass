export type ManagerPassActionState =
  | "ACTION_REQUIRED"
  | "WAITING"
  | "UPCOMING"
  | "COMPLETED"
  | "EXPIRED"
  | "REVOKED";

export type ManagerHiringStage =
  | "Request"
  | "Screening"
  | "Interview"
  | "Decision"
  | "Offer"
  | "Handoff";

export type ManagerNextDecision =
  | {
      kind:
        | "APPROVE_JD"
        | "REVIEW_CANDIDATE"
        | "SET_INTERVIEW_AVAILABILITY"
        | "SUBMIT_EVALUATION"
        | "MAKE_FINAL_DECISION";
      label: string;
      description: string;
      target: "request" | "candidate" | "interview" | "evaluation" | "decision";
      candidateId?: number;
    }
  | {
      kind: "NONE";
      label: string;
      description: string;
      target: "none";
    };

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
  } | null;
  candidates?: ManagerPassCandidateInput[];
  interviews?: Array<{ id?: number; status?: string | null; interviewDate?: Date | string | null; passCandidateId?: number | null }>;
  now?: Date;
};

export type ManagerEvidenceSummary = {
  candidateCount: number;
  activeCandidateCount: number;
  topCandidate?: {
    id: number;
    name: string;
    title: string;
    summary: string;
  };
  role: string;
};

export type ManagerPassViewState = {
  actionState: ManagerPassActionState;
  hiringStage: ManagerHiringStage;
  stateLabel: string;
  headline: string;
  summary: string;
  urgency: "normal" | "attention";
  nextDecision: ManagerNextDecision;
  evidence: ManagerEvidenceSummary;
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
  const pendingCandidate = candidates.find((candidate) => ["new", "screening"].includes((candidate.status || "new").toLowerCase()));
  const interviewCandidate = candidates.find((candidate) => (candidate.status || "").toLowerCase() === "interview" && !candidate.interviewRecommendation);
  const finalDecisionCandidate = candidates.find((candidate) => (candidate.status || "").toLowerCase() === "interview" && candidate.interviewRecommendation);

  if (!input.link?.isActive) {
    return {
      actionState: "REVOKED",
      hiringStage: "Request",
      stateLabel: "PASS NOT ACTIVE",
      headline: "This Manager Pass is no longer active.",
      summary: "Ask HR to issue a fresh Pass if your input is still required.",
      urgency: "attention",
      nextDecision: { kind: "NONE", label: "Contact HR", description: "This Pass cannot accept decisions.", target: "none" },
      evidence,
    };
  }

  if (expiresAt && expiresAt < now) {
    return {
      actionState: "EXPIRED",
      hiringStage: "Request",
      stateLabel: "PASS EXPIRED",
      headline: "This Manager Pass has expired.",
      summary: "Ask HR to issue a fresh Pass if your input is still required.",
      urgency: "attention",
      nextDecision: { kind: "NONE", label: "Request fresh Pass", description: "This Pass cannot accept decisions.", target: "none" },
      evidence,
    };
  }

  if (pass?.jdStatus !== "approved") {
    return {
      actionState: "ACTION_REQUIRED",
      hiringStage: "Request",
      stateLabel: "ACTION REQUIRED",
      headline: "Approve the hiring request.",
      summary: "Review the role details and either approve the request or ask HR for changes.",
      urgency: "attention",
      nextDecision: {
        kind: "APPROVE_JD",
        label: "Review hiring request",
        description: "Approve the job description or request changes.",
        target: "request",
      },
      evidence,
    };
  }

  if (pendingCandidate) {
    return {
      actionState: "ACTION_REQUIRED",
      hiringStage: "Screening",
      stateLabel: "ACTION REQUIRED",
      headline: "Review the next candidate.",
      summary: "Shortlist or reject the candidate using the evidence shown here.",
      urgency: "attention",
      nextDecision: {
        kind: "REVIEW_CANDIDATE",
        label: "Review candidate",
        description: "Make a screening decision from this pass.",
        target: "candidate",
        candidateId: pendingCandidate.id,
      },
      evidence,
    };
  }

  if (!pass?.interviewSetupCompleted && candidates.some((candidate) => (candidate.status || "").toLowerCase() === "shortlisted")) {
    return {
      actionState: "ACTION_REQUIRED",
      hiringStage: "Interview",
      stateLabel: "ACTION REQUIRED",
      headline: "Set interview availability.",
      summary: "Give HR the interview format and availability needed to proceed.",
      urgency: "attention",
      nextDecision: {
        kind: "SET_INTERVIEW_AVAILABILITY",
        label: "Set interview availability",
        description: "Configure interview details for shortlisted candidates.",
        target: "interview",
      },
      evidence,
    };
  }

  if (interviewCandidate) {
    return {
      actionState: "ACTION_REQUIRED",
      hiringStage: "Interview",
      stateLabel: "ACTION REQUIRED",
      headline: "Submit interview evaluation.",
      summary: "Record structured feedback so HR can move the process forward.",
      urgency: "attention",
      nextDecision: {
        kind: "SUBMIT_EVALUATION",
        label: "Submit evaluation",
        description: "Complete the interview scorecard.",
        target: "evaluation",
        candidateId: interviewCandidate.id,
      },
      evidence,
    };
  }

  if (finalDecisionCandidate) {
    return {
      actionState: "ACTION_REQUIRED",
      hiringStage: "Decision",
      stateLabel: "ACTION REQUIRED",
      headline: "Make the final hiring decision.",
      summary: "Choose hire, reserve, or reject for the evaluated candidate.",
      urgency: "attention",
      nextDecision: {
        kind: "MAKE_FINAL_DECISION",
        label: "Make final decision",
        description: "Submit your final decision to HR.",
        target: "decision",
        candidateId: finalDecisionCandidate.id,
      },
      evidence,
    };
  }

  if (hasUpcomingInterview(input.interviews, now)) {
    return {
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
    };
  }

  if (candidates.length > 0 && candidates.every((candidate) => ["rejected", "hired", "offer"].includes((candidate.status || "").toLowerCase()))) {
    return {
      actionState: "COMPLETED",
      hiringStage: "Decision",
      stateLabel: "COMPLETED",
      headline: "You're done for now. HR has your decision.",
      summary: "There are no open manager actions on this Pass.",
      urgency: "normal",
      nextDecision: {
        kind: "NONE",
        label: "No decision required",
        description: "HR will handle the next step.",
        target: "none",
      },
      evidence,
    };
  }

  return {
    actionState: "WAITING",
    hiringStage: "Screening",
    stateLabel: "ALL CAUGHT UP",
    headline: "You're done for now. HR has what it needs.",
    summary: "This Pass will show a decision when your input is required again.",
    urgency: "normal",
    nextDecision: {
      kind: "NONE",
      label: "No decision required",
      description: "HR will update this Pass when there is something to decide.",
      target: "none",
    },
    evidence,
  };
}
