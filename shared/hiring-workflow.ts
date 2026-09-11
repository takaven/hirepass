export const HIRING_STAGES = ["new", "screening", "shortlisted", "interview", "offer", "hired"] as const;
export type HiringStage = (typeof HIRING_STAGES)[number];

export const DEFAULT_HIRING_STAGES: HiringStage[] = [...HIRING_STAGES];
export const TERMINAL_CANDIDATE_STATUSES = ["rejected", "withdrawn"] as const;

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
