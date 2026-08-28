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
    id?: number | null;
    status?: string | null;
    softSkillsCompletedAt?: Date | string | null;
    technicalCompletedAt?: Date | string | null;
  };
  pass?: {
    targetHireDate?: Date | string | null;
    softSkillsAssessmentUrl?: string | null;
    technicalAssessmentUrl?: string | null;
  } | null;
  messages?: Array<{ senderType?: string | null; isRead?: boolean | null; createdAt?: Date | string | null }>;
  documents?: Array<{ status?: string | null; label?: string | null; docType?: string | null; dueDate?: Date | string | null }>;
  interviews?: Array<{
    status?: string | null;
    interviewDate?: Date | string | null;
    startTime?: string | null;
    format?: string | null;
  }>;
  offer?: { status?: string | null; startDate?: Date | string | null; sentAt?: Date | string | null; respondedAt?: Date | string | null } | null;
  interviewSlots?: unknown[];
  activity?: Array<{
    action?: string | null;
    actorType?: string | null;
    actorName?: string | null;
    targetType?: string | null;
    targetId?: number | null;
    details?: unknown;
    createdAt?: Date | string | null;
  }>;
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

function formatDateTime(value: Date | string | null | undefined, now: Date): string {
  const date = toDate(value);
  if (!date) return "";
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dateOnly = date.toISOString().slice(0, 10);
  const time = date.toISOString().slice(11, 16);
  if (dateOnly === today) return `today, ${time}`;
  if (dateOnly === yesterday) return `yesterday, ${time}`;
  return `${dateOnly}, ${time}`;
}

function activityDetails(activity: { details?: unknown }): Record<string, unknown> {
  return activity.details && typeof activity.details === "object" && !Array.isArray(activity.details)
    ? activity.details as Record<string, unknown>
    : {};
}

function isCandidateRelevantActivity(passCandidateId: number | null | undefined, activity: NonNullable<CandidatePassStateInput["activity"]>[number]): boolean {
  if (!passCandidateId) return true;
  const details = activityDetails(activity);
  return details.passCandidateId === passCandidateId
    || activity.targetId === passCandidateId
    || activity.targetType === "share_link"
    || activity.targetType === "candidate_link"
    || activity.targetType === "offer";
}

function meaningfulActivityLabel(activity: NonNullable<CandidatePassStateInput["activity"]>[number]): string | null {
  switch (activity.action) {
    case "manager_final_decision_submitted":
      return "Hiring Manager submitted a decision";
    case "manager_evaluation_submitted":
      return "Hiring Manager submitted interview feedback";
    case "manager_interview_setup_completed":
      return "Hiring Manager set interview availability";
    case "candidate_interview_slot_booked":
      return "Interview slot confirmed";
    case "candidate_document_submitted":
      return "Document received";
    case "candidate_assessment_completed":
      return "Assessment completion recorded";
    case "candidate_offer_accepted_handoff":
      return "Offer accepted";
    case "candidate_offer_response_submitted":
      return "Offer response submitted";
    case "candidate_pass_issued":
      return "Candidate Pass issued";
    case "manager_pass_issued":
      return "Manager Pass issued";
    case "pass_nudge_recorded":
      return "Hiring team recorded a follow-up";
    default:
      return null;
  }
}

function latestMeaningfulUpdate(input: CandidatePassStateInput, now: Date): { text: string; at: string | null; date: Date | null } {
  const activity = (input.activity || [])
    .filter((item) => isCandidateRelevantActivity(input.passCandidate.id, item))
    .map((item) => ({ item, label: meaningfulActivityLabel(item), date: toDate(item.createdAt) }))
    .filter((item): item is { item: NonNullable<CandidatePassStateInput["activity"]>[number]; label: string; date: Date } => Boolean(item.label && item.date))
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

  if (activity) {
    return {
      text: `${activity.label} · ${formatDateTime(activity.date, now)}`,
      at: activity.date.toISOString(),
      date: activity.date,
    };
  }

  const latestMessage = input.messages
    ?.map((message) => ({ message, date: toDate(message.createdAt) }))
    .filter((item): item is { message: NonNullable<CandidatePassStateInput["messages"]>[number]; date: Date } => Boolean(item.date))
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
  if (latestMessage?.message.senderType === "hr") {
    return {
      text: `Hiring team sent a message · ${formatDateTime(latestMessage.date, now)}`,
      at: latestMessage.date.toISOString(),
      date: latestMessage.date,
    };
  }

  const latestInterview = input.interviews
    ?.map((interview) => ({ interview, date: toDate(interview.interviewDate) }))
    .filter((item): item is { interview: NonNullable<CandidatePassStateInput["interviews"]>[number]; date: Date } => Boolean(item.date))
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
  if (latestInterview) {
    return {
      text: `Interview details available · ${formatDateTime(latestInterview.date, now)}`,
      at: latestInterview.date.toISOString(),
      date: latestInterview.date,
    };
  }

  return { text: "Your application Pass is active.", at: null, date: null };
}

function expectedMovement(input: CandidatePassStateInput, waitingOn: string, next: string, now: Date): string {
  const pendingDocument = input.documents?.find((document) => document.status === "pending" && document.dueDate);
  const pendingDocumentDue = toDate(pendingDocument?.dueDate);
  if (pendingDocumentDue) return `Expected movement: document due by ${pendingDocumentDue.toISOString().slice(0, 10)}.`;

  const nextInterview = input.interviews
    ?.map((interview) => toDate(interview.interviewDate))
    .filter((date): date is Date => Boolean(date && date >= now))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (nextInterview) return `Expected movement: interview scheduled for ${nextInterview.toISOString().slice(0, 10)}.`;

  const offerStart = toDate(input.offer?.startDate);
  if (offerStart && input.offer?.status === "pending") return `Expected movement: offer response requested before ${offerStart.toISOString().slice(0, 10)}.`;

  const targetHire = toDate(input.pass?.targetHireDate);
  if (targetHire && targetHire >= now) return `Expected movement: hiring team is working toward ${targetHire.toISOString().slice(0, 10)}.`;

  return `Expected movement: no update date is set yet. This Pass will update when ${waitingOn.toLowerCase()} completes ${next.toLowerCase()}.`;
}

function passHandoff(latest: { text: string; date: Date | null }, waitingOn: string): string | null {
  if (!latest.date) return null;
  const owner = waitingOn === "Hiring team" ? "HR" : waitingOn;
  if (latest.text.startsWith("Hiring Manager")) return `Pass Handoff: Hiring Manager -> ${owner}`;
  if (latest.text.startsWith("Interview slot") || latest.text.startsWith("Document") || latest.text.startsWith("Assessment") || latest.text.startsWith("Offer")) {
    return `Pass Handoff: Candidate -> ${owner}`;
  }
  if (latest.text.startsWith("Hiring team")) return `Pass Handoff: HR -> ${owner}`;
  return null;
}

function withPassState(base: Omit<CandidatePassViewState, "now" | "yourAction" | "next" | "expectedMovement" | "latestUpdateAt" | "passHandoff">, input: CandidatePassStateInput, now: Date): CandidatePassViewState {
  const latest = latestMeaningfulUpdate(input, now);
  return {
    ...base,
    now: base.headline,
    yourAction: base.nextAction.label,
    next: base.nextAction.description,
    expectedMovement: expectedMovement(input, base.waitingOn, base.nextAction.description, now),
    latestUpdate: base.latestUpdate || latest.text,
    latestUpdateAt: latest.at,
    passHandoff: passHandoff(latest, base.waitingOn),
  };
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
    return withPassState({
      actionState: "REVOKED",
      hiringStage,
      stateLabel: "PASS NOT ACTIVE",
      headline: "This hiring Pass is no longer active.",
      summary: "Please contact the hiring team if you believe this is a mistake.",
      waitingOn: "Hiring team",
      nextAction: { kind: "NONE", label: "Contact hiring team", description: "This Pass cannot accept actions.", target: "none" },
      latestUpdate: "Pass access is not active.",
      journey: buildJourney(hiringStage),
    }, input, now);
  }

  if (expiresAt && expiresAt < now) {
    return withPassState({
      actionState: "EXPIRED",
      hiringStage,
      stateLabel: "PASS EXPIRED",
      headline: "This hiring Pass has expired.",
      summary: "Ask the hiring team to issue a fresh Pass if the process is still active.",
      waitingOn: "Hiring team",
      nextAction: { kind: "NONE", label: "Request a new Pass", description: "This Pass cannot accept actions.", target: "none" },
      latestUpdate: "Pass access expired.",
      journey: buildJourney(hiringStage),
    }, input, now);
  }

  if (status === "hired") {
    return withPassState({
      actionState: "COMPLETED",
      hiringStage,
      stateLabel: "COMPLETED",
      headline: "Your hiring journey is complete.",
      summary: "The hiring team will guide the employment handoff outside this Candidate Pass.",
      waitingOn: "Handoff",
      nextAction: { kind: "NONE", label: "No action required", description: "Your Candidate Pass work is complete.", target: "none" },
      latestUpdate: "",
      journey: buildJourney(hiringStage),
    }, input, now);
  }

  if (["rejected", "withdrawn"].includes(status)) {
    return withPassState({
      actionState: "COMPLETED",
      hiringStage,
      stateLabel: "PROCESS CLOSED",
      headline: "This hiring process is closed.",
      summary: "There is no further action required on this Candidate Pass.",
      waitingOn: "Process closed",
      nextAction: { kind: "NONE", label: "No action required", description: "This Candidate Pass is closed.", target: "none" },
      latestUpdate: "",
      journey: buildJourney(hiringStage),
    }, input, now);
  }

  if (input.offer?.status === "pending") {
    return withPassState({
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
    }, input, now);
  }

  if (needsSoftAssessment || needsTechnicalAssessment) {
    return withPassState({
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
      latestUpdate: "",
      journey: buildJourney("Assessment"),
    }, input, now);
  }

  if (availableInterviewSlots > 0 && (status === "shortlisted" || status === "screening")) {
    return withPassState({
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
    }, input, now);
  }

  if (pendingDocuments.length > 0) {
    const firstDocument = pendingDocuments[0];
    return withPassState({
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
      latestUpdate: "",
      journey: buildJourney(hiringStage),
    }, input, now);
  }

  if (unreadHrMessages.length > 0) {
    return withPassState({
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
    }, input, now);
  }

  if (upcomingInterview) {
    return withPassState({
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
      latestUpdate: "",
      journey: buildJourney("Interview"),
    }, input, now);
  }

  return withPassState({
    actionState: "WAITING",
    hiringStage,
    stateLabel: "WAITING ON EMPLOYER",
    headline: "You're all set. We're waiting on the hiring team.",
    summary: "There is nothing you need to do right now.",
    waitingOn: "Hiring team",
    nextAction: {
      kind: "NONE",
      label: "No action required",
      description: "Hiring team completes the next step.",
      target: "none",
    },
    latestUpdate: "",
    journey: buildJourney(hiringStage),
  }, input, now);
}
