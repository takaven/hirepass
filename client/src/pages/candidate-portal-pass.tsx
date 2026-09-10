import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Calendar,
  CheckCircle,
  Clock,
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
import type { CandidatePassActionState, CandidatePassViewState } from "@shared/pass-state";
import { validateClientUpload } from "@/lib/upload-preflight";
import { PublicBrand, type PublicConfig } from "./public-apply";

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

interface CandidatePortalPassProps {
  token: string;
}

const stateStyles: Record<CandidatePassActionState, string> = {
  ACTION_REQUIRED: "border-[#01FF22]/70 bg-[#01FF22]/10 text-[#20242B]",
  WAITING: "border-[#D8DEE5] bg-[#F4F6F8] text-[#42494D]",
  UPCOMING: "border-[#D8DEE5] bg-[#F4F6F8] text-[#42494D]",
  COMPLETED: "border-[#20242B] bg-[#20242B] text-white",
  EXPIRED: "border-[#D8DEE5] bg-[#F4F6F8] text-[#42494D]",
  REVOKED: "border-red-300 bg-red-50 text-red-700",
};

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

async function fetchCandidatePass(token: string): Promise<CandidatePassData> {
  const response = await fetch(`/api/candidate-pass/${token}`);
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
  const currentIndex = state.journey.findIndex((step) => step.status === "current");
  const progress = Math.max(8, ((currentIndex + 1) / state.journey.length) * 100);

  return (
    <Card className="border-[#D8DEE5] bg-white">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-[#20242B]">Your journey</span>
          <Badge className="bg-[#20242B] text-white">{state.hiringStage}</Badge>
        </div>
        <Progress value={progress} className="h-2 bg-[#E7EBEF]" />
        <div className="mt-3 grid grid-cols-4 gap-2">
          {state.journey.map((step) => (
            <div key={step.stage} className="min-w-0">
              <div
                className={`mb-1 h-2 rounded-full ${
                  step.status === "completed"
                    ? "bg-[#20242B]"
                    : step.status === "current"
                    ? "bg-[#01FF22]"
                    : "bg-[#D8DEE5]"
                }`}
              />
              <p className={`truncate text-xs ${step.status === "upcoming" ? "text-[#68707D]" : "text-[#20242B]"}`}>{step.stage}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CandidatePortalPass({ token }: CandidatePortalPassProps) {
  const { toast } = useToast();
  const [messageText, setMessageText] = useState("");
  const [showSlotDialog, setShowSlotDialog] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [offerResponseMode, setOfferResponseMode] = useState<"negotiate" | "decline" | null>(null);
  const [offerResponseText, setOfferResponseText] = useState("");

  const { data, isLoading, error } = useQuery<CandidatePassData>({
    queryKey: ["/api/candidate-pass", token],
    queryFn: () => fetchCandidatePass(token),
    refetchInterval: (query) => {
      const state = query.state.data?.passState?.actionState;
      return state === "EXPIRED" || state === "REVOKED" || state === "COMPLETED" ? false : 30000;
    },
  });
  const { data: publicConfig } = useQuery<PublicConfig>({ queryKey: ["/api/public/config"] });

  const sendMessageMutation = useMutation({
    mutationFn: (message: string) => apiRequest("POST", `/api/candidate-pass/${token}/messages`, { message }),
    onSuccess: () => {
      toast({ title: "Message sent" });
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-pass", token] });
    },
    onError: () => toast({ title: "Message could not be sent", variant: "destructive" }),
  });

  const bookSlotMutation = useMutation({
    mutationFn: (slotId: number) => apiRequest("POST", `/api/candidate-pass/${token}/interview-slot`, { slotId }),
    onSuccess: () => {
      toast({ title: "Interview slot confirmed", description: "Your Candidate Pass has been updated." });
      setShowSlotDialog(false);
      setSelectedSlotId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-pass", token] });
    },
    onError: () => toast({ title: "Interview slot could not be confirmed", variant: "destructive" }),
  });

  const respondOfferMutation = useMutation({
    mutationFn: (response: { response: string; reason?: string; message?: string }) =>
      apiRequest("POST", `/api/candidate-pass/${token}/offer-response`, response),
    onSuccess: () => {
      toast({ title: "Offer response submitted", description: "Your Candidate Pass has been updated." });
      setOfferResponseMode(null);
      setOfferResponseText("");
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-pass", token] });
    },
    onError: () => toast({ title: "Offer response could not be submitted", variant: "destructive" }),
  });

  const confirmAssessmentMutation = useMutation({
    mutationFn: (assessmentType: string) => apiRequest("POST", `/api/candidate-pass/${token}/assessment-complete`, { assessmentType }),
    onSuccess: () => {
      toast({ title: "Assessment completion recorded", description: "Your Candidate Pass has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-pass", token] });
    },
    onError: () => toast({ title: "Assessment completion could not be recorded", variant: "destructive" }),
  });

  const submitDocumentMutation = useMutation({
    mutationFn: async ({ documentId, file }: { documentId: number; file: File }) =>
      apiRequest("POST", `/api/candidate-pass/${token}/documents`, {
        documentId,
        fileName: file.name,
        mimeType: file.type,
        fileDataBase64: await fileToBase64(file),
      }),
    onSuccess: () => {
      toast({ title: "Document received", description: "Your Candidate Pass has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-pass", token] });
    },
    onError: () => toast({ title: "Document could not be submitted", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6F8] px-4 text-[#20242B]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-[#20242B]" />
          <p className="text-sm text-[#68707D]">Opening your Candidate Pass...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.passCandidate) {
    const typedError = error as Error & { status?: number };
    return <AccessState status={typedError?.status} message={typedError?.message} />;
  }

  const { candidate, passCandidate, pass, messages, documents, timeline, interviews, offer, interviewSlots, passState } = data;
  const pendingDocs = documents.filter((doc) => doc.status === "pending");
  const unreadMessages = messages.filter((message) => !message.isRead && message.senderType === "hr").length;
  const needsSoftAssessment = Boolean(pass.softSkillsAssessmentUrl && !passCandidate.softSkillsCompletedAt);
  const needsTechnicalAssessment = Boolean(pass.technicalAssessmentUrl && !passCandidate.technicalCompletedAt);

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
    <div className="min-h-screen bg-[#F4F6F8] text-[#20242B]">
      <header className="sticky top-0 z-40 border-b border-[#D8DEE5] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-[#68707D]">Candidate Pass</p>
              <h1 className="truncate text-base font-semibold text-[#20242B]">{pass.positionTitle}</h1>
            </div>
          </div>
          <Badge className={`shrink-0 border ${stateStyles[passState.actionState]}`}>{passState.stateLabel}</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:py-8">
        <PublicBrand config={publicConfig} />
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className={`border ${stateStyles[passState.actionState]} bg-white`}>
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2 text-sm text-[#68707D]">
                <span className="inline-flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {candidate.name}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-4 w-4" />
                  {pass.department || "Hiring team"}
                </span>
              </div>

              <div className="grid gap-3">
                <div className="rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-4">
                  <p className="text-xs uppercase tracking-wide text-[#68707D]">Current stage</p>
                  <h2 className="mt-1 text-2xl font-semibold text-[#20242B] sm:text-3xl">{passState.hiringStage}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#42494D]">{passState.summary}</p>
                </div>
                <div className="rounded-lg border border-[#01FF22]/60 bg-[#01FF22]/10 p-4">
                  <p className="text-xs uppercase tracking-wide text-[#42494D]">Your action</p>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-[#20242B]">{passState.nextAction.label}</h3>
                      <p className="mt-1 text-sm text-[#42494D]">{passState.nextAction.description}</p>
                    </div>
                    <Button
                      className="min-h-11 shrink-0 bg-[#20242B] text-white hover:bg-[#42494D]"
                      onClick={runPrimaryAction}
                      disabled={passState.nextAction.kind === "NONE" && passState.actionState === "COMPLETED"}
                      data-testid="candidate-pass-primary-action"
                    >
                      {passState.nextAction.label}
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-4">
                  <p className="text-xs uppercase tracking-wide text-[#68707D]">Next</p>
                  <p className="mt-1 text-sm font-medium text-[#20242B]">{passState.next}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <PassJourney state={passState} />
            {passState.actionState === "WAITING" && (
              <Card className="border-[#D8DEE5] bg-white">
                <CardContent className="flex items-start gap-4 p-5">
                  <Clock className="mt-1 h-6 w-6 shrink-0 text-[#68707D]" />
                  <div>
                    <h3 className="font-semibold text-[#20242B]">You're all set</h3>
                    <p className="mt-1 text-sm leading-6 text-[#42494D]">
                      This Pass will show a clear action when the hiring team needs something from you.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        <h2 className="text-lg font-semibold text-[#20242B]">Your journey</h2>

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
                <Button variant={offerResponseMode === "decline" ? "destructive" : "default"} disabled={respondOfferMutation.isPending} onClick={() => {
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
                  className="min-h-11"
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
