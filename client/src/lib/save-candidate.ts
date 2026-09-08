type RequestFn = (method: string, url: string, data?: unknown) => Promise<Response>;

export async function saveCandidateWithOptionalCv(input: {
  existingCandidateId: number | null;
  candidatePayload: unknown;
  cvPayload?: { fileName: string; mimeType: string; fileDataBase64: string };
  request: RequestFn;
}) {
  const response = input.existingCandidateId
    ? await input.request("PATCH", `/api/candidates/${input.existingCandidateId}`, input.candidatePayload)
    : await input.request("POST", "/api/candidates", input.candidatePayload);
  const savedCandidate = await response.json() as { id: number };
  if (!input.cvPayload) return { savedCandidate, cvUploadFailed: false };
  try {
    await input.request("POST", `/api/candidates/${savedCandidate.id}/cv`, input.cvPayload);
    return { savedCandidate, cvUploadFailed: false };
  } catch (error) {
    return { savedCandidate, cvUploadFailed: true, error };
  }
}
