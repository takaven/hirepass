export type PublicSubmissionResult = { duplicateApplication?: boolean; reusedCandidate?: boolean; candidatePassUrl?: string | null };

export function getPublicSubmissionConfirmation(
  kind: "general" | "vacancy",
  result: PublicSubmissionResult,
) {
  if (kind === "vacancy" && result.duplicateApplication) {
    return {
      title: "Application already received",
      detail: "Your existing application remains on file.",
      candidatePassUrl: null,
    };
  }
  if (kind === "vacancy") {
    return {
      title: "Application received",
      detail: "Your application and CV were received. The hiring team will contact you if there is a suitable next step.",
      candidatePassUrl: result.reusedCandidate ? null : result.candidatePassUrl || null,
    };
  }
  return {
    title: "CV submitted",
    detail: "Your details and CV were received. The hiring team will contact you if there is a suitable next step.",
    candidatePassUrl: null,
  };
}
