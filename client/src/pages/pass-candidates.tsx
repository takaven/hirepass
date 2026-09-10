import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft,
  Users,
  Briefcase,
  Calendar,
  Plus,
  Check,
  X,
  Loader2,
  GripVertical,
  Search,
  MoreHorizontal,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  Clock,
  RefreshCw,
  Filter,
  Share2,
  Link as LinkIcon,
  Copy,
  ExternalLink,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import type { Pass, Candidate, PassPosition, Manager } from "@shared/schema";
import { configuredStages } from "@shared/hiring-workflow";

interface PassCandidate {
  id: number;
  passId: number;
  candidateId: number;
  positionId: number | null;
  status: string;
  aiRank: number | null;
  aiScore: number | null;
  aiBrief: string | null;
  addedAt: string | null;
  candidate: Candidate;
}

interface AiReview {
  id: number;
  passCandidateId: number | null;
  positionId?: number | null;
  criteriaVersion?: number;
  status: string;
  reviewBand: string | null;
  staleReason?: string | null;
  safeErrorCode?: string | null;
  completedAt?: string | null;
  documentId?: number | null;
  result?: {
    criteria?: Array<{
      criterionId: number;
      status: string;
      evidence: Array<{ source: "cv" | "profile"; field?: string; excerpt: string }>;
      rationale: string;
      gaps: string[];
    }>;
    strengths?: string[];
    materialGaps?: string[];
    clarificationQuestions?: string[];
    summary?: string;
  } | null;
  criteriaSnapshot?: Array<{ id: number; title: string; importance: string }>;
}

type PipelineData = Record<string, PassCandidate[]>;

const STAGES = [
  { key: "new", label: "Applied", color: "bg-gray-500" },
  { key: "screening", label: "Review", color: "bg-blue-500" },
  { key: "shortlisted", label: "Shortlisted", color: "bg-indigo-500" },
  { key: "interview", label: "Interview", color: "bg-purple-500" },
  { key: "offer", label: "Offer", color: "bg-amber-500" },
  { key: "hired", label: "Hired", color: "bg-green-500" },
  { key: "rejected", label: "Rejected", color: "bg-red-500" },
];

const POSITION_COLORS = [
  "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30",
  "bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30",
  "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30",
  "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30",
  "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
];

export default function PassCandidates() {
  const [, params] = useRoute("/passes/:passId/candidates");
  const passId = params?.passId;
  const { toast } = useToast();

  const [selectedCandidates, setSelectedCandidates] = useState<number[]>([]);
  const [detailCandidate, setDetailCandidate] = useState<PassCandidate | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [shareLinkDialogOpen, setShareLinkDialogOpen] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [selectedPositionId, setSelectedPositionId] = useState<string>("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [draggedItem, setDraggedItem] = useState<PassCandidate | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [filterPositionId, setFilterPositionId] = useState<string>("all");
  const [generatedManagerLink, setGeneratedManagerLink] = useState<string | null>(null);
  const [selectedStakeholderId, setSelectedStakeholderId] = useState<string>("");
  const [selectedCandidateForLink, setSelectedCandidateForLink] = useState<string>("");
  const [generatedCandidateLink, setGeneratedCandidateLink] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [comparison, setComparison] = useState<any | null>(null);
  const [interviewQuestions, setInterviewQuestions] = useState<string[] | null>(null);

  const { data: pass, isLoading: passLoading } = useQuery<Pass>({
    queryKey: ["/api/passes", passId],
    enabled: !!passId,
  });
  const { data: stakeholders } = useQuery<Manager[]>({ queryKey: ["/api/managers"] });
  useEffect(() => {
    if (!selectedStakeholderId && pass?.hiringManagerId) setSelectedStakeholderId(String(pass.hiringManagerId));
  }, [pass?.hiringManagerId, selectedStakeholderId]);
  const visibleStages = STAGES.filter((stage) => stage.key === "rejected" || configuredStages(pass?.enabledStages).includes(stage.key as any));

  const { data: pipeline, isLoading: pipelineLoading } = useQuery<PipelineData>({
    queryKey: ["/api/passes", passId, "candidates", "pipeline"],
    enabled: !!passId,
  });

  const { data: positions, isLoading: positionsLoading } = useQuery<PassPosition[]>({
    queryKey: ["/api/passes", passId, "positions"],
    enabled: !!passId,
  });
  const { data: aiReviews } = useQuery<AiReview[]>({
    queryKey: [`/api/intelligence/passes/${passId}/reviews`],
    enabled: !!passId,
  });
  const { data: libraryMatches } = useQuery<any[]>({
    queryKey: [`/api/intelligence/passes/${passId}/library-matches`],
    enabled: !!passId,
  });
  const reviewByApplication = useMemo(() => {
    const map = new Map<number, AiReview>();
    aiReviews?.forEach((review) => {
      if (review.passCandidateId && !map.has(review.passCandidateId)) map.set(review.passCandidateId, review);
    });
    return map;
  }, [aiReviews]);
  const reviewLabel = (candidateId: number) => {
    const review = reviewByApplication.get(candidateId);
    if (!review) return "Waiting for criteria";
    if (review.status === "pending") return "Queued";
    if (review.status === "processing") return "Reviewing";
    if (review.status === "failed") return "Failed";
    if (review.status === "stale") return "Stale";
    switch (review.reviewBand) {
      case "strong_evidence": return "Strong evidence";
      case "clarify_required": return "Clarification needed";
      case "required_gap_evidenced": return "Required gap evidenced";
      case "insufficient_evidence": return "Insufficient evidence";
      default: return "AI review complete";
    }
  };

  const { data: detailReview } = useQuery<AiReview>({
    queryKey: [`/api/intelligence/applications/${detailCandidate?.id}/review`],
    enabled: !!detailCandidate?.id,
  });
  useEffect(() => setInterviewQuestions(null), [detailCandidate?.id]);

  const retryAiReviewMutation = useMutation({
    mutationFn: async (passCandidateId: number) => {
      await apiRequest("POST", `/api/intelligence/applications/${passCandidateId}/review`, { force: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/intelligence/passes/${passId}/reviews`] });
      if (detailCandidate?.id) queryClient.invalidateQueries({ queryKey: [`/api/intelligence/applications/${detailCandidate.id}/review`] });
      toast({ title: "AI review queued" });
    },
    onError: () => {
      toast({ title: "AI review unavailable. Retry.", variant: "destructive" });
    },
  });

  const findExistingMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/intelligence/passes/${passId}/library-matches`, {
      positionId: filterPositionId !== "all" && filterPositionId !== "unassigned" ? Number(filterPositionId) : undefined,
    }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: [`/api/intelligence/passes/${passId}/library-matches`] });
      toast({ title: "Finding existing candidates" });
    },
    onError: () => toast({ title: "AI matching unavailable. Retry.", variant: "destructive" }),
  });

  const compareMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/intelligence/passes/${passId}/compare`, { passCandidateIds: selectedCandidates.slice(0, 4) });
      return response.json();
    },
    onSuccess: (data) => {
      setComparison(data);
      setCompareOpen(true);
    },
    onError: () => toast({ title: "Compare needs completed AI reviews for 2–4 candidates.", variant: "destructive" }),
  });

  const interviewQuestionsMutation = useMutation({
    mutationFn: async (passCandidateId: number) => {
      const response = await apiRequest("POST", `/api/intelligence/applications/${passCandidateId}/interview-questions`, {});
      return response.json();
    },
    onSuccess: (data) => setInterviewQuestions(data.questions || []),
    onError: () => toast({ title: "Interview questions unavailable. Retry.", variant: "destructive" }),
  });

  const { data: allCandidates } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates"],
  });

  const positionMap = useMemo(() => {
    const map = new Map<number, PassPosition>();
    positions?.forEach(pos => map.set(pos.id, pos));
    return map;
  }, [positions]);

  const getPositionColor = (positionId: number | null): string => {
    if (!positionId || !positions) return "";
    const index = positions.findIndex(p => p.id === positionId);
    return POSITION_COLORS[index % POSITION_COLORS.length];
  };

  const filteredPipeline = useMemo(() => {
    if (!pipeline) return null;
    if (filterPositionId === "all") return pipeline;
    
    const filtered: PipelineData = {};
    for (const [stage, candidates] of Object.entries(pipeline)) {
      filtered[stage] = candidates.filter(pc => 
        filterPositionId === "unassigned" 
          ? !pc.positionId 
          : pc.positionId === parseInt(filterPositionId)
      );
    }
    return filtered;
  }, [pipeline, filterPositionId]);

  const positionBreakdown = useMemo(() => {
    if (!pipeline || !positions) return null;
    const allCandidates = Object.values(pipeline).flat();
    const counts = new Map<number | null, number>();
    
    allCandidates.forEach(pc => {
      const key = pc.positionId;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return {
      total: positions.length,
      breakdown: positions.map(pos => ({
        id: pos.id,
        title: pos.positionTitle,
        count: counts.get(pos.id) || 0,
        headcount: pos.headcount || 1,
      })),
      unassigned: counts.get(null) || 0,
    };
  }, [pipeline, positions]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/pass-candidates/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/passes", passId, "candidates", "pipeline"] });
      toast({ title: "Candidate status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      await apiRequest("POST", "/api/pass-candidates/bulk-update", { ids, status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/passes", passId, "candidates", "pipeline"] });
      setSelectedCandidates([]);
      toast({ title: "Candidates updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update candidates", variant: "destructive" });
    },
  });

  const addCandidateMutation = useMutation({
    mutationFn: async ({ candidateId, positionId }: { candidateId: number; positionId?: number }) => {
      await apiRequest("POST", `/api/passes/${passId}/candidates`, { 
        candidateId,
        positionId: positionId || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/passes", passId, "candidates", "pipeline"] });
      toast({ title: "Candidate added to pass" });
      setAddDialogOpen(false);
      setSelectedCandidateId("");
      setSelectedPositionId("");
      setCandidateSearch("");
    },
    onError: () => {
      toast({ title: "Failed to add candidate", variant: "destructive" });
    },
  });

  const createManagerLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/share-links", { 
        passId: parseInt(passId!),
        managerId: selectedStakeholderId ? parseInt(selectedStakeholderId) : undefined,
        linkType: "manager"
      });
      return res.json();
    },
    onSuccess: (data) => {
      const link = `${window.location.origin}/manager-pass/${data.token}`;
      setGeneratedManagerLink(link);
      toast({ title: "Stakeholder Pass link created" });
    },
    onError: () => {
      toast({ title: "Failed to create manager link", variant: "destructive" });
    },
  });

  const createCandidateLinkMutation = useMutation({
    mutationFn: async (passCandidateId: number) => {
      const res = await apiRequest("POST", "/api/candidate-links", { 
        passCandidateId
      });
      return res.json();
    },
    onSuccess: (data) => {
      const link = `${window.location.origin}/candidate-pass/${data.token}`;
      setGeneratedCandidateLink(link);
      toast({ title: "Candidate link created!" });
    },
    onError: () => {
      toast({ title: "Failed to create candidate link", variant: "destructive" });
    },
  });

  const existingCandidateIds = pipeline 
    ? Object.values(pipeline).flat().map(pc => pc.candidateId)
    : [];

  const availableCandidates = allCandidates?.filter(
    c => !existingCandidateIds.includes(c.id) &&
      (candidateSearch === "" || 
        c.name.toLowerCase().includes(candidateSearch.toLowerCase()) ||
        c.email?.toLowerCase().includes(candidateSearch.toLowerCase()))
  );

  const totalCandidates = pipeline
    ? Object.values(pipeline).reduce((sum, arr) => sum + arr.length, 0)
    : 0;

  const handleDragStart = useCallback((e: React.DragEvent, pc: PassCandidate) => {
    setDraggedItem(pc);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    setDragOverColumn(stageKey);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (draggedItem && draggedItem.status !== stageKey) {
      updateStatusMutation.mutate({ id: draggedItem.id, status: stageKey });
    }
    setDraggedItem(null);
  }, [draggedItem, updateStatusMutation]);

  const toggleSelection = (id: number) => {
    setSelectedCandidates(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleBulkMove = (status: string) => {
    if (selectedCandidates.length > 0) {
      bulkUpdateMutation.mutate({ ids: selectedCandidates, status });
    }
  };

  const handleBulkReject = () => {
    handleBulkMove("rejected");
  };

  const handleAddCandidate = () => {
    if (!selectedCandidateId) return;
    addCandidateMutation.mutate({
      candidateId: parseInt(selectedCandidateId),
      positionId: selectedPositionId ? parseInt(selectedPositionId) : undefined,
    });
  };

  if (passLoading || pipelineLoading || positionsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-96 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!pass) {
    return (
      <GlassCard className="p-12 text-center">
        <Users className="w-16 h-16 mx-auto text-primary/30" strokeWidth={1} />
        <h3 className="mt-4 text-lg font-medium">Pass not found</h3>
        <Link href="/passes">
          <Button variant="outline" className="mt-4 rounded-xl">
            Back to Vacancies
          </Button>
        </Link>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href={`/passes/${passId}`}>
            <Button variant="ghost" size="icon" className="rounded-xl" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" strokeWidth={2} />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight">{pass.positionTitle}</h1>
              <StatusBadge status={pass.status as any} />
            </div>
            <p className="text-sm text-muted-foreground">
              {pass.department} - {totalCandidates} candidates
              {positionBreakdown && positionBreakdown.total > 0 && (
                <span className="ml-2" data-testid="text-positions-summary">
                  | {positionBreakdown.total} Position{positionBreakdown.total !== 1 ? 's' : ''}
                  {positionBreakdown.breakdown.length > 0 && ': '}
                  {positionBreakdown.breakdown
                    .filter(p => p.count > 0)
                    .map(p => `${p.count} ${p.title}`)
                    .join(', ')}
                  {positionBreakdown.unassigned > 0 && `, ${positionBreakdown.unassigned} Unassigned`}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="rounded-xl gap-2"
            onClick={() => findExistingMutation.mutate()}
            disabled={findExistingMutation.isPending}
            data-testid="button-find-existing-candidates"
          >
            {findExistingMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" strokeWidth={2} />}
            Find existing candidates
          </Button>
          <Button 
            variant="outline" 
            className="rounded-xl gap-2"
            onClick={() => setShareLinkDialogOpen(true)}
            data-testid="button-share-links"
          >
            <Share2 className="w-4 h-4" strokeWidth={2} />
            Share Links
          </Button>
          <Button 
            variant="outline" 
            className="rounded-xl gap-2"
            onClick={() => setAddDialogOpen(true)}
            data-testid="button-add-candidate"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            Add Candidate
          </Button>
        </div>
      </div>

      {positions && positions.length > 0 && (
        <div 
          className="flex items-center gap-2 overflow-x-auto pb-2"
          data-testid="position-filter-tabs"
        >
          <div className="flex items-center gap-1 text-sm text-muted-foreground mr-2">
            <Filter className="w-4 h-4" strokeWidth={2} />
            <span>Filter:</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={`
              rounded-xl px-4 transition-all
              ${filterPositionId === "all" 
                ? "bg-[#00C853]/20 text-[#00C853] border border-[#00C853]/40" 
                : "bg-white/50 dark:bg-[rgba(40,40,40,0.5)] backdrop-blur-lg border border-white/30 dark:border-white/10"}
            `}
            onClick={() => setFilterPositionId("all")}
            data-testid="filter-position-all"
          >
            All Positions
          </Button>
          {positions.map((position, index) => (
            <Button
              key={position.id}
              variant="ghost"
              size="sm"
              className={`
                rounded-xl px-4 transition-all
                ${filterPositionId === String(position.id) 
                  ? "bg-[#00C853]/20 text-[#00C853] border border-[#00C853]/40" 
                  : "bg-white/50 dark:bg-[rgba(40,40,40,0.5)] backdrop-blur-lg border border-white/30 dark:border-white/10"}
              `}
              onClick={() => setFilterPositionId(String(position.id))}
              data-testid={`filter-position-${position.id}`}
            >
              {position.positionTitle}
              <Badge 
                variant="secondary" 
                className={`ml-2 ${POSITION_COLORS[index % POSITION_COLORS.length]}`}
              >
                {positionBreakdown?.breakdown.find(b => b.id === position.id)?.count || 0}
              </Badge>
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className={`
              rounded-xl px-4 transition-all
              ${filterPositionId === "unassigned" 
                ? "bg-[#00C853]/20 text-[#00C853] border border-[#00C853]/40" 
                : "bg-white/50 dark:bg-[rgba(40,40,40,0.5)] backdrop-blur-lg border border-white/30 dark:border-white/10"}
            `}
            onClick={() => setFilterPositionId("unassigned")}
            data-testid="filter-position-unassigned"
          >
            Unassigned
            <Badge variant="secondary" className="ml-2 bg-gray-500/20 text-gray-600 dark:text-gray-300">
              {positionBreakdown?.unassigned || 0}
            </Badge>
          </Button>
        </div>
      )}

      {selectedCandidates.length > 0 && (
        <GlassCard className="p-4" data-testid="bulk-action-toolbar">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selectedCandidates.length > 0}
                onCheckedChange={() => setSelectedCandidates([])}
                data-testid="checkbox-deselect-all"
              />
              <span className="text-sm font-medium">
                {selectedCandidates.length} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Select onValueChange={handleBulkMove}>
                <SelectTrigger className="w-40 rounded-xl" data-testid="select-bulk-move">
                  <SelectValue placeholder="Move to Stage" />
                </SelectTrigger>
                <SelectContent>
                  {visibleStages.map(stage => (
                    <SelectItem key={stage.key} value={stage.key}>
                      {stage.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="rounded-xl gap-2"
                onClick={() => compareMutation.mutate()}
                disabled={selectedCandidates.length < 2 || selectedCandidates.length > 4 || compareMutation.isPending}
                data-testid="button-compare-candidates"
              >
                Compare
              </Button>
              <Button
                variant="destructive"
                className="rounded-xl gap-2"
                onClick={handleBulkReject}
                disabled={bulkUpdateMutation.isPending}
                data-testid="button-bulk-reject"
              >
                <X className="w-4 h-4" strokeWidth={2} />
                Reject All
              </Button>
            </div>
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {visibleStages.map(stage => {
          const candidates = filteredPipeline?.[stage.key] || [];
          const isOver = dragOverColumn === stage.key;
          
          return (
            <div
              key={stage.key}
              className={`min-h-[400px] flex flex-col ${isOver ? "scale-[1.02]" : ""} transition-transform duration-150`}
              onDragOver={(e) => handleDragOver(e, stage.key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.key)}
              data-testid={`column-${stage.key}`}
            >
              <GlassCard 
                variant="elevated" 
                className={`flex-1 p-3 ${isOver ? "ring-2 ring-primary" : ""}`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                    <h3 className="font-semibold text-sm">{stage.label}</h3>
                  </div>
                  <Badge 
                    variant="secondary" 
                    className="rounded-full bg-primary/10 text-primary"
                    data-testid={`badge-count-${stage.key}`}
                  >
                    {candidates.length}
                  </Badge>
                </div>
                
                <ScrollArea className="h-[350px]">
                  <div className="space-y-2 pr-2">
                    {candidates.map(pc => {
                      const position = pc.positionId ? positionMap.get(pc.positionId) : null;
                      const positionColor = getPositionColor(pc.positionId);
                      
                      return (
                        <div
                          key={pc.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, pc)}
                          onClick={() => setDetailCandidate(pc)}
                          className={`
                            p-3 rounded-xl cursor-pointer transition-all
                            bg-white/60 dark:bg-[rgba(40,40,40,0.7)] backdrop-blur-lg
                            border border-white/40 dark:border-white/10
                            hover:shadow-md hover:scale-[1.02]
                            ${selectedCandidates.includes(pc.id) ? "ring-2 ring-primary" : ""}
                          `}
                          data-testid={`candidate-card-${pc.id}`}
                        >
                          <div className="flex items-start gap-2">
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelection(pc.id);
                              }}
                              className="mt-0.5"
                            >
                              <Checkbox
                                checked={selectedCandidates.includes(pc.id)}
                                onCheckedChange={() => toggleSelection(pc.id)}
                                data-testid={`checkbox-candidate-${pc.id}`}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <GripVertical className="w-3 h-3 text-muted-foreground flex-shrink-0" strokeWidth={2} />
                                <p className="font-medium text-sm truncate">
                                  {pc.candidate?.name || "Unknown"}
                                </p>
                              </div>
                              {pc.candidate?.currentTitle && (
                                <p className="text-xs text-muted-foreground truncate mt-1">
                                  {pc.candidate.currentTitle}
                                </p>
                              )}
                              {position && (
                                <Badge 
                                  variant="outline" 
                                  className={`mt-2 text-[10px] px-1.5 py-0.5 ${positionColor}`}
                                  data-testid={`badge-position-${pc.id}`}
                                >
                                  {position.positionTitle}
                                </Badge>
                              )}
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                {pc.candidate?.experienceYears && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                    {pc.candidate.experienceYears}y exp
                                  </span>
                                )}
                              </div>
                              {pc.addedAt && (
                                <p className="text-[10px] text-muted-foreground mt-2">
                                  Applied {format(new Date(pc.addedAt), "MMM d, yyyy")}
                                </p>
                              )}
                              <Badge variant="secondary" className="mt-2 text-[10px]">
                                {reviewLabel(pc.id)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {candidates.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        No candidates
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </GlassCard>
            </div>
          );
        })}
      </div>

      {libraryMatches?.length ? (
        <GlassCard className="p-4" data-testid="library-match-results">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Existing candidate matches</h3>
              <p className="text-xs text-muted-foreground">HirePass checked the Candidate Library. Add someone only if you want them considered for this vacancy.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {libraryMatches.slice(0, 6).map((match) => (
              <div key={match.id} className="rounded-xl border border-border/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{match.candidate?.name}</p>
                    <p className="text-xs text-muted-foreground">{match.candidate?.currentTitle || "Candidate Library profile"}</p>
                  </div>
                  <Badge variant="outline">{match.status === "completed" ? reviewLabel(match.passCandidateId || -1).replace("Waiting for criteria", match.reviewBand?.replace(/_/g, " ") || "Reviewed") : match.status}</Badge>
                </div>
                <Button className="mt-3 w-full rounded-xl" variant="outline" size="sm" onClick={() => {
                  setSelectedCandidateId(String(match.candidate?.id || ""));
                  setAddDialogOpen(true);
                }}>Add to vacancy</Button>
              </div>
            ))}
          </div>
        </GlassCard>
      ) : null}

      <Sheet open={!!detailCandidate} onOpenChange={() => setDetailCandidate(null)}>
        <SheetContent className="sm:max-w-lg" data-testid="candidate-detail-sheet">
          {detailCandidate && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-lg font-semibold text-primary">
                      {detailCandidate.candidate?.name?.charAt(0) || "?"}
                    </span>
                  </div>
                  <div>
                    <div className="font-semibold">{detailCandidate.candidate?.name}</div>
                    <div className="text-sm font-normal text-muted-foreground">
                      {detailCandidate.candidate?.currentTitle}
                    </div>
                  </div>
                </SheetTitle>
              </SheetHeader>
              
              <div className="mt-6 space-y-6">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={detailCandidate.status} />
                  {detailCandidate.positionId && positionMap.get(detailCandidate.positionId) && (
                    <Badge 
                      variant="outline"
                      className={getPositionColor(detailCandidate.positionId)}
                      data-testid="detail-position-badge"
                    >
                      {positionMap.get(detailCandidate.positionId)?.positionTitle}
                    </Badge>
                  )}
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Contact Information</h4>
                  <div className="space-y-2">
                    {detailCandidate.candidate?.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="w-4 h-4 text-muted-foreground" strokeWidth={2} />
                        <span>{detailCandidate.candidate.email}</span>
                      </div>
                    )}
                    {detailCandidate.candidate?.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-muted-foreground" strokeWidth={2} />
                        <span>{detailCandidate.candidate.phone}</span>
                      </div>
                    )}
                    {detailCandidate.candidate?.currentLocation && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 text-muted-foreground" strokeWidth={2} />
                        <span>{detailCandidate.candidate.currentLocation}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Experience</h4>
                  <div className="space-y-2">
                    {detailCandidate.candidate?.currentCompany && (
                      <div className="flex items-center gap-2 text-sm">
                        <Briefcase className="w-4 h-4 text-muted-foreground" strokeWidth={2} />
                        <span>{detailCandidate.candidate.currentCompany}</span>
                      </div>
                    )}
                    {detailCandidate.candidate?.experienceYears && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 text-muted-foreground" strokeWidth={2} />
                        <span>{detailCandidate.candidate.experienceYears} years experience</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4" data-testid="ai-review-detail">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-medium">AI-assisted review</h4>
                      <p className="text-xs text-muted-foreground">Human decision required.</p>
                    </div>
                    <Badge variant="outline">{detailReview ? reviewLabel(detailCandidate.id) : "Waiting for criteria"}</Badge>
                  </div>
                  {detailReview?.positionId && positionMap.get(detailReview.positionId) && (
                    <p className="text-xs text-muted-foreground">Reviewed for {positionMap.get(detailReview.positionId)?.positionTitle}</p>
                  )}
                  {detailReview?.completedAt && (
                    <p className="text-xs text-muted-foreground">
                      Source document #{detailReview.documentId} · completed {format(new Date(detailReview.completedAt), "MMM d, yyyy")}
                    </p>
                  )}
                  {detailReview?.status === "completed" && detailReview.result ? (
                    <div className="space-y-4">
                      {detailReview.result.summary && <p className="text-sm">{detailReview.result.summary}</p>}
                      <div className="space-y-3">
                        {(detailReview.result.criteria || []).map((criterion) => {
                          const source = detailReview.criteriaSnapshot?.find((item) => item.id === criterion.criterionId);
                          return (
                            <div key={criterion.criterionId} className="rounded-xl border border-border/50 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium">{source?.title || `Criterion ${criterion.criterionId}`}</span>
                                <Badge variant="secondary">{criterion.status.replace(/_/g, " ")}</Badge>
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground">{criterion.rationale}</p>
                              {criterion.evidence?.slice(0, 2).map((evidence, index) => (
                                <blockquote key={index} className="mt-2 border-l-2 border-primary/40 pl-3 text-xs">
                                  {evidence.excerpt}
                                </blockquote>
                              ))}
                              {criterion.gaps?.length > 0 && (
                                <p className="mt-2 text-xs text-muted-foreground">Gap: {criterion.gaps.join("; ")}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {detailReview.result.strengths?.length ? (
                        <p className="text-xs"><span className="font-medium">Strengths:</span> {detailReview.result.strengths.join("; ")}</p>
                      ) : null}
                      {detailReview.result.materialGaps?.length ? (
                        <p className="text-xs"><span className="font-medium">Material gaps:</span> {detailReview.result.materialGaps.join("; ")}</p>
                      ) : null}
                      {detailReview.result.clarificationQuestions?.length ? (
                        <p className="text-xs"><span className="font-medium">Clarify:</span> {detailReview.result.clarificationQuestions.join("; ")}</p>
                      ) : null}
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">Interview help</p>
                            <p className="text-xs text-muted-foreground">Suggest a few questions from this vacancy’s criteria and the candidate’s evidence gaps.</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl"
                            onClick={() => interviewQuestionsMutation.mutate(detailCandidate.id)}
                            disabled={interviewQuestionsMutation.isPending}
                            data-testid="button-suggest-interview-questions"
                          >
                            {interviewQuestionsMutation.isPending ? "Suggesting…" : "Suggest questions"}
                          </Button>
                        </div>
                        {interviewQuestions?.length ? (
                          <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs">
                            {interviewQuestions.map((question, index) => <li key={index}>{question}</li>)}
                          </ol>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {detailReview?.status === "failed" ? "AI review unavailable. Retry." :
                          detailReview?.status === "stale" ? "This review is stale after a criteria or CV change." :
                          detailReview?.status === "pending" ? "AI review is queued." :
                          detailReview?.status === "processing" ? "AI review is in progress." :
                          "Confirm a small set of criteria once to enable automatic review for applications."}
                      </p>
                      {(detailReview?.status === "failed" || detailReview?.status === "stale") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => retryAiReviewMutation.mutate(detailCandidate.id)}
                          disabled={retryAiReviewMutation.isPending}
                        >
                          {detailReview.status === "stale" ? "Update AI review" : "Retry AI review"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Update Status</h4>
                  <Select
                    value={detailCandidate.status}
                    onValueChange={(status) => {
                      updateStatusMutation.mutate({ id: detailCandidate.id, status });
                      setDetailCandidate({ ...detailCandidate, status });
                    }}
                  >
                    <SelectTrigger className="rounded-xl" data-testid="select-detail-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleStages.map(stage => (
                        <SelectItem key={stage.key} value={stage.key}>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                            {stage.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-3 pt-4">
                  <Link href={`/candidates/${detailCandidate.candidateId}`} className="flex-1">
                    <Button variant="outline" className="w-full rounded-xl gap-2" data-testid="button-view-full-profile">
                      View Full Profile
                      <ChevronRight className="w-4 h-4" strokeWidth={2} />
                    </Button>
                  </Link>
                  <Link href={`/interviews/new?passId=${passId}&candidateId=${detailCandidate.id}`} className="flex-1">
                    <Button className="w-full rounded-xl gap-2" data-testid="button-schedule-interview">
                      <Calendar className="w-4 h-4" strokeWidth={2} />
                      Schedule Interview
                    </Button>
                  </Link>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md" data-testid="add-candidate-dialog">
          <DialogHeader>
            <DialogTitle>Add Candidate to Pass</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={2} />
              <Input
                placeholder="Search candidates..."
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
                className="pl-10 rounded-xl"
                data-testid="input-search-candidates"
              />
            </div>
            
            <ScrollArea className="h-[200px] pr-2">
              <div className="space-y-2">
                {availableCandidates?.map(c => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCandidateId(String(c.id))}
                    className={`
                      p-3 rounded-xl cursor-pointer transition-all
                      ${selectedCandidateId === String(c.id) 
                        ? "bg-primary/10 ring-2 ring-primary" 
                        : "bg-muted/50 hover:bg-muted"}
                    `}
                    data-testid={`option-candidate-${c.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-medium text-primary">
                          {c.name.charAt(0)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {c.currentTitle} {c.currentCompany && `at ${c.currentCompany}`}
                        </p>
                      </div>
                      {selectedCandidateId === String(c.id) && (
                        <Check className="w-5 h-5 text-primary flex-shrink-0" strokeWidth={2} />
                      )}
                    </div>
                  </div>
                ))}
                {availableCandidates?.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    {candidateSearch ? "No matching candidates found" : "All candidates already added"}
                  </div>
                )}
              </div>
            </ScrollArea>

            {positions && positions.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Assign to Position (Optional)</label>
                <Select 
                  value={selectedPositionId} 
                  onValueChange={setSelectedPositionId}
                >
                  <SelectTrigger className="rounded-xl" data-testid="select-position">
                    <SelectValue placeholder="Select a position..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No Position</SelectItem>
                    {positions.map((position, index) => (
                      <SelectItem key={position.id} value={String(position.id)}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${POSITION_COLORS[index % POSITION_COLORS.length].split(' ')[0].replace('/20', '')}`} />
                          {position.positionTitle}
                          {position.headcount && position.headcount > 1 && (
                            <span className="text-xs text-muted-foreground">
                              ({position.headcount} openings)
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <Link href="/candidates/new">
                <Button variant="outline" className="rounded-xl gap-2" data-testid="button-create-new-candidate">
                  <Plus className="w-4 h-4" strokeWidth={2} />
                  Create New
                </Button>
              </Link>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAddDialogOpen(false);
                    setSelectedCandidateId("");
                    setSelectedPositionId("");
                    setCandidateSearch("");
                  }}
                  className="rounded-xl"
                  data-testid="button-cancel-add"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddCandidate}
                  disabled={!selectedCandidateId || addCandidateMutation.isPending}
                  className="rounded-xl gap-2"
                  data-testid="button-confirm-add"
                >
                  {addCandidateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Add to vacancy
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Compare candidates</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Side-by-side evidence from existing AI-assisted reviews. HirePass does not make a new AI call or choose a winner.</p>
          {comparison?.reviews?.length ? (
            <div className="overflow-x-auto">
              <table className="mt-4 w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left">Criterion</th>
                    {comparison.candidates.map((application: any) => <th key={application.id} className="px-3 py-2 text-left">{application.candidate?.name || `Candidate #${application.candidateId}`}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(comparison.reviews[0].criteriaSnapshot || []).map((criterion: any) => (
                    <tr key={criterion.id} className="border-b align-top">
                      <td className="py-3 pr-3 font-medium">{criterion.title}</td>
                      {comparison.reviews.map((review: any) => {
                        const result = review.result?.criteria?.find((item: any) => item.criterionId === criterion.id);
                        return (
                          <td key={review.id} className="px-3 py-3">
                            <Badge variant="outline">{(result?.status || "not evidenced").replace(/_/g, " ")}</Badge>
                            {result?.evidence?.[0]?.excerpt && <p className="mt-2 text-xs text-muted-foreground">“{result.evidence[0].excerpt}”</p>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={shareLinkDialogOpen} onOpenChange={(open) => {
        setShareLinkDialogOpen(open);
        if (!open) {
          setGeneratedManagerLink(null);
          setSelectedStakeholderId(pass?.hiringManagerId ? String(pass.hiringManagerId) : "");
          setGeneratedCandidateLink(null);
          setSelectedCandidateForLink("");
        }
      }}>
        <DialogContent className="rounded-2xl sm:max-w-lg" data-testid="share-links-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5" strokeWidth={2} />
              Share Links
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4" strokeWidth={2} />
                Hiring Stakeholder Pass
              </h3>
              <p className="text-sm text-muted-foreground">
                Select a named active stakeholder. Every issued Pass has the same scoped vacancy-level actions.
              </p>
              {generatedManagerLink ? (
                <div className="flex items-center gap-2">
                  <Input 
                    value={generatedManagerLink} 
                    readOnly 
                    className="rounded-xl text-sm"
                    data-testid="input-manager-link"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="rounded-xl shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedManagerLink);
                      toast({ title: "Link copied!" });
                    }}
                    data-testid="button-copy-manager-link"
                  >
                    <Copy className="w-4 h-4" strokeWidth={2} />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="rounded-xl shrink-0"
                    onClick={() => window.open(generatedManagerLink, '_blank')}
                    data-testid="button-open-manager-link"
                  >
                    <ExternalLink className="w-4 h-4" strokeWidth={2} />
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                <Select value={selectedStakeholderId} onValueChange={setSelectedStakeholderId}>
                  <SelectTrigger data-testid="select-stakeholder"><SelectValue placeholder="Select stakeholder" /></SelectTrigger>
                  <SelectContent>{stakeholders?.filter((stakeholder) => stakeholder.isActive).map((stakeholder) => <SelectItem key={stakeholder.id} value={String(stakeholder.id)}>{stakeholder.name} — {stakeholder.jobTitle}</SelectItem>)}</SelectContent>
                </Select>
                <Button
                  variant="outline"
                  className="rounded-xl gap-2"
                  onClick={() => createManagerLinkMutation.mutate()}
                  disabled={createManagerLinkMutation.isPending || !selectedStakeholderId}
                  data-testid="button-generate-manager-link"
                >
                  {createManagerLinkMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LinkIcon className="w-4 h-4" strokeWidth={2} />
                  )}
                  Generate Stakeholder Pass
                </Button>
                </div>
              )}
            </div>

            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Briefcase className="w-4 h-4" strokeWidth={2} />
                Candidate Portal Link
              </h3>
              <p className="text-sm text-muted-foreground">
                Generate a link for a candidate to track their application status.
              </p>
              <Select 
                value={selectedCandidateForLink} 
                onValueChange={setSelectedCandidateForLink}
              >
                <SelectTrigger className="rounded-xl" data-testid="select-candidate-for-link">
                  <SelectValue placeholder="Select a candidate..." />
                </SelectTrigger>
                <SelectContent>
                  {pipeline && Object.values(pipeline).flat().map((pc) => (
                    <SelectItem key={pc.id} value={String(pc.id)}>
                      {pc.candidate?.name} ({pc.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {generatedCandidateLink ? (
                <div className="flex items-center gap-2">
                  <Input 
                    value={generatedCandidateLink} 
                    readOnly 
                    className="rounded-xl text-sm"
                    data-testid="input-candidate-link"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="rounded-xl shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedCandidateLink);
                      toast({ title: "Link copied!" });
                    }}
                    data-testid="button-copy-candidate-link"
                  >
                    <Copy className="w-4 h-4" strokeWidth={2} />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="rounded-xl shrink-0"
                    onClick={() => window.open(generatedCandidateLink, '_blank')}
                    data-testid="button-open-candidate-link"
                  >
                    <ExternalLink className="w-4 h-4" strokeWidth={2} />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="rounded-xl gap-2"
                  onClick={() => {
                    if (selectedCandidateForLink) {
                      createCandidateLinkMutation.mutate(parseInt(selectedCandidateForLink));
                    }
                  }}
                  disabled={!selectedCandidateForLink || createCandidateLinkMutation.isPending}
                  data-testid="button-generate-candidate-link"
                >
                  {createCandidateLinkMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LinkIcon className="w-4 h-4" strokeWidth={2} />
                  )}
                  Generate Candidate Link
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
