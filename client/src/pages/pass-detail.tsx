import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import {
  ArrowLeft,
  FileText,
  MapPin,
  Users,
  Clock,
  Plus,
  Edit,
  Calendar,
  UserPlus,
  ChevronRight,
  Check,
  X,
  Loader2,
  GripVertical,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Pass, Candidate } from "@shared/schema";

interface PassCandidate {
  id: number;
  passId: number;
  candidateId: number;
  status: string;
  aiRank: number | null;
  aiScore: number | null;
  aiBrief: string | null;
  candidate: Candidate;
}

const statusPipeline = [
  { value: "new", label: "New", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  { value: "screening", label: "Screening", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "shortlisted", label: "Shortlisted", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  { value: "interview", label: "Interview", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  { value: "offer", label: "Offer", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  { value: "hired", label: "Hired", color: "bg-green-500 text-white" },
  { value: "rejected", label: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
];

function CandidateStatusBadge({ status }: { status: string }) {
  const statusConfig = statusPipeline.find(s => s.value === status) || statusPipeline[0];
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
      {statusConfig.label}
    </span>
  );
}

export default function PassDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/passes/:id");
  const { toast } = useToast();
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");

  const passId = params?.id;

  const { data: pass, isLoading: passLoading } = useQuery<Pass>({
    queryKey: ["/api/passes", passId],
    enabled: !!passId,
  });

  const { data: passCandidates, isLoading: candidatesLoading } = useQuery<PassCandidate[]>({
    queryKey: ["/api/passes", passId, "candidates"],
    enabled: !!passId,
  });

  const { data: allCandidates } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates"],
  });

  const addCandidateMutation = useMutation({
    mutationFn: async (candidateId: number) => {
      await apiRequest("POST", `/api/passes/${passId}/candidates`, { candidateId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/passes", passId, "candidates"] });
      toast({ title: "Candidate added to pass" });
      setAddCandidateOpen(false);
      setSelectedCandidateId("");
    },
    onError: () => {
      toast({ title: "Failed to add candidate", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/pass-candidates/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/passes", passId, "candidates"] });
      toast({ title: "Candidate status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const availableCandidates = allCandidates?.filter(
    c => !passCandidates?.some(pc => pc.candidateId === c.id)
  );

  const getDaysInStatus = (date: Date | null) => {
    if (!date) return 0;
    const diff = Date.now() - new Date(date).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const groupedCandidates = statusPipeline.map(status => ({
    ...status,
    candidates: passCandidates?.filter(pc => pc.status === status.value) || [],
  }));

  if (passLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (!pass) {
    return (
      <GlassCard className="p-12 text-center">
        <FileText className="w-16 h-16 mx-auto text-primary/30" strokeWidth={1} />
        <h3 className="mt-4 text-lg font-medium">Pass not found</h3>
        <Link href="/passes">
          <Button variant="outline" className="mt-4 rounded-xl">
            Back to Passes
          </Button>
        </Link>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href="/passes">
            <Button variant="ghost" size="icon" className="rounded-xl" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-semibold tracking-tight">{pass.positionTitle}</h1>
              <span className="text-sm text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded">
                {pass.passId}
              </span>
              <StatusBadge status={pass.status as any} />
            </div>
            <p className="text-muted-foreground mt-1">
              {pass.department} - {pass.location}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/passes/${passId}/pass`}>
            <Button variant="outline" className="rounded-xl gap-2" data-testid="button-view-pass">
              <FileText className="w-4 h-4" strokeWidth={1.5} />
              View Pass
            </Button>
          </Link>
          <Dialog open={addCandidateOpen} onOpenChange={setAddCandidateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-xl gap-2" data-testid="button-add-candidate">
                <UserPlus className="w-4 h-4" strokeWidth={1.5} />
                Add Candidate
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl">
              <DialogHeader>
                <DialogTitle>Add Candidate to Pass</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Select value={selectedCandidateId} onValueChange={setSelectedCandidateId}>
                  <SelectTrigger className="rounded-xl" data-testid="select-candidate-to-add">
                    <SelectValue placeholder="Select a candidate" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCandidates?.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name} {c.currentTitle && `- ${c.currentTitle}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex justify-end gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => setAddCandidateOpen(false)}
                    className="rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => addCandidateMutation.mutate(parseInt(selectedCandidateId))}
                    disabled={!selectedCandidateId || addCandidateMutation.isPending}
                    className="rounded-xl gap-2"
                    data-testid="button-confirm-add"
                  >
                    {addCandidateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Add to Pass
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Link href={`/passes/${passId}/edit`}>
            <Button className="rounded-xl gap-2" data-testid="button-edit-pass">
              <Edit className="w-4 h-4" strokeWidth={1.5} />
              Edit Pass
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassCard className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" strokeWidth={1.5} />
            Pass Details
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Department</span>
              <p className="font-medium">{pass.department}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Location</span>
              <p className="font-medium">{pass.location}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Employment Type</span>
              <p className="font-medium">{pass.employmentType}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Headcount</span>
              <p className="font-medium">{pass.headcount}</p>
            </div>
            {pass.experienceMin && pass.experienceMax && (
              <div>
                <span className="text-muted-foreground">Experience Required</span>
                <p className="font-medium">{pass.experienceMin} - {pass.experienceMax} years</p>
              </div>
            )}
            {pass.salaryRangeMin && pass.salaryRangeMax && (
              <div>
                <span className="text-muted-foreground">Salary Range</span>
                <p className="font-medium">
                  {pass.salaryCurrency} {pass.salaryRangeMin?.toLocaleString()} - {pass.salaryRangeMax?.toLocaleString()}
                </p>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Priority</span>
              <p className="font-medium capitalize">{pass.priority}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Days Open</span>
              <p className="font-medium">{getDaysInStatus(pass.dateRequested)} days</p>
            </div>
          </div>
          {pass.jobDescriptionDraft && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-medium mb-2">Job Description</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {pass.jobDescriptionDraft}
              </p>
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" strokeWidth={1.5} />
            Pipeline Summary
          </h2>
          <div className="space-y-3">
            {groupedCandidates.map(stage => (
              <div key={stage.value} className="flex items-center justify-between">
                <span className="text-sm">{stage.label}</span>
                <Badge variant="secondary" className="rounded-full">
                  {stage.candidates.length}
                </Badge>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Total Candidates</span>
              <span className="font-bold text-lg">{passCandidates?.length || 0}</span>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" strokeWidth={1.5} />
            Candidates Pipeline
          </h2>
        </div>

        {candidatesLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : passCandidates?.length ? (
          <div className="space-y-3">
            {passCandidates.map(pc => (
              <div
                key={pc.id}
                className="flex items-center justify-between gap-4 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                data-testid={`candidate-row-${pc.id}`}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-primary">
                      {pc.candidate?.name?.charAt(0) || "?"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <Link href={`/candidates/${pc.candidateId}`}>
                      <p className="font-medium truncate hover:text-primary transition-colors cursor-pointer">
                        {pc.candidate?.name || `Candidate #${pc.candidateId}`}
                      </p>
                    </Link>
                    <p className="text-sm text-muted-foreground truncate">
                      {pc.candidate?.currentTitle} {pc.candidate?.currentCompany && `at ${pc.candidate.currentCompany}`}
                    </p>
                  </div>
                </div>
                <Select
                  value={pc.status}
                  onValueChange={(status) => updateStatusMutation.mutate({ id: pc.id, status })}
                >
                  <SelectTrigger className="w-40 rounded-xl" data-testid={`select-status-${pc.id}`}>
                    <CandidateStatusBadge status={pc.status} />
                  </SelectTrigger>
                  <SelectContent>
                    {statusPipeline.map(s => (
                      <SelectItem key={s.value} value={s.value}>
                        <CandidateStatusBadge status={s.value} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Link href={`/interviews/new?passId=${passId}&candidateId=${pc.id}`}>
                  <Button variant="ghost" size="icon" className="rounded-xl" data-testid={`button-schedule-${pc.id}`}>
                    <Calendar className="w-4 h-4" strokeWidth={1.5} />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto text-muted-foreground/30" strokeWidth={1} />
            <p className="mt-4 text-muted-foreground">No candidates added yet</p>
            <Button 
              variant="outline" 
              className="mt-4 rounded-xl gap-2"
              onClick={() => setAddCandidateOpen(true)}
            >
              <UserPlus className="w-4 h-4" strokeWidth={1.5} />
              Add First Candidate
            </Button>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
