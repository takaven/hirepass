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
  ShieldCheck,
  Upload,
  User,
} from "lucide-react";
import type { Candidate, CandidateDocument, CandidateMessage, Interview, Offer, Pass, PassCandidate } from "@shared/schema";

type CandidatePassActionState =
  | "ACTION_REQUIRED"
  | "WAITING"
  | "UPCOMING"
  | "COMPLETED"
  | "EXPIRED"
  | "REVOKED";

type CandidateHiringStage =
  | "Application"
  | "Screening"
  | "Interview"
  | "Assessment"
  | "Decision"
  | "Offer"
  | "Handoff";

type CandidateNextAction = {
  kind:
    | "CHOOSE_INTERVIEW_SLOT"
    | "CONFIRM_INTERVIEW"
    | "UPLOAD_DOCUMENT"
    | "COMPLETE_ASSESSMENT"
    | "RESPOND_TO_MESSAGE"
    | "REVIEW_OFFER"
    | "NONE";
  label: string;
  description: string;
  target: "interview" | "documents" | "assessment" | "messages" | "offer" | "none";
};

type CandidatePassViewState = {
  actionState: CandidatePassActionState;
  hiringStage: CandidateHiringStage;
  stateLabel: string;
  headline: string;
  summary: string;
  waitingOn: string;
  nextAction: CandidateNextAction;
  latestUpdate: string;
  journey: Array<{ stage: CandidateHiringStage; status: "completed" | "current" | "upcoming" }>;
};

interface CandidatePassData {
  candidateLink: {
    id: number;
    token: string;
    passCandidateId: number;
    isActive: boolean;
    expiresAt: string | null;
  };
  candidate: Candidate;
  passCandidate: PassCandidate;
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
  ACTION_REQUIRED: "border-amber-400 bg-amber-400/10 text-amber-200",
  WAITING: "border-sky-400 bg-sky-400/10 text-sky-200",
  UPCOMING: "border-blue-400 bg-blue-400/10 text-blue-200",
  COMPLETED: "border-emerald-400 bg-emerald-400/10 text-emerald-200",
  EXPIRED: "border-slate-500 bg-slate-500/10 text-slate-200",
  REVOKED: "border-red-400 bg-red-400/10 text-red-200",
};

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
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <Card className="mx-auto max-w-md border-slate-700 bg-slate-900">
        <CardContent className="pt-8 text-center">
          <Lock className={`mx-auto mb-4 h-12 w-12 ${isExpired ? "text-slate-400" : "text-red-300"}`} />
          <h1 className="mb-2 text-xl font-semibold text-white">{title}</h1>
          <p className="text-sm text-slate-400">{message || body}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function PassJourney({ state }: { state: CandidatePassViewState }) {
  const currentIndex = state.journey.findIndex((step) => step.status === "current");
  const progress = Math.max(8, ((currentIndex + 1) / state.journey.length) * 100);

  return (
    <Card className="border-slate-800 bg-slate-900/80">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-white">Hiring progress</span>
          <Badge className="bg-slate-800 text-slate-200">{state.hiringStage}</Badge>
        </div>
        <Progress value={progress} className="h-2 bg-slate-800" />
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
          {state.journey.map((step) => (
            <div key={step.stage} className="min-w-0">
              <div
                className={`mb-1 h-2 rounded-full ${
                  step.status === "completed"
                    ? "bg-emerald-400"
                    : step.status === "current"
                    ? "bg-blue-400"
                    : "bg-slate-700"
                }`}
              />
              <p className={`truncate text-[11px] ${step.status === "upcoming" ? "text-slate-500" : "text-slate-300"}`}>{step.stage}</p>
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

  const { data, isLoading, error } = useQuery<CandidatePassData>({
    queryKey: ["/api/candidate-pass", token],
    queryFn: () => fetchCandidatePass(token),
  });

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

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-300" />
          <p className="text-sm text-slate-400">Opening your Candidate Pass...</p>
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
        document.getElementById("pass-latest")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-slate-500">Candidate Pass</p>
              <h1 className="truncate text-base font-semibold text-white">{pass.positionTitle}</h1>
            </div>
          </div>
          <Badge className={`shrink-0 border ${stateStyles[passState.actionState]}`}>{passState.stateLabel}</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:py-8">
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card className={`border ${stateStyles[passState.actionState]} bg-slate-900`}>
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <User className="h-4 w-4" />
                      {candidate.name}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-4 w-4" />
                      {pass.department || "Hiring team"}
                    </span>
                  </div>
                  <h2 className="text-2xl font-semibold text-white sm:text-3xl">{passState.headline}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">{passState.summary}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm">
                  <p className="text-slate-500">Waiting on</p>
                  <p className="font-medium text-white">{passState.waitingOn}</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Dominant next action</p>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{passState.nextAction.label}</h3>
                    <p className="mt-1 text-sm text-slate-400">{passState.nextAction.description}</p>
                  </div>
                  <Button
                    className="min-h-11 shrink-0 bg-blue-500 hover:bg-blue-600"
                    onClick={runPrimaryAction}
                    disabled={passState.nextAction.kind === "NONE" && passState.actionState === "COMPLETED"}
                    data-testid="candidate-pass-primary-action"
                  >
                    {passState.nextAction.label}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <PassJourney state={passState} />
            <Card id="pass-latest" className="border-slate-800 bg-slate-900/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-white">Latest update</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-300">{passState.latestUpdate}</CardContent>
            </Card>
          </div>
        </section>

        {passState.actionState === "WAITING" && (
          <Card className="border-sky-500/40 bg-sky-500/10">
            <CardContent className="flex items-start gap-4 p-5">
              <Clock className="mt-1 h-6 w-6 shrink-0 text-sky-200" />
              <div>
                <h3 className="font-semibold text-white">You're all set</h3>
                <p className="mt-1 text-sm leading-6 text-sky-100/80">
                  This Pass will show a clear action when the hiring team needs something from you. Until then, you do not need to chase the next step.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <section className="grid gap-5 lg:grid-cols-2">
          {(interviewSlots.length > 0 || interviews.length > 0) && (
            <Card id="pass-interview" className="border-slate-800 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Calendar className="h-5 w-5 text-blue-300" />
                  Interview
                </CardTitle>
                <CardDescription className="text-slate-400">Choose a slot or review scheduled details.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {interviewSlots.length > 0 && (
                  <Button className="min-h-11 w-full bg-blue-500 hover:bg-blue-600" onClick={() => setShowSlotDialog(true)} data-testid="btn-select-interview-slot">
                    Choose interview slot
                  </Button>
                )}
                {interviews.map((interview) => (
                  <div key={interview.id} className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                    <p className="font-medium text-white">{interview.interviewDate}</p>
                    <p className="text-sm text-slate-400">
                      {interview.startTime} - {interview.endTime} ({interview.format})
                    </p>
                    {interview.meetingLink && (
                      <a className="mt-2 inline-block text-sm text-blue-300 underline" href={interview.meetingLink} target="_blank" rel="noreferrer">
                        Open meeting link
                      </a>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(needsSoftAssessment || needsTechnicalAssessment) && (
            <Card id="pass-assessments" className="border-slate-800 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <FileCheck className="h-5 w-5 text-amber-300" />
                  Assessment
                </CardTitle>
                <CardDescription className="text-slate-400">Complete the requested assessment, then confirm it here.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {needsSoftAssessment && (
                  <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                    <p className="font-medium text-white">Soft skills assessment</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
                        <a href={pass.softSkillsAssessmentUrl || "#"} target="_blank" rel="noreferrer">Open assessment</a>
                      </Button>
                      <Button variant="outline" className="border-slate-600 text-slate-200" onClick={() => confirmAssessmentMutation.mutate("softSkills")}>
                        Mark completed
                      </Button>
                    </div>
                  </div>
                )}
                {needsTechnicalAssessment && (
                  <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                    <p className="font-medium text-white">Technical assessment</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
                        <a href={pass.technicalAssessmentUrl || "#"} target="_blank" rel="noreferrer">Open assessment</a>
                      </Button>
                      <Button variant="outline" className="border-slate-600 text-slate-200" onClick={() => confirmAssessmentMutation.mutate("technical")}>
                        Mark completed
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {offer && (
            <Card id="pass-offer" className="border-slate-800 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <CheckCircle className="h-5 w-5 text-emerald-300" />
                  Offer
                </CardTitle>
                <CardDescription className="text-slate-400">Review and respond to your offer.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-300">
                  {offer.salary && <p>Salary: {offer.salary.toLocaleString()} AED/month</p>}
                  {offer.startDate && <p>Start date: {offer.startDate}</p>}
                  <p>Status: {offer.status}</p>
                </div>
                {offer.status === "pending" && (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Button className="bg-emerald-500 hover:bg-emerald-600" onClick={() => respondOfferMutation.mutate({ response: "accept" })}>
                      Accept
                    </Button>
                    <Button variant="outline" className="border-slate-600 text-slate-200" onClick={() => respondOfferMutation.mutate({ response: "negotiate", message: "I would like to discuss the offer" })}>
                      Discuss
                    </Button>
                    <Button variant="destructive" onClick={() => respondOfferMutation.mutate({ response: "decline", reason: "Personal reasons" })}>
                      Decline
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card id="pass-documents" className="border-slate-800 bg-slate-900/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <FileText className="h-5 w-5 text-orange-300" />
                Documents
              </CardTitle>
              <CardDescription className="text-slate-400">Track requested and received hiring documents.</CardDescription>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">No documents have been requested yet.</p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{doc.label || doc.docType}</p>
                        {doc.fileName && <p className="truncate text-xs text-slate-500">{doc.fileName}</p>}
                      </div>
                      <Badge variant={doc.status === "approved" ? "default" : doc.status === "rejected" ? "destructive" : "outline"}>{doc.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
              {pendingDocs.length > 0 && (
                <p className="mt-3 flex items-center gap-2 text-sm text-orange-200">
                  <Upload className="h-4 w-4" />
                  Upload handling is available through the existing document request flow.
                </p>
              )}
            </CardContent>
          </Card>

          <Card id="pass-messages" className="border-slate-800 bg-slate-900/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Inbox className="h-5 w-5 text-blue-300" />
                Updates
                {unreadMessages > 0 && <Badge variant="destructive">{unreadMessages} new</Badge>}
              </CardTitle>
              <CardDescription className="text-slate-400">Hiring-team updates and candidate replies.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {messages.length === 0 ? (
                <p className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">No messages yet.</p>
              ) : (
                <ScrollArea className="h-72 pr-4">
                  <div className="space-y-3">
                    {messages.map((message) => (
                      <div key={message.id} className={`rounded-lg p-3 ${message.senderType === "hr" ? "mr-8 bg-slate-800" : "ml-8 bg-blue-600"}`}>
                        <p className="mb-1 text-xs text-slate-400">{message.senderType === "hr" ? message.senderName || "Hiring team" : "You"}</p>
                        <p className="text-sm text-white">{message.message}</p>
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
                  className="min-h-11 resize-none border-slate-700 bg-slate-950 text-white"
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

        <Card className="border-slate-800 bg-slate-900/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <MessageSquare className="h-5 w-5 text-slate-300" />
              Journey log
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {timeline.length === 0 ? (
              <p className="text-sm text-slate-400">No journey updates have been added yet.</p>
            ) : (
              timeline.map((event, index) => (
                <div key={event.id || index} className="border-l border-slate-700 pl-4">
                  <p className="font-medium text-white">{event.title}</p>
                  <p className="text-sm text-slate-400">{event.description}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={showSlotDialog} onOpenChange={setShowSlotDialog}>
        <DialogContent className="border-slate-700 bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle>Choose interview slot</DialogTitle>
            <DialogDescription className="text-slate-400">Pick one available time. Your Pass updates after confirmation.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-80 pr-2">
            <div className="space-y-2">
              {interviewSlots.map((slot: any) => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setSelectedSlotId(slot.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedSlotId === slot.id ? "border-blue-400 bg-blue-500/20" : "border-slate-700 bg-slate-950 hover:border-blue-500"
                  }`}
                  data-testid={`slot-${slot.id}`}
                >
                  <p className="font-medium text-white">{slot.slotDate}</p>
                  <p className="text-sm text-slate-400">
                    {slot.startTime} - {slot.endTime} ({slot.format})
                  </p>
                </button>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" className="border-slate-600 text-slate-200" onClick={() => setShowSlotDialog(false)}>
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
