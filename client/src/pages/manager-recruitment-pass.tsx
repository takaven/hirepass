import { useMemo, useState } from "react";
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
  ShieldCheck,
  Star,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import type { Candidate, Interview, Manager, Pass, PassCandidate } from "@shared/schema";

type ManagerPassActionState =
  | "ACTION_REQUIRED"
  | "WAITING"
  | "UPCOMING"
  | "COMPLETED"
  | "EXPIRED"
  | "REVOKED";

type ManagerHiringStage = "Request" | "Screening" | "Interview" | "Decision" | "Offer" | "Handoff";

type ManagerNextDecision = {
  kind:
    | "APPROVE_JD"
    | "REVIEW_CANDIDATE"
    | "SET_INTERVIEW_AVAILABILITY"
    | "SUBMIT_EVALUATION"
    | "MAKE_FINAL_DECISION"
    | "NONE";
  label: string;
  description: string;
  target: "request" | "candidate" | "interview" | "evaluation" | "decision" | "none";
  candidateId?: number;
};

type ManagerPassViewState = {
  actionState: ManagerPassActionState;
  hiringStage: ManagerHiringStage;
  stateLabel: string;
  headline: string;
  summary: string;
  urgency: "normal" | "attention";
  nextDecision: ManagerNextDecision;
  evidence: {
    candidateCount: number;
    activeCandidateCount: number;
    role: string;
    topCandidate?: {
      id: number;
      name: string;
      title: string;
      score: number;
      summary: string;
    };
  };
};

interface ManagerPassData {
  shareLink: { id: number; token: string; passId: number; managerId: number | null; linkType: string; isActive: boolean; expiresAt?: string | null };
  pass: Pass & { positions?: any[] };
  candidates: (PassCandidate & { candidate: Candidate })[];
  interviews: Interview[];
  manager: Manager | null;
  interviewSlots: any[];
  managerPassState: ManagerPassViewState;
}

interface ManagerRecruitmentPassProps {
  token: string;
}

const stateStyles: Record<ManagerPassActionState, string> = {
  ACTION_REQUIRED: "border-amber-400 bg-amber-400/10 text-amber-200",
  WAITING: "border-sky-400 bg-sky-400/10 text-sky-200",
  UPCOMING: "border-blue-400 bg-blue-400/10 text-blue-200",
  COMPLETED: "border-emerald-400 bg-emerald-400/10 text-emerald-200",
  EXPIRED: "border-slate-500 bg-slate-500/10 text-slate-200",
  REVOKED: "border-red-400 bg-red-400/10 text-red-200",
};

async function fetchManagerPass(token: string): Promise<ManagerPassData> {
  const response = await fetch(`/api/manager-pass/${token}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || "Unable to open this Manager Pass");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return payload;
}

function AccessState({ status, message }: { status?: number; message?: string }) {
  const isExpired = status === 410;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <Card className="mx-auto max-w-md border-slate-700 bg-slate-900">
        <CardContent className="pt-8 text-center">
          <Lock className={`mx-auto mb-4 h-12 w-12 ${isExpired ? "text-slate-400" : "text-red-300"}`} />
          <h1 className="mb-2 text-xl font-semibold text-white">
            {isExpired ? "This Manager Pass has expired" : "This Manager Pass is not active"}
          </h1>
          <p className="text-sm text-slate-400">
            {message || "Ask HR to issue a fresh Pass if your input is still required."}
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

  const { data, isLoading, error } = useQuery<ManagerPassData>({
    queryKey: ["/api/manager-pass", token],
    queryFn: () => fetchManagerPass(token),
  });

  const approveRequestMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/manager-pass/${token}/approve-jd`, {}),
    onSuccess: () => {
      toast({ title: "Hiring request approved", description: "HR has your decision." });
      setShowRequestDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/manager-pass", token] });
    },
    onError: () => toast({ title: "Decision could not be submitted", variant: "destructive" }),
  });

  const requestChangesMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/manager-pass/${token}/request-jd-changes`, { feedback: decisionNotes }),
    onSuccess: () => {
      toast({ title: "Changes requested", description: "HR has your feedback." });
      setDecisionNotes("");
      setShowRequestDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/manager-pass", token] });
    },
    onError: () => toast({ title: "Feedback could not be submitted", variant: "destructive" }),
  });

  const shortlistMutation = useMutation({
    mutationFn: (candidateId: number) => apiRequest("POST", `/api/manager-pass/${token}/candidates/${candidateId}/shortlist`),
    onSuccess: () => {
      toast({ title: "Candidate shortlisted", description: "Your Manager Pass has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-pass", token] });
    },
    onError: () => toast({ title: "Candidate decision could not be submitted", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (candidateId: number) => apiRequest("POST", `/api/manager-pass/${token}/candidates/${candidateId}/reject`, { reason: "Manager decision", notes: decisionNotes }),
    onSuccess: () => {
      toast({ title: "Candidate rejected", description: "Your Manager Pass has been updated." });
      setDecisionNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/manager-pass", token] });
    },
    onError: () => toast({ title: "Candidate decision could not be submitted", variant: "destructive" }),
  });

  const interviewSetupMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/manager-pass/${token}/interview-setup`, {
        technicalAssessmentRequired: false,
        interviewFormat: "online",
        interviewRounds: 1,
        interviewDuration: 45,
        isPanelInterview: false,
      }),
    onSuccess: () => {
      toast({ title: "Interview availability submitted", description: "HR can now schedule the next step." });
      setShowInterviewDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/manager-pass", token] });
    },
    onError: () => toast({ title: "Interview setup could not be submitted", variant: "destructive" }),
  });

  const evaluationMutation = useMutation({
    mutationFn: (interviewId: number) =>
      apiRequest("POST", `/api/manager-pass/${token}/evaluations`, {
        interviewId,
        educationalBackground: 4,
        priorWorkExperience: 4,
        technicalSkills: 4,
        personalityTeamFit: 4,
        initiative: 4,
        timeManagement: 4,
        averageScore: "4.00",
        recommendation: evaluationRecommendation,
        notesObservations: decisionNotes,
        finalComments: decisionNotes,
      }),
    onSuccess: () => {
      toast({ title: "Evaluation submitted", description: "HR has your structured feedback." });
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
      toast({ title: "Final decision submitted", description: "You're done for now. HR has your decision." });
      setDecisionNotes("");
      setShowFinalDecisionDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/manager-pass", token] });
    },
    onError: () => toast({ title: "Final decision could not be submitted", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-300" />
          <p className="text-sm text-slate-400">Opening Manager Pass...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.managerPassState) {
    const typedError = error as Error & { status?: number };
    return <AccessState status={typedError?.status} message={typedError?.message} />;
  }

  const { pass, candidates, interviews, manager, managerPassState } = data;
  const targetCandidate = candidates.find((candidate) => candidate.id === managerPassState.nextDecision.candidateId) || managerPassState.evidence.topCandidate;
  const targetInterview = interviews.find((interview) => interview.passCandidateId === managerPassState.nextDecision.candidateId) || interviews[0];

  const actionButton = useMemo(() => {
    switch (managerPassState.nextDecision.kind) {
      case "APPROVE_JD":
        return <Button className="min-h-11 bg-blue-500 hover:bg-blue-600" onClick={() => setShowRequestDialog(true)}>Review hiring request</Button>;
      case "REVIEW_CANDIDATE":
        return (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button className="min-h-11 bg-emerald-500 hover:bg-emerald-600" onClick={() => targetCandidate?.id && shortlistMutation.mutate(targetCandidate.id)}>
              Shortlist candidate
            </Button>
            <Button variant="destructive" className="min-h-11" onClick={() => targetCandidate?.id && rejectMutation.mutate(targetCandidate.id)}>
              Reject candidate
            </Button>
          </div>
        );
      case "SET_INTERVIEW_AVAILABILITY":
        return <Button className="min-h-11 bg-blue-500 hover:bg-blue-600" onClick={() => setShowInterviewDialog(true)}>Set interview availability</Button>;
      case "SUBMIT_EVALUATION":
        return <Button className="min-h-11 bg-blue-500 hover:bg-blue-600" onClick={() => setShowEvaluationDialog(true)}>Submit evaluation</Button>;
      case "MAKE_FINAL_DECISION":
        return <Button className="min-h-11 bg-blue-500 hover:bg-blue-600" onClick={() => setShowFinalDecisionDialog(true)}>Make final decision</Button>;
      default:
        return <Button className="min-h-11" disabled>No decision required</Button>;
    }
  }, [managerPassState.nextDecision.kind, rejectMutation, shortlistMutation, targetCandidate?.id]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-slate-500">Manager Pass</p>
              <h1 className="truncate text-base font-semibold text-white">{pass.positionTitle}</h1>
            </div>
          </div>
          <Badge className={`shrink-0 border ${stateStyles[managerPassState.actionState]}`}>{managerPassState.stateLabel}</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:py-8">
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card className={`border ${stateStyles[managerPassState.actionState]} bg-slate-900`}>
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-400">
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
                  <h2 className="text-2xl font-semibold text-white sm:text-3xl">{managerPassState.headline}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">{managerPassState.summary}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm">
                  <p className="text-slate-500">Stage</p>
                  <p className="font-medium text-white">{managerPassState.hiringStage}</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Required decision</p>
                <div className="mt-2 space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{managerPassState.nextDecision.label}</h3>
                    <p className="mt-1 text-sm text-slate-400">{managerPassState.nextDecision.description}</p>
                  </div>
                  {actionButton}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="border-slate-800 bg-slate-900/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-white">Urgency</CardTitle>
              </CardHeader>
              <CardContent className="flex items-start gap-3 text-sm text-slate-300">
                {managerPassState.urgency === "attention" ? <AlertTriangle className="h-5 w-5 text-amber-300" /> : <Clock className="h-5 w-5 text-sky-300" />}
                <span>{managerPassState.urgency === "attention" ? "Your decision is needed to keep the process moving." : "No immediate decision is needed."}</span>
              </CardContent>
            </Card>
            <Card className="border-slate-800 bg-slate-900/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-white">Hiring context</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-300">
                <p>Role: {managerPassState.evidence.role}</p>
                <p>Active candidates: {managerPassState.evidence.activeCandidateCount}</p>
                <p>Total candidates in this request: {managerPassState.evidence.candidateCount}</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {["WAITING", "COMPLETED"].includes(managerPassState.actionState) && (
          <Card className="border-emerald-500/40 bg-emerald-500/10">
            <CardContent className="flex items-start gap-4 p-5">
              <CheckCircle className="mt-1 h-6 w-6 shrink-0 text-emerald-200" />
              <div>
                <h3 className="font-semibold text-white">You're done for now</h3>
                <p className="mt-1 text-sm leading-6 text-emerald-100/80">
                  HR has your decision. This Pass will show a new action if your input is needed again.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <section className="grid gap-5 lg:grid-cols-2">
          <Card className="border-slate-800 bg-slate-900/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <FileText className="h-5 w-5 text-blue-300" />
                Decision evidence
              </CardTitle>
              <CardDescription className="text-slate-400">Only the evidence needed for this decision is shown.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-300">
              <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Role</p>
                <p className="mt-1 font-medium text-white">{pass.positionTitle}</p>
                <p>{pass.department || "Department not specified"} · {pass.location || "Location not specified"}</p>
              </div>
              {targetCandidate && "candidate" in targetCandidate && (
                <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Candidate</p>
                  <p className="mt-1 font-medium text-white">{targetCandidate.candidate.name}</p>
                  <p>{targetCandidate.candidate.currentTitle || "Profile under review"}</p>
                  <p>{targetCandidate.candidate.experienceYears ? `${targetCandidate.candidate.experienceYears} years experience` : "Experience not specified"}</p>
                  <p className="mt-2 text-slate-400">{targetCandidate.candidate.cvSummary || "No candidate summary is available yet."}</p>
                </div>
              )}
              {managerPassState.evidence.topCandidate && !("candidate" in (targetCandidate || {})) && (
                <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Candidate</p>
                  <p className="mt-1 font-medium text-white">{managerPassState.evidence.topCandidate.name}</p>
                  <p>{managerPassState.evidence.topCandidate.title}</p>
                  <p className="mt-2 text-slate-400">{managerPassState.evidence.topCandidate.summary}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Users className="h-5 w-5 text-sky-300" />
                Request candidates
              </CardTitle>
              <CardDescription className="text-slate-400">Candidate details are scoped to this hiring request.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {candidates.length === 0 ? (
                <p className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">No candidates have been added to this request yet.</p>
              ) : (
                candidates.slice(0, 4).map((passCandidate) => (
                  <div key={passCandidate.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{passCandidate.candidate.name}</p>
                      <p className="truncate text-xs text-slate-500">{passCandidate.candidate.currentTitle || "Profile under review"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {Boolean(passCandidate.aiScore) && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-200">
                          <Star className="h-3 w-3" />
                          {passCandidate.aiScore}
                        </span>
                      )}
                      <Badge variant="outline" className="border-slate-600 text-slate-300">{statusLabel(passCandidate.status)}</Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Calendar className="h-5 w-5 text-blue-300" />
                Interview context
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {interviews.length === 0 ? (
                <p className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">No interviews are scheduled for this request yet.</p>
              ) : (
                interviews.slice(0, 3).map((interview) => (
                  <div key={interview.id} className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                    <p className="font-medium text-white">{interview.interviewDate}</p>
                    <p className="text-sm text-slate-400">{interview.startTime} - {interview.endTime} ({interview.format})</p>
                    <p className="text-xs text-slate-500">Status: {statusLabel(interview.status)}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <MessageSquare className="h-5 w-5 text-slate-300" />
                What happens next
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-slate-300">
              {managerPassState.actionState === "ACTION_REQUIRED"
                ? "Submit the decision above. HR receives it and the Pass will update to the next waiting or completion state."
                : "No action is needed now. HR will update this Pass when manager input is needed again."}
            </CardContent>
          </Card>
        </section>
      </main>

      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent className="border-slate-700 bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle>Review hiring request</DialogTitle>
            <DialogDescription className="text-slate-400">Approve the request or ask HR for specific changes.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={decisionNotes}
            onChange={(event) => setDecisionNotes(event.target.value)}
            placeholder="Optional notes for HR..."
            className="border-slate-700 bg-slate-950 text-white"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="border-slate-600 text-slate-200" onClick={() => requestChangesMutation.mutate()}>
              Request changes
            </Button>
            <Button onClick={() => approveRequestMutation.mutate()}>Approve request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInterviewDialog} onOpenChange={setShowInterviewDialog}>
        <DialogContent className="border-slate-700 bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle>Set interview availability</DialogTitle>
            <DialogDescription className="text-slate-400">This bounded slice records a simple interview setup using the existing endpoint.</DialogDescription>
          </DialogHeader>
          <p className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">
            Format: online · Round: 1 · Duration: 45 minutes
          </p>
          <DialogFooter>
            <Button onClick={() => interviewSetupMutation.mutate()} disabled={interviewSetupMutation.isPending}>
              Submit availability
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEvaluationDialog} onOpenChange={setShowEvaluationDialog}>
        <DialogContent className="border-slate-700 bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle>Submit structured evaluation</DialogTitle>
            <DialogDescription className="text-slate-400">Keep the scorecard concise and decision-focused.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Recommendation</Label>
              <Select value={evaluationRecommendation} onValueChange={setEvaluationRecommendation}>
                <SelectTrigger className="mt-2 border-slate-700 bg-slate-950">
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
              placeholder="Evidence-based notes for HR..."
              className="border-slate-700 bg-slate-950 text-white"
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
        <DialogContent className="border-slate-700 bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle>Make final decision</DialogTitle>
            <DialogDescription className="text-slate-400">Submit one clear decision for HR to action.</DialogDescription>
          </DialogHeader>
          <RadioGroup value={finalDecision} onValueChange={setFinalDecision} className="grid gap-3">
            {[
              ["hire", "Hire"],
              ["reserve", "Reserve"],
              ["reject", "Reject"],
            ].map(([value, label]) => (
              <Label key={value} className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-950 p-3">
                <RadioGroupItem value={value} />
                {label}
              </Label>
            ))}
          </RadioGroup>
          <Textarea
            value={decisionNotes}
            onChange={(event) => setDecisionNotes(event.target.value)}
            placeholder="Optional decision notes..."
            className="border-slate-700 bg-slate-950 text-white"
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
