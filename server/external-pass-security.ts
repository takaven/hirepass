import type {
  Candidate,
  CandidateDocument,
  CandidateLink,
  CandidateMessage,
  Interview,
  InterviewSlot,
  Offer,
  Pass,
  PassCandidate,
  ShareLink,
} from "@shared/schema";

export type CandidatePassCandidateDto = Pick<
  PassCandidate,
  "id" | "passId" | "candidateId" | "positionId" | "status" | "softSkillsCompletedAt" | "technicalCompletedAt" | "addedAt" | "shortlistedAt"
>;

export type CandidatePassCandidateProfileDto = Pick<
  Candidate,
  "id" | "name" | "email" | "phone" | "currentTitle" | "currentCompany" | "currentLocation"
>;

export type ManagerPassCandidateDto = {
  id: number;
  passId: number;
  candidateId: number;
  status: string | null;
  shortlistedAt?: Date | string | null;
  candidate: Pick<Candidate, "id" | "name" | "currentTitle" | "experienceYears" | "skills" | "cvSummary"> | null;
};

export type CandidatePassPassDto = Pick<
  Pass,
  "id" | "passId" | "positionTitle" | "department" | "location" | "employmentType" | "status" | "currentStep" | "softSkillsAssessmentUrl" | "technicalAssessmentUrl"
>;

export type ManagerPassPassDto = Pick<
  Pass,
  | "id"
  | "passId"
  | "positionTitle"
  | "headcount"
  | "department"
  | "location"
  | "employmentType"
  | "experienceMin"
  | "experienceMax"
  | "salaryRangeMin"
  | "salaryRangeMax"
  | "salaryCurrency"
  | "status"
  | "currentStep"
  | "jobDescriptionDraft"
  | "jobDescriptionFinal"
  | "jdStatus"
  | "interviewFormat"
  | "interviewDuration"
  | "interviewRounds"
  | "isPanelInterview"
  | "technicalAssessmentRequired"
  | "technicalAssessmentAreas"
  | "interviewSetupCompleted"
  | "targetHireDate"
>;

export type CandidatePassDocumentDto = Pick<
  CandidateDocument,
  "id" | "passCandidateId" | "docType" | "label" | "isRequired" | "isFromHr" | "fileName" | "fileSize" | "status" | "dueDate" | "uploadedAt" | "createdAt"
>;

export function toCandidatePassPassDto(pass: Pass | undefined): CandidatePassPassDto | null {
  if (!pass) return null;

  return {
    id: pass.id,
    passId: pass.passId,
    positionTitle: pass.positionTitle,
    department: pass.department,
    location: pass.location,
    employmentType: pass.employmentType,
    status: pass.status,
    currentStep: pass.currentStep,
    softSkillsAssessmentUrl: pass.softSkillsAssessmentUrl,
    technicalAssessmentUrl: pass.technicalAssessmentUrl,
  };
}

export function toManagerPassPassDto(pass: Pass | undefined): ManagerPassPassDto | null {
  if (!pass) return null;

  return {
    id: pass.id,
    passId: pass.passId,
    positionTitle: pass.positionTitle,
    headcount: pass.headcount,
    department: pass.department,
    location: pass.location,
    employmentType: pass.employmentType,
    experienceMin: pass.experienceMin,
    experienceMax: pass.experienceMax,
    salaryRangeMin: pass.salaryRangeMin,
    salaryRangeMax: pass.salaryRangeMax,
    salaryCurrency: pass.salaryCurrency,
    status: pass.status,
    currentStep: pass.currentStep,
    jobDescriptionDraft: pass.jobDescriptionDraft,
    jobDescriptionFinal: pass.jobDescriptionFinal,
    jdStatus: pass.jdStatus,
    interviewFormat: pass.interviewFormat,
    interviewDuration: pass.interviewDuration,
    interviewRounds: pass.interviewRounds,
    isPanelInterview: pass.isPanelInterview,
    technicalAssessmentRequired: pass.technicalAssessmentRequired,
    technicalAssessmentAreas: pass.technicalAssessmentAreas,
    interviewSetupCompleted: pass.interviewSetupCompleted,
    targetHireDate: pass.targetHireDate,
  };
}

export function toCandidatePassDocumentDto(document: CandidateDocument): CandidatePassDocumentDto {
  return {
    id: document.id,
    passCandidateId: document.passCandidateId,
    docType: document.docType,
    label: document.label,
    isRequired: document.isRequired,
    isFromHr: document.isFromHr,
    fileName: document.fileName,
    fileSize: document.fileSize,
    status: document.status,
    dueDate: document.dueDate,
    uploadedAt: document.uploadedAt,
    createdAt: document.createdAt,
  };
}

export function toCandidatePassCandidateDto(passCandidate: PassCandidate): CandidatePassCandidateDto {
  return {
    id: passCandidate.id,
    passId: passCandidate.passId,
    candidateId: passCandidate.candidateId,
    positionId: passCandidate.positionId,
    status: passCandidate.status,
    softSkillsCompletedAt: passCandidate.softSkillsCompletedAt,
    technicalCompletedAt: passCandidate.technicalCompletedAt,
    addedAt: passCandidate.addedAt,
    shortlistedAt: passCandidate.shortlistedAt,
  };
}

export function toCandidatePassCandidateProfileDto(candidate: Candidate | undefined): CandidatePassCandidateProfileDto | null {
  if (!candidate) return null;

  return {
    id: candidate.id,
    name: candidate.name,
    email: candidate.email,
    phone: candidate.phone,
    currentTitle: candidate.currentTitle,
    currentCompany: candidate.currentCompany,
    currentLocation: candidate.currentLocation,
  };
}

export function toManagerPassCandidateDto(passCandidate: PassCandidate & { candidate?: Candidate | null }): ManagerPassCandidateDto {
  return {
    id: passCandidate.id,
    passId: passCandidate.passId,
    candidateId: passCandidate.candidateId,
    status: passCandidate.status,
    shortlistedAt: passCandidate.shortlistedAt,
    candidate: passCandidate.candidate
      ? {
          id: passCandidate.candidate.id,
          name: passCandidate.candidate.name,
          currentTitle: passCandidate.candidate.currentTitle,
          experienceYears: passCandidate.candidate.experienceYears,
          skills: passCandidate.candidate.skills,
          cvSummary: passCandidate.candidate.cvSummary,
        }
      : null,
  };
}

export function toCandidateLinkDto(link: CandidateLink) {
  return {
    id: link.id,
    passCandidateId: link.passCandidateId,
    isActive: link.isActive,
    expiresAt: link.expiresAt,
  };
}

export function toManagerShareLinkDto(link: ShareLink) {
  return {
    id: link.id,
    passId: link.passId,
    managerId: link.managerId,
    linkType: link.linkType,
    isActive: link.isActive,
    expiresAt: link.expiresAt,
  };
}

export function isCandidateScopedInterviewSlot(passId: number, slot: Pick<InterviewSlot, "passId" | "isBooked"> | null | undefined): boolean {
  return Boolean(slot && slot.passId === passId && !slot.isBooked);
}

export function isCandidateScopedMessage(passCandidateId: number, message: Pick<CandidateMessage, "passCandidateId"> | null | undefined): boolean {
  return Boolean(message && message.passCandidateId === passCandidateId);
}

export function buildCandidatePassPayload(input: {
  candidateLink: CandidateLink;
  candidate: Candidate | undefined;
  passCandidate: PassCandidate;
  pass: Pass | undefined;
  messages: CandidateMessage[];
  documents: CandidateDocument[];
  timeline: unknown[];
  interviews: Interview[];
  offer: Offer | undefined;
  interviewSlots: InterviewSlot[];
  passState: unknown;
}) {
  return {
    candidateLink: toCandidateLinkDto(input.candidateLink),
    candidate: toCandidatePassCandidateProfileDto(input.candidate),
    passCandidate: toCandidatePassCandidateDto(input.passCandidate),
    pass: toCandidatePassPassDto(input.pass),
    messages: input.messages,
    documents: input.documents.map(toCandidatePassDocumentDto),
    timeline: input.timeline,
    interviews: input.interviews,
    offer: input.offer,
    interviewSlots: input.interviewSlots,
    passState: input.passState,
  };
}

export function buildManagerPassPayload(input: {
  shareLink: ShareLink;
  pass: Pass | undefined;
  candidates: Array<PassCandidate & { candidate?: Candidate | null }>;
  interviews: Interview[];
  manager: unknown;
  interviewSlots: InterviewSlot[];
  managerPassState: unknown;
}) {
  return {
    shareLink: toManagerShareLinkDto(input.shareLink),
    pass: toManagerPassPassDto(input.pass),
    candidates: input.candidates.map(toManagerPassCandidateDto),
    interviews: input.interviews,
    manager: input.manager,
    interviewSlots: input.interviewSlots,
    managerPassState: input.managerPassState,
  };
}
