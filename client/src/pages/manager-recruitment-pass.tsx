import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Briefcase,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Lock,
  MessageSquare,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import type { Candidate, Interview, Manager, Pass, PassCandidate } from "@shared/schema";
import type { ManagerPassActionState, ManagerPassViewState } from "@shared/pass-state";
import { PublicBrand, type PublicConfig } from "./public-apply";

type ManagerPassCandidate = Pick<PassCandidate, "id" | "passId" | "candidateId" | "status" | "shortlistedAt"> & {
  candidate: Pick<Candidate, "id" | "name" | "currentTitle" | "experienceYears" | "skills" | "cvSummary"> | null;
};

interface ManagerPassData {
  shareLink: { id: number; passId: number; managerId: number | null; linkType: string; isActive: boolean; expiresAt?: string | null };
  pass: Pass & { positions?: any[] };
  candidates: ManagerPassCandidate[];
  interviews: Interview[];
  manager: Manager | null;
  interviewSlots: any[];
  managerPassState: ManagerPassViewState;
}

interface ManagerRecruitmentPassProps {
  token: string;
}

const stateStyles: Record<ManagerPassActionState, string> = {
  ACTION_REQUIRED: "border-[#01FF22]/70 bg-[#01FF22]/10 text-[#20242B]",
  WAITING: "border-[#D8DEE5] bg-[#F4F6F8] text-[#42494D]",
  UPCOMING: "border-[#D8DEE5] bg-[#F4F6F8] text-[#42494D]",
  COMPLETED: "border-[#20242B] bg-[#20242B] text-white",
  EXPIRED: "border-[#D8DEE5] bg-[#F4F6F8] text-[#42494D]",
  REVOKED: "border-red-300 bg-red-50 text-red-700",
};

function formatManagerDate(value: string | Date | null | undefined) {
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

async function fetchManagerPass(token: string): Promise<ManagerPassData> {
  const response = await fetch(`/api/manager-pass/${token}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || "Unable to open this Stakeholder Pass");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return payload;
}

function AccessState({ status, message }: { status?: number; message?: string }) {
  const isExpired = status === 410;

  return (
    <div className="min-h-screen bg-[#F4F6F8] px-4 py-10 text-[#20242B]">
      <Card className="mx-auto max-w-md border-[#D8DEE5] bg-white">
        <CardContent className="pt-8 text-center">
          <Lock className={`mx-auto mb-4 h-12 w-12 ${isExpired ? "text-[#68707D]" : "text-red-600"}`} />
          <h1 className="mb-2 text-xl font-semibold text-[#20242B]">
            {isExpired ? "This Stakeholder Pass has expired" : "This Stakeholder Pass is not active"}
          </h1>
          <p className="text-sm text-[#68707D]">
            {message || "Ask the hiring team to issue a fresh Pass if your input is still required."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function statusLabel(status?: string | null) {
  return (status || "new").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ManagerRecruitmentPass({ token }: ManagerRecruitmentPassProps) {
  const { toast } = useToast();
  const [decisionNotes, setDecisionNotes] = useState("");
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [showInterviewDialog, setShowInterviewDialog] = useState(false);
  const [showEvaluationDialog, setShowEvaluationDialog] = useState(false);
  const [showFinalDecisionDialog, setShowFinalDecisionDialog] = useState(false);
  const [evaluationRecommendation, setEvaluationRecommendation] = useState("proceed");
  const [finalDecision, setFinalDecision] = useState("hire");
  const [availabilityDates, setAvailabilityDates] = useState("");
  const [availabilityTimes, setAvailabilityTimes] = useState("");
  const [interviewDuration, setInterviewDuration] = useState("45");
  const [interviewFormat, setInterviewFormat] = useState("online");
  const [interviewLocation, setInterviewLocation] = useState("");
  const [meetingLink, setMeetingLink] = useState("");

  const { data, isLoading, error } = useQuery<ManagerPassData>({
    queryKey: ["/api/manager-pass", token],
    queryFn: () => fetchManagerPass(token),
    refetchInterval: (query) => {
      const state = query.state.data?.managerPassState?.actionState;
      return state === "EXPIRED" || state === "REVOKED" || state === "COMPLETED" ? false : 30000;
    },
  });
  const { data: publicConfig } = useQuery<PublicConfig>({ queryKey: ["/api/public/config"] });

  const approveRequestMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/manager-pass/${token}/approve-jd`, {}),
    onSuccess: () => {
      toast({ title: "Hiring request approved", description: "The hiring team has your decision." });
      setShowRequestDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/manager-pass", token] });
    },
    onError: () => toast({ title: "Decision could not be submitted", variant: "destructive" }),
  });

  const requestChangesMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/manager-pass/${token}/request-jd-changes`, { feedback: decisionNotes }),
    onSuccess: () => {
      toast({ title: "Changes requested", description: "The hiring team has your feedback." });
      setDecisionNotes("");
      setShowRequestDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/manager-pass", token] });
    },
    onError: () => toast({ title: "Feedback could not be submitted", variant: "destructive" }),
  });

  const shortlistMutation = useMutation({
    mutationFn: (candidateId: number) => apiRequest("POST", `/api/manager-pass/${token}/candidates/${candidateId}/shortlist`),
    onSuccess: () => {
      toast({ title: "Candidate advanced", description: "Your Stakeholder Pass has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-pass", token] });
    },
    onError: () => toast({ title: "Candidate decision could not be submitted", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (candidateId: number) => apiRequest("POST", `/api/manager-pass/${token}/candidates/${candidateId}/reject`, { reason: "Manager decision", notes: decisionNotes }),
    onSuccess: () => {
      toast({ title: "Candidate rejected", description: "Your Stakeholder Pass has been updated." });
      setDecisionNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/manager-pass", token] });
    },
    onError: () => toast({ title: "Candidate decision could not be submitted", variant: "destructive" }),
  });

  const interviewSetupMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/manager-pass/${token}/interview-setup`, {
        technicalAssessmentRequired: false,
        interviewFormat,
        interviewRounds: 1,
        interviewDuration: Number(interviewDuration),
        availableDates: availabilityDates.split(",").map((value) => value.trim()).filter(Boolean),
        timeSlots: availabilityTimes.split(",").map((value) => value.trim()).filter(Boolean),
        location: interviewLocation || null,
        meetingLink: meetingLink || null,
        isPanelInterview: false,
      }),
    onSuccess: () => {
      toast({ title: "Interview availability submitted", description: "The hiring team can now continue the next step." });
      setShowInterviewDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/manager-pass", token] });
    },
    onError: () => toast({ title: "Interview setup could not be submitted", variant: "destructive" }),
  });

  const evaluationMutation = useMutation({
    mutationFn: (interviewId: number) =>
      apiRequest("POST", `/api/manager-pass/${token}/evaluations`, {
        interviewId,
        recommendation: evaluationRecommendation,
        notesObservations: decisionNotes,
        finalComments: decisionNotes,
      }),
    onSuccess: () => {
      toast({ title: "Evaluation submitted", description: "The hiring team has your feedback." });
      setDecisionNotes("");
      setShowEvaluationDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/manager-pass", token] });
    },
    onError: () => toast({ title: "Evaluation could not be submitted", variant: "destructive" }),
  });

  const finalDecisionMutation = useMutation({
    mutationFn: ({ candidateId, decision }: { candidateId: number; decision: string }) =>
      apiRequest("POST", `/api/manager-pass/${token}/final-decisions`, {
        decisions: [{ passCandidateId: candidateId, decision, notes: decisionNotes }],
      }),
    onSuccess: () => {
      toast({ title: "Final decision submitted", description: "You're done for now. The hiring team has your decision." });
      setDecisionNotes("");
      setShowFinalDecisionDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/manager-pass", token] });
    },
    onError: () => toast({ title: "Final decision could not be submitted", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6F8] text-[#20242B]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-[#20242B]" />
          <p className="text-sm text-[#68707D]">Opening Stakeholder Pass...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.managerPassState) {
    const typedError = error as Error & { status?: number };
    return <AccessState status={typedError?.status} message={typedError?.message} />;
  }

  const { pass, candidates, interviews, manager, managerPassState } = data;
  const nextDecisionCandidateId = "candidateId" in managerPassState.nextDecision ? managerPassState.nextDecision.candidateId : undefined;
  const targetCandidate = candidates.find((candidate) => candidate.id === nextDecisionCandidateId) || managerPassState.evidence.topCandidate;
  const targetInterview = interviews.find((interview) => interview.passCandidateId === nextDecisionCandidateId) || interviews[0];

  const actionButton = (() => {
    switch (managerPassState.nextDecision.kind) {
      case "APPROVE_JD":
        return <Button className="min-h-11 bg-[#20242B] text-white hover:bg-[#42494D]" onClick={() => setShowRequestDialog(true)}>Review hiring request</Button>;
      case "REVIEW_CANDIDATE":
        return (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button className="min-h-11 bg-[#20242B] text-white hover:bg-[#42494D]" onClick={() => targetCandidate?.id && shortlistMutation.mutate(targetCandidate.id)}>
              Advance candidate
            </Button>
            <Button variant="destructive" className="min-h-11" onClick={() => targetCandidate?.id && rejectMutation.mutate(targetCandidate.id)}>
              Reject candidate
            </Button>
          </div>
        );
      case "SET_INTERVIEW_AVAILABILITY":
        return <Button className="min-h-11 bg-[#20242B] text-white hover:bg-[#42494D]" onClick={() => setShowInterviewDialog(true)}>Set interview availability</Button>;
      case "SUBMIT_EVALUATION":
        return <Button className="min-h-11 bg-[#20242B] text-white hover:bg-[#42494D]" onClick={() => setShowEvaluationDialog(true)}>Submit evaluation</Button>;
      case "MAKE_FINAL_DECISION":
        return <Button className="min-h-11 bg-[#20242B] text-white hover:bg-[#42494D]" onClick={() => setShowFinalDecisionDialog(true)}>Make final decision</Button>;
      default:
        return <Button className="min-h-11" disabled>No decision required</Button>;
    }
  })();

  return (
    <div className="min-h-screen bg-[#F4F6F8] text-[#20242B]">
      <header className="sticky top-0 z-40 border-b border-[#D8DEE5] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-[#68707D]">Hiring Stakeholder Pass</p>
              <h1 className="truncate text-base font-semibold text-[#20242B]">{pass.positionTitle}</h1>
            </div>
          </div>
          <Badge className={`shrink-0 border ${stateStyles[managerPassState.actionState]}`}>{managerPassState.stateLabel}</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:py-8">
        <PublicBrand config={publicConfig} />
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className={`border ${stateStyles[managerPassState.actionState]} bg-white`}>
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2 text-sm text-[#68707D]">
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="h-4 w-4" />
                  {pass.department || "Hiring request"}
                </span>
                {manager?.name && (
                  <span className="inline-flex items-center gap-1">
                    <UserCheck className="h-4 w-4" />
                    {manager.name}
                  </span>
                )}
              </div>

              <div className="rounded-lg border border-[#01FF22]/60 bg-[#01FF22]/10 p-4">
                <p className="text-xs uppercase tracking-wide text-[#42494D]">What needs your input?</p>
                <div className="mt-2 space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[#20242B]">{managerPassState.nextDecision.label}</h3>
                    <p className="mt-1 text-sm text-[#42494D]">{managerPassState.nextDecision.description}</p>
                  </div>
                  {actionButton}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-3">
                  <p className="text-xs uppercase tracking-wide text-[#68707D]">Candidate / vacancy context</p>
                  <p className="mt-1 text-sm font-medium text-[#20242B]">{managerPassState.headline}</p>
                  <p className="mt-1 text-xs text-[#68707D]">{managerPassState.summary}</p>
                </div>
                <div className="rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-3">
                  <p className="text-xs uppercase tracking-wide text-[#68707D]">Next</p>
                  <p className="mt-1 text-sm font-medium text-[#20242B]">{managerPassState.next}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="border-[#D8DEE5] bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-[#20242B]">Relevant evidence</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-[#42494D]">
                <div className="flex items-start gap-3">
                  {managerPassState.urgency === "attention" ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <Clock className="h-5 w-5 text-[#68707D]" />}
                  <span>{managerPassState.latestUpdate}</span>
                </div>
                {managerPassState.passHandoff && (
                  <p className="rounded-md border border-[#D8DEE5] bg-[#F4F6F8] px-3 py-2 text-[#42494D]">{managerPassState.passHandoff}</p>
                )}
                <p className="rounded-md border border-[#D8DEE5] bg-[#F4F6F8] px-3 py-2 text-[#42494D]">{managerPassState.expectedMovement}</p>
              </CardContent>
            </Card>
            <Card className="border-[#D8DEE5] bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-[#20242B]">Hiring context</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-[#42494D]">
                <p>Role: {managerPassState.evidence.role}</p>
                <p>Active candidates: {managerPassState.evidence.activeCandidateCount}</p>
                <p>Total candidates in this request: {managerPassState.evidence.candidateCount}</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {["WAITING", "COMPLETED"].includes(managerPassState.actionState) && (
          <Card className="border-[#D8DEE5] bg-white">
            <CardContent className="flex items-start gap-4 p-5">
              <CheckCircle className="mt-1 h-6 w-6 shrink-0 text-[#01A31A]" />
              <div>
                <h3 className="font-semibold text-[#20242B]">You're done for now</h3>
                <p className="mt-1 text-sm leading-6 text-[#42494D]">
                  The hiring team has your decision. This Pass will show a new action if your input is needed again.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <section className="grid gap-5 lg:grid-cols-2">
          <Card className="border-[#D8DEE5] bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[#20242B]">
                <FileText className="h-5 w-5 text-[#42494D]" />
                Decision evidence
              </CardTitle>
              <CardDescription className="text-[#68707D]">Only the evidence needed for this decision is shown.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-[#42494D]">
              <div className="rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-3">
                <p className="text-xs uppercase tracking-wide text-[#68707D]">Role</p>
                <p className="mt-1 font-medium text-[#20242B]">{pass.positionTitle}</p>
                <p>{pass.department || "Department not specified"} · {pass.location || "Location not specified"}</p>
              </div>
              {targetCandidate && "candidate" in targetCandidate && targetCandidate.candidate && (
                <div className="rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-3">
                  <p className="text-xs uppercase tracking-wide text-[#68707D]">Candidate</p>
                  <p className="mt-1 font-medium text-[#20242B]">{targetCandidate.candidate.name}</p>
                  <p>{targetCandidate.candidate.currentTitle || "Profile under review"}</p>
                  <p>{targetCandidate.candidate.experienceYears ? `${targetCandidate.candidate.experienceYears} years experience` : "Experience not specified"}</p>
                  <p className="mt-2 text-[#68707D]">{targetCandidate.candidate.cvSummary || "No candidate summary is available yet."}</p>
                </div>
              )}
              {managerPassState.evidence.topCandidate && !("candidate" in (targetCandidate || {})) && (
                <div className="rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-3">
                  <p className="text-xs uppercase tracking-wide text-[#68707D]">Candidate</p>
                  <p className="mt-1 font-medium text-[#20242B]">{managerPassState.evidence.topCandidate.name}</p>
                  <p>{managerPassState.evidence.topCandidate.title}</p>
                  <p className="mt-2 text-[#68707D]">{managerPassState.evidence.topCandidate.summary}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-[#D8DEE5] bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[#20242B]">
                <Users className="h-5 w-5 text-[#42494D]" />
                Request candidates
              </CardTitle>
              <CardDescription className="text-[#68707D]">Candidate details are scoped to this hiring request.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {candidates.length === 0 ? (
                <p className="rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-4 text-sm text-[#68707D]">No candidates have been added to this request yet.</p>
              ) : (
                candidates.slice(0, 4).map((passCandidate) => (
                  <div key={passCandidate.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[#20242B]">{passCandidate.candidate?.name || "Candidate"}</p>
                      <p className="truncate text-xs text-[#68707D]">{passCandidate.candidate?.currentTitle || "Profile under review"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-[#D8DEE5] text-[#42494D]">{statusLabel(passCandidate.status)}</Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-[#D8DEE5] bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[#20242B]">
                <Calendar className="h-5 w-5 text-[#42494D]" />
                Interview context
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {interviews.length === 0 ? (
                <p className="rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-4 text-sm text-[#68707D]">No interviews are scheduled for this request yet.</p>
              ) : (
                interviews.slice(0, 3).map((interview) => (
                  <div key={interview.id} className="rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-3">
                    <p className="font-medium text-[#20242B]">{formatManagerDate(interview.interviewDate)}</p>
                    <p className="text-sm text-[#68707D]">{interview.startTime} - {interview.endTime} ({interview.format})</p>
                    <p className="text-xs text-[#68707D]">Status: {statusLabel(interview.status)}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-[#D8DEE5] bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[#20242B]">
                <MessageSquare className="h-5 w-5 text-[#42494D]" />
                What happens next
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-[#42494D]">
              {managerPassState.actionState === "ACTION_REQUIRED"
                ? "Submit the decision above. The hiring team receives it and the Pass will update to the next waiting or completion state."
                : "No action is needed now. The hiring team will update this Pass when stakeholder input is needed again."}
            </CardContent>
          </Card>
        </section>
      </main>

      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent className="border-[#D8DEE5] bg-white text-[#20242B]">
          <DialogHeader>
            <DialogTitle>Review hiring request</DialogTitle>
            <DialogDescription className="text-[#68707D]">Approve the request or ask the hiring team for specific changes.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={decisionNotes}
            onChange={(event) => setDecisionNotes(event.target.value)}
            placeholder="Optional notes for the hiring team..."
            className="border-[#D8DEE5] bg-white text-[#20242B]"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="border-[#D8DEE5] text-[#20242B]" onClick={() => requestChangesMutation.mutate()}>
              Request changes
            </Button>
            <Button onClick={() => approveRequestMutation.mutate()}>Approve request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInterviewDialog} onOpenChange={setShowInterviewDialog}>
        <DialogContent className="border-[#D8DEE5] bg-white text-[#20242B]">
          <DialogHeader>
            <DialogTitle>Set interview availability</DialogTitle>
            <DialogDescription className="text-[#68707D]">Share real availability so candidates can choose a valid slot.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Dates (comma-separated YYYY-MM-DD)</Label><Input value={availabilityDates} onChange={(e) => setAvailabilityDates(e.target.value)} placeholder="2026-10-05, 2026-10-06" className="mt-1 border-[#D8DEE5] bg-white" /></div>
            <div><Label>Start times (comma-separated HH:MM)</Label><Input value={availabilityTimes} onChange={(e) => setAvailabilityTimes(e.target.value)} placeholder="09:00, 14:30" className="mt-1 border-[#D8DEE5] bg-white" /></div>
            <div className="grid grid-cols-2 gap-3"><div><Label>Duration</Label><Select value={interviewDuration} onValueChange={setInterviewDuration}><SelectTrigger className="mt-1 border-[#D8DEE5] bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">30 minutes</SelectItem><SelectItem value="45">45 minutes</SelectItem><SelectItem value="60">60 minutes</SelectItem><SelectItem value="90">90 minutes</SelectItem></SelectContent></Select></div><div><Label>Format</Label><Select value={interviewFormat} onValueChange={setInterviewFormat}><SelectTrigger className="mt-1 border-[#D8DEE5] bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="online">Online</SelectItem><SelectItem value="in-person">In person</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem></SelectContent></Select></div></div>
            <div><Label>Location (if applicable)</Label><Input value={interviewLocation} onChange={(e) => setInterviewLocation(e.target.value)} className="mt-1 border-[#D8DEE5] bg-white" /></div>
            <div><Label>Meeting link (if applicable)</Label><Input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} className="mt-1 border-[#D8DEE5] bg-white" /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => interviewSetupMutation.mutate()} disabled={interviewSetupMutation.isPending}>
              Submit availability
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEvaluationDialog} onOpenChange={setShowEvaluationDialog}>
        <DialogContent className="border-[#D8DEE5] bg-white text-[#20242B]">
          <DialogHeader>
            <DialogTitle>Submit structured evaluation</DialogTitle>
            <DialogDescription className="text-[#68707D]">Keep the scorecard concise and decision-focused.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-[#42494D]">Recommendation</Label>
              <Select value={evaluationRecommendation} onValueChange={setEvaluationRecommendation}>
                <SelectTrigger className="mt-2 border-[#D8DEE5] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proceed">Proceed</SelectItem>
                  <SelectItem value="reserve">Reserve</SelectItem>
                  <SelectItem value="reject">Reject</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              value={decisionNotes}
              onChange={(event) => setDecisionNotes(event.target.value)}
              placeholder="Evidence-based notes for the hiring team..."
              className="border-[#D8DEE5] bg-white text-[#20242B]"
            />
          </div>
          <DialogFooter>
            <Button onClick={() => targetInterview?.id && evaluationMutation.mutate(targetInterview.id)} disabled={!targetInterview?.id || evaluationMutation.isPending}>
              Submit evaluation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFinalDecisionDialog} onOpenChange={setShowFinalDecisionDialog}>
        <DialogContent className="border-[#D8DEE5] bg-white text-[#20242B]">
          <DialogHeader>
            <DialogTitle>Make final decision</DialogTitle>
            <DialogDescription className="text-[#68707D]">Submit one clear decision for the hiring team to action.</DialogDescription>
          </DialogHeader>
          <RadioGroup value={finalDecision} onValueChange={setFinalDecision} className="grid gap-3">
            {[
              ["hire", "Hire"],
              ["reserve", "Reserve"],
              ["reject", "Reject"],
            ].map(([value, label]) => (
              <Label key={value} className="flex items-center gap-3 rounded-lg border border-[#D8DEE5] bg-[#F4F6F8] p-3">
                <RadioGroupItem value={value} />
                {label}
              </Label>
            ))}
          </RadioGroup>
          <Textarea
            value={decisionNotes}
            onChange={(event) => setDecisionNotes(event.target.value)}
            placeholder="Optional decision notes..."
            className="border-[#D8DEE5] bg-white text-[#20242B]"
          />
          <DialogFooter>
            <Button
              onClick={() => targetCandidate?.id && finalDecisionMutation.mutate({ candidateId: targetCandidate.id, decision: finalDecision })}
              disabled={!targetCandidate?.id || finalDecisionMutation.isPending}
            >
              Submit final decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
