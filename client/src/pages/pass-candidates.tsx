import { useState, useCallback, useMemo } from "react";
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
import type { Pass, Candidate, PassPosition } from "@shared/schema";

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

type PipelineData = Record<string, PassCandidate[]>;

const STAGES = [
  { key: "new", label: "New", color: "bg-gray-500" },
  { key: "screening", label: "Screening", color: "bg-blue-500" },
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
  const [selectedCandidateForLink, setSelectedCandidateForLink] = useState<string>("");
  const [generatedCandidateLink, setGeneratedCandidateLink] = useState<string | null>(null);

  const { data: pass, isLoading: passLoading } = useQuery<Pass>({
    queryKey: ["/api/passes", passId],
    enabled: !!passId,
  });

  const { data: pipeline, isLoading: pipelineLoading } = useQuery<PipelineData>({
    queryKey: ["/api/passes", passId, "candidates", "pipeline"],
    enabled: !!passId,
  });

  const { data: positions, isLoading: positionsLoading } = useQuery<PassPosition[]>({
    queryKey: ["/api/passes", passId, "positions"],
    enabled: !!passId,
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
        linkType: "manager"
      });
      return res.json();
    },
    onSuccess: (data) => {
      const link = `${window.location.origin}/manager-pass/${data.token}`;
      setGeneratedManagerLink(link);
      toast({ title: "Manager link created!" });
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
            Back to Passes
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
                  {STAGES.map(stage => (
                    <SelectItem key={stage.key} value={stage.key}>
                      {stage.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        {STAGES.map(stage => {
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
                      {STAGES.map(stage => (
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
                  Add to Pass
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={shareLinkDialogOpen} onOpenChange={(open) => {
        setShareLinkDialogOpen(open);
        if (!open) {
          setGeneratedManagerLink(null);
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
                Manager Portal Link
              </h3>
              <p className="text-sm text-muted-foreground">
                Share this link with hiring managers to review candidates and make decisions.
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
                <Button
                  variant="outline"
                  className="rounded-xl gap-2"
                  onClick={() => createManagerLinkMutation.mutate()}
                  disabled={createManagerLinkMutation.isPending}
                  data-testid="button-generate-manager-link"
                >
                  {createManagerLinkMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LinkIcon className="w-4 h-4" strokeWidth={2} />
                  )}
                  Generate Manager Link
                </Button>
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
