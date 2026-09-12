import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar,
  Check,
  CheckCircle,
  FileCheck,
  FileText,
  Inbox,
  Lock,
  MessageSquare,
  Send,
  Upload,
  User,
} from "lucide-react";
import type { Candidate, CandidateDocument, CandidateMessage, Interview, Offer, Pass, PassCandidate } from "@shared/schema";
import type { CandidatePassViewState } from "@shared/pass-state";
import { validateClientUpload } from "@/lib/upload-preflight";
import { ExternalPassBrand, ExternalPassFooter, externalPassAccentStyle } from "@/components/external-pass-brand";
import type { PublicConfig } from "./public-apply";
import { bootstrapExternalPassSession } from "@/lib/external-pass-session";

const CANDIDATE_PASS_API = "/api/external/candidate-pass";

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return reject(new Error("Could not read file"));
      resolve(result);
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

type CandidatePassCandidateProfile = Pick<Candidate, "id" | "name" | "email" | "phone" | "currentTitle" | "currentCompany" | "currentLocation">;
type CandidatePassApplication = Pick<
  PassCandidate,
  "id" | "passId" | "candidateId" | "positionId" | "status" | "softSkillsCompletedAt" | "technicalCompletedAt" | "addedAt" | "shortlistedAt"
>;

interface CandidatePassData {
  candidateLink: {
    id: number;
    passCandidateId: number;
    isActive: boolean;
    expiresAt: string | null;
  };
  candidate: CandidatePassCandidateProfile;
  passCandidate: CandidatePassApplication;
  pass: Pass;
  messages: CandidateMessage[];
  documents: CandidateDocument[];
  timeline: any[];
  interviews: Interview[];
  offer: Offer | null;
  interviewSlots: any[];
  passState: CandidatePassViewState;
}

export function candidatePassStatusEyebrow(
  passState: Pick<CandidatePassViewState, "actionState" | "stateLabel" | "nextAction">,
) {
  if (passState.nextAction.kind !== "NONE") return "Your next step";
  if (passState.stateLabel === "PROCESS CLOSED") return "Application closed";
  if (passState.actionState === "COMPLETED") return "Application complete";
  return "Current status";
}

function formatCandidateDate(value: string | Date | null | undefined) {
  if (!value) return "Date to be confirmed";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date to be confirmed";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

async function fetchCandidatePass(): Promise<CandidatePassData> {
  const response = await fetch(CANDIDATE_PASS_API, { credentials: "include" });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || "Unable to open this Candidate Pass");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return payload;
}

function AccessState({ status, message }: { status?: number; message?: string }) {
  const isExpired = status === 410;
  const title = isExpired ? "This Candidate Pass has expired" : "This Candidate Pass is not active";
  const body = isExpired
    ? "Ask the hiring team to issue a fresh Pass if the process is still active."
    : "This Pass may be invalid, revoked, or no longer available.";

  return (
    <div className="min-h-screen bg-[#F4F6F8] px-4 py-10 text-[#20242B]">
      <Card className="mx-auto max-w-md border-[#D8DEE5] bg-white">
        <CardContent className="pt-8 text-center">
          <Lock className={`mx-auto mb-4 h-12 w-12 ${isExpired ? "text-[#68707D]" : "text-red-600"}`} />
          <h1 className="mb-2 text-xl font-semibold text-[#20242B]">{title}</h1>
          <p className="text-sm text-[#68707D]">{message || body}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function PassJourney({ state }: { state: CandidatePassViewState }) {
  const currentStep = state.journey.find((step) => step.status === "current");

  return (
    <section className="rounded-[1.75rem] border border-[#D8DEE5] bg-white px-4 py-5 shadow-[0_12px_40px_rgba(32,36,43,0.05)] sm:px-6" aria-labelledby="candidate-journey-title">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="candidate-journey-title" className="text-sm font-semibold text-[#20242B]">Your journey</h2>
        <span className="rounded-full border border-[#D8DEE5] bg-[#F4F6F8] px-3 py-1 text-xs font-medium text-[#42494D]">
          {currentStep ? `${currentStep.stage} · Current` : state.stateLabel}
        </span>
      </div>
      <ol
        className="grid min-w-0"
        style={{ gridTemplateColumns: `repeat(${state.journey.length}, minmax(0, 1fr))` }}
        aria-label="Hiring journey"
      >
        {state.journey.map((step, index) => (
          <li key={step.stage} className="relative min-w-0 text-center" aria-current={step.status === "current" ? "step" : undefined}>
            {index > 0 && (
              <span
                className={`absolute left-0 top-3 h-px w-1/2 ${["completed", "current"].includes(step.status) ? "bg-[#42494D]" : "bg-[#D8DEE5]"}`}
                aria-hidden="true"
              />
            )}
            {index < state.journey.length - 1 && (
              <span
                className={`absolute right-0 top-3 h-px w-1/2 ${step.status === "completed" ? "bg-[#42494D]" : "bg-[#D8DEE5]"}`}
                aria-hidden="true"
              />
            )}
            <span
              className={`relative z-10 mx-auto flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white ${
                step.status === "completed"
                  ? "border-[#42494D] bg-[#42494D] text-white"
                  : step.status === "current"
                    ? "text-[#20242B]"
                    : "border-[#C8CED5] text-[#68707D]"
              }`}
              style={step.status === "current" ? { borderColor: "var(--customer-accent)" } : undefined}
              aria-hidden="true"
            >
              {step.status === "completed"
                ? <Check className="h-3.5 w-3.5" strokeWidth={3} />
                : step.status === "current"
                  ? <span className="h-2 w-2 rounded-full bg-[#20242B]" />
                  : step.status === "upcoming"
                    ? <span className="h-1.5 w-1.5 rounded-full bg-[#C8CED5]" />
                    : null}
            </span>
            <span className={`mt-2 block px-0.5 text-[12px] leading-4 sm:text-sm ${["upcoming", "neutral"].includes(step.status) ? "text-[#68707D]" : "font-medium text-[#20242B]"}`}>
              {step.stage}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function CandidatePortalPass() {
  const { toast } = useToast();
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<(Error & { status?: number }) | null>(null);
  const [messageText, setMessageText] = useState("");
  const [showSlotDialog, setShowSlotDialog] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [offerResponseMode, setOfferResponseMode] = useState<"negotiate" | "decline" | null>(null);
  const [offerResponseText, setOfferResponseText] = useState("");

  useEffect(() => {
    void bootstrapExternalPassSession("candidate").then((result) => {
      if (!result.ok) {
        const error = new Error(result.message) as Error & { status?: number };
        error.status = result.status;
        setSessionError(error);
      }
      setSessionReady(true);
    }).catch(() => {
      setSessionError(new Error("Unable to open this Candidate Pass"));
      setSessionReady(true);
    });
  }, []);

  const { data, isLoading, error } = useQuery<CandidatePassData>({
    queryKey: [CANDIDATE_PASS_API],
    queryFn: fetchCandidatePass,
    enabled: sessionReady && !sessionError,
    refetchInterval: (query) => {
      const state = query.state.data?.passState?.actionState;
      return state === "EXPIRED" || state === "REVOKED" || state === "COMPLETED" ? false : 30000;
    },
  });
  const { data: publicConfig } = useQuery<PublicConfig>({ queryKey: ["/api/public/config"] });

  const sendMessageMutation = useMutation({
    mutationFn: (message: string) => apiRequest("POST", `${CANDIDATE_PASS_API}/messages`, { message }),
    onSuccess: () => {
      toast({ title: "Message sent" });
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: [CANDIDATE_PASS_API] });
    },
    onError: () => toast({ title: "Message could not be sent", variant: "destructive" }),
  });

  const bookSlotMutation = useMutation({
    mutationFn: (slotId: number) => apiRequest("POST", `${CANDIDATE_PASS_API}/interview-slot`, { slotId }),
    onSuccess: () => {
      toast({ title: "Interview slot confirmed", description: "Your Candidate Pass has been updated." });
      setShowSlotDialog(false);
      setSelectedSlotId(null);
      queryClient.invalidateQueries({ queryKey: [CANDIDATE_PASS_API] });
    },
    onError: () => toast({ title: "Interview slot could not be confirmed", variant: "destructive" }),
  });

  const respondOfferMutation = useMutation({
    mutationFn: (response: { response: string; reason?: string; message?: string }) =>
      apiRequest("POST", `${CANDIDATE_PASS_API}/offer-response`, response),
    onSuccess: () => {
      toast({ title: "Offer response submitted", description: "Your Candidate Pass has been updated." });
      setOfferResponseMode(null);
      setOfferResponseText("");
      queryClient.invalidateQueries({ queryKey: [CANDIDATE_PASS_API] });
    },
    onError: () => toast({ title: "Offer response could not be submitted", variant: "destructive" }),
  });

  const confirmAssessmentMutation = useMutation({
    mutationFn: (assessmentType: string) => apiRequest("POST", `${CANDIDATE_PASS_API}/assessment-complete`, { assessmentType }),
    onSuccess: () => {
      toast({ title: "Assessment completion recorded", description: "Your Candidate Pass has been updated." });
      queryClient.invalidateQueries({ queryKey: [CANDIDATE_PASS_API] });
    },
    onError: () => toast({ title: "Assessment completion could not be recorded", variant: "destructive" }),
  });

  const submitDocumentMutation = useMutation({
    mutationFn: async ({ documentId, file }: { documentId: number; file: File }) =>
      apiRequest("POST", `${CANDIDATE_PASS_API}/documents`, {
        documentId,
        fileName: file.name,
        mimeType: file.type,
        fileDataBase64: await fileToBase64(file),
      }),
    onSuccess: () => {
      toast({ title: "Document received", description: "Your Candidate Pass has been updated." });
      queryClient.invalidateQueries({ queryKey: [CANDIDATE_PASS_API] });
    },
    onError: () => toast({ title: "Document could not be submitted", variant: "destructive" }),
  });

  if (!sessionReady || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6F8] px-4 text-[#20242B]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-[#20242B]" />
          <p className="text-sm text-[#68707D]">Opening your Candidate Pass...</p>
        </div>
      </div>
    );
  }

  if (sessionError || error || !data?.passCandidate) {
    const typedError = sessionError || error as Error & { status?: number };
    return <AccessState status={typedError?.status} message={typedError?.message} />;
  }

  const { candidate, passCandidate, pass, messages, documents, timeline, interviews, offer, interviewSlots, passState } = data;
  const pendingDocs = documents.filter((doc) => doc.status === "pending");
  const unreadMessages = messages.filter((message) => !message.isRead && message.senderType === "hr").length;
  const needsSoftAssessment = Boolean(pass.softSkillsAssessmentUrl && !passCandidate.softSkillsCompletedAt);
  const needsTechnicalAssessment = Boolean(pass.technicalAssessmentUrl && !passCandidate.technicalCompletedAt);
  const hasPrimaryAction = passState.nextAction.kind !== "NONE";

  const runPrimaryAction = () => {
    switch (passState.nextAction.target) {
      case "interview":
        setShowSlotDialog(true);
        break;
      case "assessment":
        document.getElementById("pass-assessments")?.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      case "documents":
        document.getElementById("pass-documents")?.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      case "messages":
        document.getElementById("pass-messages")?.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      case "offer":
        document.getElementById("pass-offer")?.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      default:
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div
      className="min-h-screen bg-[#F1F3F5] text-[#20242B] [color-scheme:light]"
      style={externalPassAccentStyle(publicConfig)}
      data-testid="candidate-pass-root"
    >
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:space-y-6 sm:px-6 sm:py-10">
        <header className="flex min-w-0 items-center justify-between gap-4">
          <ExternalPassBrand config={publicConfig} descriptor="Candidate Pass" />
          <span className="hidden shrink-0 items-center gap-2 rounded-full border border-[#D8DEE5] bg-white px-3 py-1.5 text-xs font-medium text-[#42494D] shadow-sm sm:inline-flex">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--customer-accent)" }} aria-hidden="true" />
            {passState.stateLabel}
          </span>
        </header>

        <section
          className="relative overflow-hidden rounded-[2rem] border border-[#CFD5DB] bg-white shadow-[0_18px_55px_rgba(32,36,43,0.08)]"
          data-testid="candidate-pass-identity"
          aria-labelledby="candidate-pass-name"
        >
          <div className="h-1.5 w-full" style={{ backgroundColor: "var(--customer-accent)" }} aria-hidden="true" />
          <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-8">
            <div className="flex min-w-0 items-start gap-4 sm:items-center">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#D8DEE5] bg-[#F4F6F8] text-[#42494D] sm:h-16 sm:w-16">
                <User className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#68707D]">Candidate</p>
                <h1 id="candidate-pass-name" className="mt-1 break-words text-2xl font-semibold tracking-[-0.025em] text-[#20242B] sm:text-3xl">{candidate.name}</h1>
                <p className="mt-1 break-words text-base font-medium text-[#42494D] sm:text-lg">{pass.positionTitle}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[#E2E6EA] pt-4 text-sm text-[#68707D] sm:max-w-xs sm:justify-end sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 sm:text-right">
              {pass.department && <span>{pass.department}</span>}
              {pass.location && <span>{pass.location}</span>}
              {pass.passId && <span>Reference {pass.passId}</span>}
              <span className="inline-flex items-center gap-2 font-medium text-[#42494D] sm:hidden">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--customer-accent)" }} aria-hidden="true" />
                {passState.stateLabel}
              </span>
            </div>
          </div>
        </section>

        <PassJourney state={passState} />

        <section
          className="relative overflow-hidden rounded-[2rem] border border-[#CFD5DB] bg-white shadow-[0_18px_55px_rgba(32,36,43,0.07)]"
          data-testid="candidate-pass-current-action"
          aria-labelledby="candidate-current-status"
          aria-live="polite"
        >
          <div className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: "var(--customer-accent)" }} aria-hidden="true" />
          <div className="p-5 pl-7 sm:p-8 sm:pl-10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#68707D]">
              {candidatePassStatusEyebrow(passState)}
            </p>
            <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <h2 id="candidate-current-status" className="text-2xl font-semibold tracking-[-0.02em] text-[#20242B] sm:text-3xl">
                  {hasPrimaryAction ? passState.nextAction.label : passState.headline}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#42494D] sm:text-base">
                  {hasPrimaryAction ? passState.nextAction.description : passState.summary}
                </p>
              </div>
              {hasPrimaryAction && (
                <Button
                  className="min-h-11 w-full shrink-0 bg-[#20242B] px-5 text-white hover:bg-[#42494D] sm:w-auto"
                  onClick={runPrimaryAction}
                  data-testid="candidate-pass-primary-action"
                >
                  {passState.nextAction.label}
                </Button>
              )}
            </div>
            <div className="mt-6 border-t border-[#E2E6EA] pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#68707D]">What happens next</p>
              <p className="mt-1 text-sm leading-6 text-[#42494D]">{passState.next}</p>
            </div>
          </div>
        </section>

        <h2 className="pt-2 text-lg font-semibold text-[#20242B]">Your Pass details</h2>

        <section className="grid gap-5 lg:grid-cols-2">
          {(interviewSlots.length > 0 || interviews.length > 0) && (
            <Card id="pass-interview" className="border-[#D8DEE5] bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[#20242B]">
                  <Calendar className="h-5 w-5 text-[#42494D]" />
                  Interview
                </CardTitle>
                <CardDescription className="text-[#68707D]">Choose a slot or review scheduled details.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {interviewSlots.length > 0 && (
                  <Button className="min-h-11 w-full bg-[#20242B] text-white hover:bg-[#42494D]" onClick={() => setShowSlotDialog(true)} data-testid="btn-select-interview-slot">
                    Choose interview slot
                  </Button>
                )}
                {interviews.map((interview) => (
                  <div key={interview.id} className="rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-3">
                    <p className="font-medium text-[#20242B]">{formatCandidateDate(interview.interviewDate)}</p>
                    <p className="text-sm text-[#68707D]">
                      {interview.startTime} - {interview.endTime} ({interview.format})
                    </p>
                    {interview.meetingLink && (
                      <a className="mt-2 inline-block text-sm text-[#20242B] underline" href={interview.meetingLink} target="_blank" rel="noreferrer">
                        Open meeting link
                      </a>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(needsSoftAssessment || needsTechnicalAssessment) && (
            <Card id="pass-assessments" className="border-[#D8DEE5] bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[#20242B]">
                  <FileCheck className="h-5 w-5 text-[#42494D]" />
                  Assessment
                </CardTitle>
                <CardDescription className="text-[#68707D]">Complete the requested assessment, then confirm it here.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {needsSoftAssessment && (
                  <div className="rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-3">
                    <p className="font-medium text-[#20242B]">Soft skills assessment</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button asChild className="bg-[#20242B] text-white hover:bg-[#42494D]">
                        <a href={pass.softSkillsAssessmentUrl || "#"} target="_blank" rel="noreferrer">Open assessment</a>
                      </Button>
                      <Button variant="outline" className="border-[#D8DEE5] text-[#20242B]" onClick={() => confirmAssessmentMutation.mutate("softSkills")}>
                        Mark completed
                      </Button>
                    </div>
                  </div>
                )}
                {needsTechnicalAssessment && (
                  <div className="rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-3">
                    <p className="font-medium text-[#20242B]">Technical assessment</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button asChild className="bg-[#20242B] text-white hover:bg-[#42494D]">
                        <a href={pass.technicalAssessmentUrl || "#"} target="_blank" rel="noreferrer">Open assessment</a>
                      </Button>
                      <Button variant="outline" className="border-[#D8DEE5] text-[#20242B]" onClick={() => confirmAssessmentMutation.mutate("technical")}>
                        Mark completed
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {offer && (
            <Card id="pass-offer" className="border-[#D8DEE5] bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[#20242B]">
                  <CheckCircle className="h-5 w-5 text-[#42494D]" />
                  Offer
                </CardTitle>
                <CardDescription className="text-[#68707D]">Review and respond to your offer.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-3 text-sm text-[#42494D]">
                  {offer.salary && <p>Salary: {offer.salaryCurrency || "AED"} {offer.salary.toLocaleString()}</p>}
                  {offer.startDate && <p>Start date: {offer.startDate}</p>}
                  <p>Status: {offer.status}</p>
                </div>
                {offer.status === "pending" && (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Button className="bg-[#20242B] text-white hover:bg-[#42494D]" onClick={() => respondOfferMutation.mutate({ response: "accept" })}>
                      Accept
                    </Button>
                    <Button variant="outline" className="border-[#D8DEE5] text-[#20242B]" onClick={() => setOfferResponseMode("negotiate")}>
                      Discuss
                    </Button>
                    <Button variant="destructive" onClick={() => setOfferResponseMode("decline")}>
                      Decline
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Dialog open={offerResponseMode !== null} onOpenChange={(open) => { if (!open) { setOfferResponseMode(null); setOfferResponseText(""); } }}>
            <DialogContent className="border-[#D8DEE5] bg-white text-[#20242B]">
              <DialogHeader>
                <DialogTitle>{offerResponseMode === "negotiate" ? "Discuss this offer" : "Decline this offer"}</DialogTitle>
                <DialogDescription className="text-[#68707D]">
                  {offerResponseMode === "negotiate" ? "Write the message you want the hiring team to receive, or continue without a message." : "You may provide a reason, or decline without one."}
                </DialogDescription>
              </DialogHeader>
              <Textarea value={offerResponseText} onChange={(event) => setOfferResponseText(event.target.value)} maxLength={2000} placeholder={offerResponseMode === "negotiate" ? "Your message (optional)" : "Reason (optional)"} />
              <DialogFooter>
                <Button variant="outline" onClick={() => { setOfferResponseMode(null); setOfferResponseText(""); }}>Cancel</Button>
                <Button className={offerResponseMode === "decline" ? undefined : "bg-[#20242B] text-white hover:bg-[#42494D]"} variant={offerResponseMode === "decline" ? "destructive" : "default"} disabled={respondOfferMutation.isPending} onClick={() => {
                  if (offerResponseMode === "negotiate") respondOfferMutation.mutate({ response: "negotiate", message: offerResponseText.trim() || undefined });
                  if (offerResponseMode === "decline") respondOfferMutation.mutate({ response: "decline", reason: offerResponseText.trim() || undefined });
                }}>{offerResponseMode === "negotiate" ? "Send response" : "Decline offer"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {documents.length > 0 && (
            <Card id="pass-documents" className="border-[#D8DEE5] bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[#20242B]">
                  <FileText className="h-5 w-5 text-[#42494D]" />
                  Documents
                </CardTitle>
                <CardDescription className="text-[#68707D]">Track requested and received hiring documents.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex flex-col gap-3 rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[#20242B]">{doc.label || doc.docType}</p>
                        {doc.fileName && <p className="truncate text-xs text-[#68707D]">{doc.fileName}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={doc.status === "approved" ? "default" : doc.status === "rejected" ? "destructive" : "outline"}>{doc.status}</Badge>
                        {doc.status === "pending" && (
                          <label className="inline-flex min-h-9 cursor-pointer items-center rounded-md bg-[#20242B] px-3 py-2 text-sm font-medium text-white hover:bg-[#42494D]">
                            <Upload className="mr-2 h-4 w-4" />
                            Submit file
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                              className="sr-only"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) {
                                  const issue = validateClientUpload(file, "candidate-document");
                                  if (issue) toast({ title: "Document not selected", description: issue, variant: "destructive" });
                                  else submitDocumentMutation.mutate({ documentId: doc.id, file });
                                }
                                event.currentTarget.value = "";
                              }}
                              data-testid={`document-upload-${doc.id}`}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {pendingDocs.length > 0 && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-[#42494D]">
                    <Upload className="h-4 w-4" />
                    Upload PDF, JPG or PNG files up to 10 MB. Your document is stored against this Candidate Pass.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card id="pass-messages" className="border-[#D8DEE5] bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[#20242B]">
                <Inbox className="h-5 w-5 text-[#42494D]" />
                Updates
                {unreadMessages > 0 && <Badge variant="destructive">{unreadMessages} new</Badge>}
              </CardTitle>
              <CardDescription className="text-[#68707D]">Hiring-team updates and candidate replies.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {messages.length === 0 ? (
                <p className="rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-4 text-sm text-[#68707D]">No messages yet.</p>
              ) : (
                <ScrollArea className="h-72 pr-4">
                  <div className="space-y-3">
                    {messages.map((message) => (
                      <div key={message.id} className={`rounded-lg p-3 ${message.senderType === "hr" ? "mr-8 bg-[#F4F6F8] text-[#20242B]" : "ml-8 bg-[#20242B] text-white"}`}>
                        <p className={`mb-1 text-xs ${message.senderType === "hr" ? "text-[#68707D]" : "text-white/70"}`}>{message.senderType === "hr" ? message.senderName || "Hiring team" : "You"}</p>
                        <p className="text-sm">{message.message}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
              <div className="flex gap-2">
                <Textarea
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="Reply to the hiring team..."
                  className="min-h-11 resize-none border-[#D8DEE5] bg-white text-[#20242B]"
                  data-testid="input-message"
                />
                <Button
                  className="min-h-11 bg-[#20242B] text-white hover:bg-[#42494D]"
                  onClick={() => sendMessageMutation.mutate(messageText)}
                  disabled={sendMessageMutation.isPending || !messageText.trim()}
                  data-testid="btn-send-message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {timeline.length > 0 && (
          <Card className="border-[#D8DEE5] bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[#20242B]">
                <MessageSquare className="h-5 w-5 text-[#42494D]" />
                Journey log
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {timeline.map((event, index) => (
                <div key={event.id || index} className="border-l border-[#D8DEE5] pl-4">
                  <p className="font-medium text-[#20242B]">{event.title}</p>
                  <p className="text-sm text-[#68707D]">{event.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <ExternalPassFooter config={publicConfig} />
      </main>

      <Dialog open={showSlotDialog} onOpenChange={setShowSlotDialog}>
        <DialogContent className="border-[#D8DEE5] bg-white text-[#20242B]">
          <DialogHeader>
            <DialogTitle>Choose interview slot</DialogTitle>
            <DialogDescription className="text-[#68707D]">Pick one available time. Your Pass updates after confirmation.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-80 pr-2">
            <div className="space-y-2">
              {interviewSlots.map((slot: any) => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setSelectedSlotId(slot.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedSlotId === slot.id ? "border-[#01FF22] bg-[#01FF22]/10" : "border-[#D8DEE5] bg-[#F4F6F8] hover:border-[#42494D]"
                  }`}
                  data-testid={`slot-${slot.id}`}
                >
                  <p className="font-medium text-[#20242B]">{slot.slotDate}</p>
                  <p className="text-sm text-[#68707D]">
                    {slot.startTime} - {slot.endTime} ({slot.format})
                  </p>
                </button>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" className="border-[#D8DEE5] text-[#20242B]" onClick={() => setShowSlotDialog(false)}>
              Cancel
            </Button>
            <Button
              className="bg-[#20242B] text-white hover:bg-[#42494D]"
              onClick={() => selectedSlotId && bookSlotMutation.mutate(selectedSlotId)}
              disabled={!selectedSlotId || bookSlotMutation.isPending}
              data-testid="btn-confirm-slot"
            >
              Confirm slot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
