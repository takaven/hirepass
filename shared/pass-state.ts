export type CandidatePassActionState =
  | "ACTION_REQUIRED"
  | "WAITING"
  | "UPCOMING"
  | "COMPLETED"
  | "EXPIRED"
  | "REVOKED";

export type CandidateHiringStage =
  | "Application"
  | "Screening"
  | "Interview"
  | "Assessment"
  | "Decision"
  | "Offer"
  | "Handoff";

export type CandidateNextAction =
  | {
      kind:
        | "CHOOSE_INTERVIEW_SLOT"
        | "CONFIRM_INTERVIEW"
        | "UPLOAD_DOCUMENT"
        | "COMPLETE_ASSESSMENT"
        | "RESPOND_TO_MESSAGE"
        | "REVIEW_OFFER";
      label: string;
      description: string;
      target: "interview" | "documents" | "assessment" | "messages" | "offer";
    }
  | {
      kind: "NONE";
      label: string;
      description: string;
      target: "none";
    };

export type CandidateJourneyStep = {
  stage: CandidateHiringStage;
  status: "completed" | "current" | "upcoming";
};

export type CandidatePassViewState = {
  actionState: CandidatePassActionState;
  hiringStage: CandidateHiringStage;
  stateLabel: string;
  headline: string;
  summary: string;
  waitingOn: string;
  now: string;
  yourAction: string;
  next: string;
  expectedMovement: string;
  nextAction: CandidateNextAction;
  latestUpdate: string;
  latestUpdateAt: string | null;
  passHandoff: string | null;
  journey: CandidateJourneyStep[];
};

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
  waitingOn: string;
  next: string;
  expectedMovement: string;
  latestUpdate: string;
  passHandoff: string | null;
  nextDecision: ManagerNextDecision;
  evidence: ManagerEvidenceSummary;
};
