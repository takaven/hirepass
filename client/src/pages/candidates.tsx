import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Search,
  Filter,
  Plus,
  MoreVertical,
  Mail,
  Phone,
  FileText,
  Trash2,
  Edit,
  Eye,
  Briefcase,
  MapPin,
  Target,
  ExternalLink,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Candidate, Pass, PassCandidate } from "@shared/schema";

interface CandidateWithPasses extends Candidate {
  passCandidates?: (PassCandidate & { pass: Pass })[];
}

export default function Candidates() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [candidateToDelete, setCandidateToDelete] = useState<Candidate | null>(null);
  const { toast } = useToast();

  const { data: candidates, isLoading } = useQuery<CandidateWithPasses[]>({
    queryKey: ["/api/candidates"],
  });

  // Fetch all passes for position filter
  const { data: passes } = useQuery<Pass[]>({
    queryKey: ["/api/passes"],
  });

  const [positionFilter, setPositionFilter] = useState<string>("all");

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/candidates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      toast({
        title: "Candidate deleted",
        description: "The candidate has been removed successfully.",
      });
      setDeleteDialogOpen(false);
      setCandidateToDelete(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete candidate. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const filteredCandidates = candidates?.filter((candidate) => {
    const matchesSearch = 
      candidate.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      candidate.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      candidate.currentTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      candidate.currentCompany?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSource = sourceFilter === "all" || candidate.source === sourceFilter;
    
    const matchesPosition = positionFilter === "all" || 
      candidate.passCandidates?.some(pc => pc.passId?.toString() === positionFilter);
    
    return matchesSearch && matchesSource && matchesPosition;
  });

  const handleDelete = (candidate: Candidate) => {
    setCandidateToDelete(candidate);
    setDeleteDialogOpen(true);
  };

  const uniqueSources = Array.from(new Set(candidates?.map(c => c.source).filter(Boolean))) as string[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Candidates</h1>
          <p className="text-muted-foreground mt-1">
            Manage your candidate pool and talent pipeline
          </p>
        </div>
        <Link href="/candidates/new">
          <Button className="rounded-xl gap-2" data-testid="button-add-candidate">
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            Add Candidate
          </Button>
        </Link>
      </div>

      <GlassCard className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            <Input
              placeholder="Search candidates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl"
              data-testid="input-search-candidates"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <Select value={positionFilter} onValueChange={setPositionFilter}>
              <SelectTrigger className="w-48 rounded-xl" data-testid="select-position-filter">
                <Target className="w-4 h-4 mr-2" strokeWidth={1.5} />
                <SelectValue placeholder="Position" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Positions</SelectItem>
                {passes?.map(pass => (
                  <SelectItem key={pass.id} value={pass.id.toString()}>{pass.positionTitle}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-40 rounded-xl" data-testid="select-source-filter">
                <Filter className="w-4 h-4 mr-2" strokeWidth={1.5} />
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {uniqueSources.map(source => (
                  <SelectItem key={source} value={source}>{source}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </GlassCard>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : filteredCandidates?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCandidates.map((candidate) => (
            <GlassCard 
              key={candidate.id} 
              variant="elevated"
              className="p-5 cursor-pointer hover-elevate"
              onClick={() => setLocation(`/candidates/${candidate.id}`)}
              data-testid={`card-candidate-${candidate.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 border-2 border-white dark:border-gray-800">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {getInitials(candidate.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold">{candidate.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {candidate.currentTitle || "No title"}
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="rounded-xl" data-testid={`button-menu-${candidate.id}`}>
                      <MoreVertical className="w-4 h-4" strokeWidth={1.5} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl">
                    <DropdownMenuItem 
                      onClick={(e) => { e.stopPropagation(); setLocation(`/candidates/${candidate.id}`); }}
                      data-testid={`menu-view-${candidate.id}`}
                    >
                      <Eye className="w-4 h-4 mr-2" strokeWidth={1.5} />
                      View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={(e) => { e.stopPropagation(); setLocation(`/candidates/${candidate.id}/edit`); }}
                      data-testid={`menu-edit-${candidate.id}`}
                    >
                      <Edit className="w-4 h-4 mr-2" strokeWidth={1.5} />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDelete(candidate); }}
                      data-testid={`menu-delete-${candidate.id}`}
                    >
                      <Trash2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-4 space-y-2">
                {candidate.email && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="w-4 h-4" strokeWidth={1.5} />
                    <span className="truncate">{candidate.email}</span>
                  </div>
                )}
                {candidate.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="w-4 h-4" strokeWidth={1.5} />
                    <span>{candidate.phone}</span>
                  </div>
                )}
                {candidate.currentCompany && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Briefcase className="w-4 h-4" strokeWidth={1.5} />
                    <span className="truncate">{candidate.currentCompany}</span>
                  </div>
                )}
                {candidate.currentLocation && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4" strokeWidth={1.5} />
                    <span className="truncate">{candidate.currentLocation}</span>
                  </div>
                )}
              </div>

              {/* Linked Positions */}
              {candidate.passCandidates && candidate.passCandidates.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-3 h-3 text-muted-foreground" strokeWidth={1.5} />
                    <span className="text-xs text-muted-foreground font-medium">Linked Positions</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {candidate.passCandidates.map((pc) => (
                      <Link 
                        key={pc.id} 
                        href={`/passes/${pc.passId}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Badge 
                          variant="outline" 
                          className="text-xs gap-1 cursor-pointer"
                          data-testid={`badge-position-${pc.passId}`}
                        >
                          {pc.pass?.positionTitle || "Position"}
                          <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
                {candidate.experienceYears && (
                  <Badge variant="secondary" className="text-xs">
                    {candidate.experienceYears} years exp
                  </Badge>
                )}
                {candidate.source && (
                  <Badge variant="outline" className="text-xs">
                    {candidate.source}
                  </Badge>
                )}
                {candidate.inTalentPool && (
                  <Badge variant="outline" className="text-xs text-primary border-primary/50">
                    Talent Pool
                  </Badge>
                )}
                {candidate.cvSummary && (
                  <Badge variant="outline" className="text-xs">
                    Profile Summary
                  </Badge>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      ) : (
        <GlassCard className="py-16">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="p-4 rounded-3xl bg-primary/10 mb-4">
              <FileText className="w-12 h-12 text-primary" strokeWidth={1} />
            </div>
            <h3 className="text-lg font-semibold">No candidates found</h3>
            <p className="text-muted-foreground mt-1 max-w-sm">
              {searchQuery || sourceFilter !== "all" 
                ? "Try adjusting your search or filters"
                : "Add your first candidate to get started with recruitment tracking"
              }
            </p>
            {!searchQuery && sourceFilter === "all" && (
              <Link href="/candidates/new">
                <Button className="mt-6 rounded-xl gap-2" data-testid="button-add-first-candidate">
                  <Plus className="w-4 h-4" strokeWidth={1.5} />
                  Add First Candidate
                </Button>
              </Link>
            )}
          </div>
        </GlassCard>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="glass-card border-0 rounded-3xl">
          <DialogHeader>
            <DialogTitle>Delete Candidate</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {candidateToDelete?.name}? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setDeleteDialogOpen(false)}
              className="rounded-xl"
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => candidateToDelete && deleteMutation.mutate(candidateToDelete.id)}
              disabled={deleteMutation.isPending}
              className="rounded-xl"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
