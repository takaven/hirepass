export const HIRING_STAGES = ["new", "screening", "shortlisted", "interview", "offer", "hired"] as const;
export type HiringStage = (typeof HIRING_STAGES)[number];

export const DEFAULT_HIRING_STAGES: HiringStage[] = [...HIRING_STAGES];
export const TERMINAL_CANDIDATE_STATUSES = ["rejected", "withdrawn"] as const;
export const OPEN_VACANCY_STATUSES = [
  "active",
  "open",
  "in_progress",
  "awaiting_jd_approval",
  "sourcing",
  "screening",
  "interviewing",
  "decision",
  "offer_pending",
] as const;

export const HIRING_STAGE_LABELS: Record<HiringStage, string> = {
  new: "Applied",
  screening: "Review",
  shortlisted: "Review",
  interview: "Interview",
  offer: "Decision",
  hired: "Hired",
};

export const SIMPLE_HIRING_JOURNEY = ["applied", "review", "interview", "decision"] as const;
export type SimpleHiringJourneyStep = (typeof SIMPLE_HIRING_JOURNEY)[number];

export type PresentedCandidateOutcome = "hired" | "not_selected" | "withdrawn" | null;
export type VisibleHiringLabel = "Applied" | "Review" | "Interview" | "Decision";
export type CandidateStatusOption = {
  value: HiringStage | "rejected" | "withdrawn";
  label: VisibleHiringLabel | "Hired" | "Not selected" | "Withdrawn";
  kind: "phase" | "outcome";
  fixed?: boolean;
};

export type VisibleHiringPhase = {
  step: SimpleHiringJourneyStep;
  value: HiringStage;
  label: VisibleHiringLabel;
  fixed: boolean;
  optional?: boolean;
};

export const VISIBLE_HIRING_PHASES: VisibleHiringPhase[] = [
  { step: "applied", value: "new", label: "Applied", fixed: true },
  { step: "review", value: "screening", label: "Review", fixed: true },
  { step: "interview", value: "interview", label: "Interview", fixed: false, optional: true },
  { step: "decision", value: "offer", label: "Decision", fixed: true },
];

export const TERMINAL_HIRING_OUTCOMES: CandidateStatusOption[] = [
  { value: "hired", label: "Hired", kind: "outcome", fixed: true },
  { value: "rejected", label: "Not selected", kind: "outcome" },
  { value: "withdrawn", label: "Withdrawn", kind: "outcome" },
];

export function presentHiringStage(status: string | null | undefined): {
  step: SimpleHiringJourneyStep;
  label: "Applied" | "Review" | "Interview" | "Decision";
  outcome: PresentedCandidateOutcome;
  outcomeLabel: "Hired" | "Not selected" | "Withdrawn" | null;
} {
  switch (status) {
    case "interview":
      return { step: "interview", label: "Interview", outcome: null, outcomeLabel: null };
    case "offer":
      return { step: "decision", label: "Decision", outcome: null, outcomeLabel: null };
    case "hired":
    case "handoff":
      return { step: "decision", label: "Decision", outcome: "hired", outcomeLabel: "Hired" };
    case "rejected":
      return { step: "decision", label: "Decision", outcome: "not_selected", outcomeLabel: "Not selected" };
    case "withdrawn":
      return { step: "decision", label: "Decision", outcome: "withdrawn", outcomeLabel: "Withdrawn" };
    case "screening":
    case "shortlisted":
    case "assessment":
      return { step: "review", label: "Review", outcome: null, outcomeLabel: null };
    case "new":
    default:
      return { step: "applied", label: "Applied", outcome: null, outcomeLabel: null };
  }
}

export function presentHiringStatusLabel(status: string | null | undefined): string {
  const presented = presentHiringStage(status);
  return presented.outcomeLabel ?? presented.label;
}

export function canonicalVisibleHiringPhases(): VisibleHiringPhase[] {
  return VISIBLE_HIRING_PHASES;
}

export function backendStatusForVisiblePhase(
  phase: SimpleHiringJourneyStep | VisibleHiringLabel,
  stages: unknown = DEFAULT_HIRING_STAGES,
): HiringStage | null {
  const configured = configuredStages(stages);
  const normalized = String(phase).toLowerCase();

  switch (normalized) {
    case "applied":
      return configured.includes("new") ? "new" : null;
    case "review":
      if (configured.includes("screening")) return "screening";
      if (configured.includes("shortlisted")) return "shortlisted";
      return null;
    case "interview":
      return configured.includes("interview") ? "interview" : null;
    case "decision":
      return configured.includes("offer") ? "offer" : null;
    default:
      return null;
  }
}

export function visibleHiringPhasesForConfiguredStages(stages: unknown = DEFAULT_HIRING_STAGES): VisibleHiringPhase[] {
  return VISIBLE_HIRING_PHASES.flatMap((phase) => {
    const value = backendStatusForVisiblePhase(phase.step, stages);
    return value ? [{ ...phase, value }] : [];
  });
}

export function uniqueVisibleHiringPhases(stages: unknown = DEFAULT_HIRING_STAGES): VisibleHiringPhase[] {
  return visibleHiringPhasesForConfiguredStages(stages);
}

export function candidateStatusOptions(stages: unknown = DEFAULT_HIRING_STAGES): CandidateStatusOption[] {
  const phaseOptions = visibleHiringPhasesForConfiguredStages(stages)
    .map((phase) => ({ value: phase.value, label: phase.label, kind: "phase" as const, fixed: phase.fixed }));
  return [...phaseOptions, ...TERMINAL_HIRING_OUTCOMES];
}

export function visibleStatusValue(status: string | null | undefined, stages: unknown = DEFAULT_HIRING_STAGES): CandidateStatusOption["value"] {
  const configured = configuredStages(stages);
  switch (status) {
    case "screening":
      return configured.includes("screening") ? "screening" : backendStatusForVisiblePhase("review", stages) ?? "new";
    case "shortlisted":
    case "assessment":
      return backendStatusForVisiblePhase("review", stages) ?? "new";
    case "offer":
      return configured.includes("offer") ? "offer" : "new";
    case "handoff":
      return "hired";
    case "rejected":
    case "withdrawn":
    case "new":
    case "interview":
    case "hired":
      return allowedCandidateStatus(status, stages) ? status : "new";
    default:
      return "new";
  }
}

export function shouldChangeVisibleCandidateStatus(
  currentStatus: string | null | undefined,
  targetStatus: CandidateStatusOption["value"],
  stages: unknown = DEFAULT_HIRING_STAGES,
): boolean {
  return visibleStatusValue(currentStatus, stages) !== targetStatus;
}

export function candidatesRequiringVisibleStatusChange<T extends { id: number; status: string | null | undefined }>(
  candidates: T[],
  selectedIds: number[],
  targetStatus: CandidateStatusOption["value"],
  stages: unknown = DEFAULT_HIRING_STAGES,
): T[] {
  const selected = new Set(selectedIds);
  return candidates.filter((candidate) =>
    selected.has(candidate.id) && shouldChangeVisibleCandidateStatus(candidate.status, targetStatus, stages)
  );
}

export function stagesFromVisibleWorkflow({ interviewEnabled }: { interviewEnabled: boolean }): HiringStage[] {
  return interviewEnabled
    ? ["new", "screening", "shortlisted", "interview", "offer", "hired"]
    : ["new", "screening", "shortlisted", "offer", "hired"];
}

export function isInterviewEnabled(stages: unknown): boolean {
  return configuredStages(stages).includes("interview");
}

export function isCanonicalVisibleWorkflow(stages: unknown): boolean {
  const configured = configuredStages(stages);
  return (
    sameStages(configured, stagesFromVisibleWorkflow({ interviewEnabled: true })) ||
    sameStages(configured, stagesFromVisibleWorkflow({ interviewEnabled: false }))
  );
}

function sameStages(left: HiringStage[], right: HiringStage[]): boolean {
  return left.length === right.length && left.every((stage, index) => stage === right[index]);
}

export function isOperationallyOpenVacancy(status: string | null | undefined): boolean {
  return OPEN_VACANCY_STATUSES.includes(status as typeof OPEN_VACANCY_STATUSES[number]);
}

export function presentCandidateSource(source: string | null | undefined): string {
  switch (source) {
    case "public_application":
    case "Direct":
      return "Careers application";
    case "general_submission":
      return "Talent pool";
    case "manual":
      return "Added by hiring team";
    case "LinkedIn":
      return "LinkedIn";
    case "Referral":
      return "Referral";
    case "Agency":
      return "Recruitment agency";
    case "Indeed":
    case "Bayt":
    case "GulfTalent":
      return source;
    case "Other":
      return "Other source";
    default:
      return source?.replace(/_/g, " ") || "Source not recorded";
  }
}

export function configuredStages(value: unknown): HiringStage[] {
  if (!Array.isArray(value)) return DEFAULT_HIRING_STAGES;
  const selected = HIRING_STAGES.filter((stage) => value.includes(stage));
  return selected.length >= 2 && selected[0] === "new" && selected.at(-1) === "hired"
    ? selected
    : DEFAULT_HIRING_STAGES;
}

export function validateConfiguredStages(value: unknown): value is HiringStage[] {
  if (!Array.isArray(value) || value.length < 2 || value[0] !== "new" || value.at(-1) !== "hired") return false;
  if (new Set(value).size !== value.length || value.some((stage) => !HIRING_STAGES.includes(stage as HiringStage))) return false;
  return value.every((stage, index) => index === 0 || HIRING_STAGES.indexOf(stage as HiringStage) > HIRING_STAGES.indexOf(value[index - 1] as HiringStage));
}

export function allowedCandidateStatus(status: string, stages: unknown): boolean {
  return configuredStages(stages).includes(status as HiringStage) || TERMINAL_CANDIDATE_STATUSES.includes(status as typeof TERMINAL_CANDIDATE_STATUSES[number]);
}

export function nextConfiguredStage(status: string, stages: unknown): HiringStage | null {
  const configured = configuredStages(stages);
  const index = configured.indexOf(status as HiringStage);
  return index >= 0 ? configured[index + 1] ?? null : null;
}
