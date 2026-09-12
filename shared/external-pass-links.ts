export type ExternalPassKind = "candidate" | "stakeholder";

export const EXTERNAL_PASS_CONTEXT_HEADER = "X-HirePass-Context";

const EXTERNAL_PASS_CONTEXT_PATTERN = /^[A-Za-z0-9_-]{22}$/;

const TOKEN_PATTERNS: Record<ExternalPassKind, RegExp> = {
  candidate: /^cand_[A-Za-z0-9_-]{43}$/,
  stakeholder: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
};

const LANDING_PATHS: Record<ExternalPassKind, string> = {
  candidate: "/candidate-pass",
  stakeholder: "/manager-pass",
};

export function isExternalPassToken(kind: ExternalPassKind, value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERNS[kind].test(value);
}

export function isExternalPassContextId(value: unknown): value is string {
  return typeof value === "string" && EXTERNAL_PASS_CONTEXT_PATTERN.test(value);
}

export function externalPassLandingPath(kind: ExternalPassKind, token: string): string {
  if (!isExternalPassToken(kind, token)) {
    throw new Error("Invalid external Pass token");
  }
  return `${LANDING_PATHS[kind]}#${encodeURIComponent(token)}`;
}

export function externalPassApiBase(kind: ExternalPassKind): string {
  return kind === "candidate" ? "/api/external/candidate-pass" : "/api/external/stakeholder-pass";
}
