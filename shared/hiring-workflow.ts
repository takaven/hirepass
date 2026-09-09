export const HIRING_STAGES = ["new", "screening", "shortlisted", "interview", "offer", "hired"] as const;
export type HiringStage = (typeof HIRING_STAGES)[number];

export const DEFAULT_HIRING_STAGES: HiringStage[] = [...HIRING_STAGES];
export const TERMINAL_CANDIDATE_STATUSES = ["rejected", "withdrawn"] as const;

export const HIRING_STAGE_LABELS: Record<HiringStage, string> = {
  new: "Applied",
  screening: "Review",
  shortlisted: "Shortlisted",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
};

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
