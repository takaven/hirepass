export type PublicSubmissionResult = { duplicateApplication?: boolean };

export function getPublicSubmissionConfirmation(
  kind: "general" | "vacancy",
  result: PublicSubmissionResult,
) {
  if (kind === "vacancy" && result.duplicateApplication) {
    return {
      title: "Application already received",
      detail: "Your existing application remains on file.",
    };
  }
  if (kind === "vacancy") {
    return {
      title: "Application submitted",
      detail: "Your application and CV were received. The hiring team will contact you if there is a suitable next step.",
    };
  }
  return {
    title: "CV submitted",
    detail: "Your details and CV were received. The hiring team will contact you if there is a suitable next step.",
  };
}
