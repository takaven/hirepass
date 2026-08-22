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

export type CandidatePassStateInput = {
  link?: { isActive?: boolean | null; expiresAt?: Date | string | null } | null;
  passCandidate: {
    status?: string | null;
    softSkillsCompletedAt?: Date | string | null;
    technicalCompletedAt?: Date | string | null;
  };
  pass?: {
    softSkillsAssessmentUrl?: string | null;
    technicalAssessmentUrl?: string | null;
  } | null;
  messages?: Array<{ senderType?: string | null; isRead?: boolean | null; createdAt?: Date | string | null }>;
  documents?: Array<{ status?: string | null; label?: string | null; docType?: string | null }>;
  interviews?: Array<{
    status?: string | null;
    interviewDate?: Date | string | null;
    startTime?: string | null;
    format?: string | null;
  }>;
  offer?: { status?: string | null; startDate?: Date | string | null } | null;
  interviewSlots?: unknown[];
  now?: Date;
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
  nextAction: CandidateNextAction;
  latestUpdate: string;
  journey: CandidateJourneyStep[];
};

const stageOrder: CandidateHiringStage[] = [
  "Application",
  "Screening",
  "Assessment",
  "Interview",
  "Decision",
  "Offer",
  "Handoff",
];

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function mapCandidateHiringStage(status?: string | null): CandidateHiringStage {
  switch ((status || "new").toLowerCase()) {
    case "screening":
      return "Screening";
    case "shortlisted":
      return "Assessment";
    case "interview":
      return "Interview";
    case "offer":
      return "Offer";
    case "hired":
      return "Handoff";
    case "rejected":
      return "Decision";
    case "new":
    default:
      return "Application";
  }
}

function buildJourney(currentStage: CandidateHiringStage): CandidateJourneyStep[] {
  const currentIndex = stageOrder.indexOf(currentStage);
  return stageOrder.map((stage, index) => ({
    stage,
    status: index < currentIndex ? "completed" : index === currentIndex ? "current" : "upcoming",
  }));
}

function hasUpcomingInterview(interviews: CandidatePassStateInput["interviews"], now: Date): boolean {
  return Boolean(
    interviews?.some((interview) => {
      const date = toDate(interview.interviewDate);
      return date && date >= now && interview.status !== "cancelled";
    }),
  );
}

function latestUpdate(messages: CandidatePassStateInput["messages"], interviews: CandidatePassStateInput["interviews"]): string {
  const latestMessage = messages?.[0];
  if (latestMessage?.senderType === "hr") {
    return "The hiring team sent you an update.";
  }

  const latestInterview = interviews?.[0];
  if (latestInterview) {
    return "Your interview details are available on this Pass.";
  }

  return "Your application Pass is active.";
}

export function resolveCandidatePassState(input: CandidatePassStateInput): CandidatePassViewState {
  const now = input.now ?? new Date();
  const expiresAt = toDate(input.link?.expiresAt);
  const status = (input.passCandidate.status || "new").toLowerCase();
  const hiringStage = mapCandidateHiringStage(status);
  const pendingDocuments = input.documents?.filter((doc) => doc.status === "pending") ?? [];
  const unreadHrMessages = input.messages?.filter((message) => message.senderType === "hr" && !message.isRead) ?? [];
  const needsSoftAssessment = Boolean(input.pass?.softSkillsAssessmentUrl && !input.passCandidate.softSkillsCompletedAt);
  const needsTechnicalAssessment = Boolean(input.pass?.technicalAssessmentUrl && !input.passCandidate.technicalCompletedAt);
  const availableInterviewSlots = input.interviewSlots?.length ?? 0;
  const upcomingInterview = hasUpcomingInterview(input.interviews, now);

  if (!input.link?.isActive) {
    return {
      actionState: "REVOKED",
      hiringStage,
      stateLabel: "PASS NOT ACTIVE",
      headline: "This hiring Pass is no longer active.",
      summary: "Please contact the hiring team if you believe this is a mistake.",
      waitingOn: "Hiring team",
      nextAction: { kind: "NONE", label: "Contact hiring team", description: "This Pass cannot accept actions.", target: "none" },
      latestUpdate: "Pass access is not active.",
      journey: buildJourney(hiringStage),
    };
  }

  if (expiresAt && expiresAt < now) {
    return {
      actionState: "EXPIRED",
      hiringStage,
      stateLabel: "PASS EXPIRED",
      headline: "This hiring Pass has expired.",
      summary: "Ask the hiring team to issue a fresh Pass if the process is still active.",
      waitingOn: "Hiring team",
      nextAction: { kind: "NONE", label: "Request a new Pass", description: "This Pass cannot accept actions.", target: "none" },
      latestUpdate: "Pass access expired.",
      journey: buildJourney(hiringStage),
    };
  }

  if (status === "hired") {
    return {
      actionState: "COMPLETED",
      hiringStage,
      stateLabel: "COMPLETED",
      headline: "Your hiring journey is complete.",
      summary: "The hiring team will guide the employment handoff outside this Candidate Pass.",
      waitingOn: "Handoff",
      nextAction: { kind: "NONE", label: "No action required", description: "Your Candidate Pass work is complete.", target: "none" },
      latestUpdate: latestUpdate(input.messages, input.interviews),
      journey: buildJourney(hiringStage),
    };
  }

  if (input.offer?.status === "pending") {
    return {
      actionState: "ACTION_REQUIRED",
      hiringStage,
      stateLabel: "ACTION REQUIRED",
      headline: "Review your offer.",
      summary: "An offer is waiting for your response.",
      waitingOn: "Candidate",
      nextAction: {
        kind: "REVIEW_OFFER",
        label: "Review offer",
        description: "Review the offer details and submit your response.",
        target: "offer",
      },
      latestUpdate: "An offer has been issued.",
      journey: buildJourney(hiringStage),
    };
  }

  if (needsSoftAssessment || needsTechnicalAssessment) {
    return {
      actionState: "ACTION_REQUIRED",
      hiringStage: "Assessment",
      stateLabel: "ACTION REQUIRED",
      headline: needsSoftAssessment ? "Complete your soft skills assessment." : "Complete your technical assessment.",
      summary: "Your assessment keeps the hiring process moving.",
      waitingOn: "Candidate",
      nextAction: {
        kind: "COMPLETE_ASSESSMENT",
        label: needsSoftAssessment ? "Complete soft skills assessment" : "Complete technical assessment",
        description: "Open the assessment, complete it, then confirm completion here.",
        target: "assessment",
      },
      latestUpdate: latestUpdate(input.messages, input.interviews),
      journey: buildJourney("Assessment"),
    };
  }

  if (availableInterviewSlots > 0 && (status === "shortlisted" || status === "screening")) {
    return {
      actionState: "ACTION_REQUIRED",
      hiringStage: "Interview",
      stateLabel: "ACTION REQUIRED",
      headline: "Choose your interview slot.",
      summary: "Select the interview time that works best for you.",
      waitingOn: "Candidate",
      nextAction: {
        kind: "CHOOSE_INTERVIEW_SLOT",
        label: "Choose interview slot",
        description: "Pick one available time from the hiring team.",
        target: "interview",
      },
      latestUpdate: "Interview slots are available.",
      journey: buildJourney("Interview"),
    };
  }

  if (pendingDocuments.length > 0) {
    const firstDocument = pendingDocuments[0];
    return {
      actionState: "ACTION_REQUIRED",
      hiringStage,
      stateLabel: "ACTION REQUIRED",
      headline: `Upload ${firstDocument.label || firstDocument.docType || "requested document"}.`,
      summary: "A requested document is still pending.",
      waitingOn: "Candidate",
      nextAction: {
        kind: "UPLOAD_DOCUMENT",
        label: "Upload document",
        description: "Open the document section and upload the requested file.",
        target: "documents",
      },
      latestUpdate: latestUpdate(input.messages, input.interviews),
      journey: buildJourney(hiringStage),
    };
  }

  if (unreadHrMessages.length > 0) {
    return {
      actionState: "ACTION_REQUIRED",
      hiringStage,
      stateLabel: "ACTION REQUIRED",
      headline: "Review the latest hiring-team message.",
      summary: "The hiring team sent an update that may need your response.",
      waitingOn: "Candidate",
      nextAction: {
        kind: "RESPOND_TO_MESSAGE",
        label: "Open message",
        description: "Read the update and reply if needed.",
        target: "messages",
      },
      latestUpdate: "The hiring team sent a message.",
      journey: buildJourney(hiringStage),
    };
  }

  if (upcomingInterview) {
    return {
      actionState: "UPCOMING",
      hiringStage: "Interview",
      stateLabel: "UPCOMING",
      headline: "Your interview is scheduled.",
      summary: "No extra action is needed unless the hiring team sends an update.",
      waitingOn: "Scheduled event",
      nextAction: {
        kind: "NONE",
        label: "Review interview details",
        description: "Keep the interview details handy.",
        target: "none",
      },
      latestUpdate: latestUpdate(input.messages, input.interviews),
      journey: buildJourney("Interview"),
    };
  }

  return {
    actionState: "WAITING",
    hiringStage,
    stateLabel: "WAITING ON EMPLOYER",
    headline: "You're all set. We're waiting on the hiring team.",
    summary: "There is nothing you need to do right now.",
    waitingOn: "Hiring team",
    nextAction: {
      kind: "NONE",
      label: "No action required",
      description: "We will update this Pass when the next step is ready.",
      target: "none",
    },
    latestUpdate: latestUpdate(input.messages, input.interviews),
    journey: buildJourney(hiringStage),
  };
}
