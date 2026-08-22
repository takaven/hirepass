import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Plus,
  Search,
  FileText,
  MapPin,
  Users,
  Clock,
  MoreHorizontal,
  Trash2,
  Edit,
  Eye,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Pass } from "@shared/schema";

export default function Passes() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();

  const { data: passes, isLoading } = useQuery<Pass[]>({
    queryKey: ["/api/passes"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/passes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/passes"] });
      toast({ title: "Pass deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete pass", variant: "destructive" });
    },
  });

  const filteredPasses = passes?.filter((pass) => {
    const matchesSearch = 
      pass.positionTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pass.passId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pass.department.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || pass.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getDaysInStatus = (statusChangedAt: Date | null) => {
    if (!statusChangedAt) return 0;
    const diff = Date.now() - new Date(statusChangedAt).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Recruitment Passes</h1>
          <p className="text-muted-foreground mt-1">
            Manage all recruitment requisitions and job openings
          </p>
        </div>
        <Link href="/passes/new">
          <Button className="rounded-xl gap-2" data-testid="button-new-pass">
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            New Pass
          </Button>
        </Link>
      </div>

      <GlassCard className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            <Input
              placeholder="Search passes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl"
              data-testid="input-search-passes"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48 rounded-xl" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="awaiting_jd_approval">Awaiting JD Approval</SelectItem>
              <SelectItem value="sourcing">Sourcing</SelectItem>
              <SelectItem value="screening">Screening</SelectItem>
              <SelectItem value="interviewing">Interviewing</SelectItem>
              <SelectItem value="decision">Decision</SelectItem>
              <SelectItem value="offer_pending">Offer Pending</SelectItem>
              <SelectItem value="closed_hired">Closed - Hired</SelectItem>
              <SelectItem value="closed_cancelled">Closed - Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </GlassCard>

      {isLoading ? (
        <div className="grid gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : filteredPasses?.length ? (
        <div className="grid gap-4">
          {filteredPasses.map((pass) => (
            <GlassCard 
              key={pass.id} 
              className="p-6 hover-elevate cursor-pointer"
              data-testid={`pass-card-${pass.id}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className="p-3 rounded-xl bg-primary/10">
                    <FileText className="w-6 h-6 text-primary" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-2">
                      <Link href={`/passes/${pass.id}`}>
                        <h3 className="font-semibold text-lg hover:text-primary transition-colors">
                          {pass.positionTitle}
                        </h3>
                      </Link>
                      <span className="text-sm text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded">
                        {pass.passId}
                      </span>
                      <StatusBadge status={pass.status as any} />
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" strokeWidth={1.5} />
                        {pass.location}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" strokeWidth={1.5} />
                        {pass.headcount} {pass.headcount === 1 ? 'position' : 'positions'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
                        {getDaysInStatus(pass.statusChangedAt)} days in status
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-sm">
                      <span className="text-muted-foreground">
                        {pass.department} - {pass.employmentType}
                      </span>
                      {pass.salaryRangeMin && pass.salaryRangeMax && (
                        <span className="text-muted-foreground">
                          {pass.salaryCurrency} {pass.salaryRangeMin.toLocaleString()} - {pass.salaryRangeMax.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-xl" data-testid={`pass-menu-${pass.id}`}>
                      <MoreHorizontal className="w-5 h-5" strokeWidth={1.5} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl">
                    <Link href={`/passes/${pass.id}`}>
                      <DropdownMenuItem className="gap-2 rounded-lg cursor-pointer">
                        <Eye className="w-4 h-4" strokeWidth={1.5} />
                        View Details
                      </DropdownMenuItem>
                    </Link>
                    <Link href={`/passes/${pass.id}/candidates`}>
                      <DropdownMenuItem className="gap-2 rounded-lg cursor-pointer" data-testid={`pass-pipeline-${pass.id}`}>
                        <Users className="w-4 h-4" strokeWidth={1.5} />
                        Candidate Pipeline
                      </DropdownMenuItem>
                    </Link>
                    <Link href={`/passes/${pass.id}/edit`}>
                      <DropdownMenuItem className="gap-2 rounded-lg cursor-pointer">
                        <Edit className="w-4 h-4" strokeWidth={1.5} />
                        Edit
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuItem 
                      className="gap-2 rounded-lg cursor-pointer text-destructive"
                      onClick={() => deleteMutation.mutate(pass.id)}
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </GlassCard>
          ))}
        </div>
      ) : (
        <GlassCard className="p-12 text-center">
          <FileText className="w-16 h-16 mx-auto text-primary/30" strokeWidth={1} />
          <h3 className="mt-4 text-lg font-medium">No recruitment passes found</h3>
          <p className="text-muted-foreground mt-2">
            {searchQuery || statusFilter !== "all" 
              ? "Try adjusting your search or filters" 
              : "Create your first recruitment pass to get started"}
          </p>
          {!searchQuery && statusFilter === "all" && (
            <Link href="/passes/new">
              <Button className="mt-6 rounded-xl gap-2">
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                Create Pass
              </Button>
            </Link>
          )}
        </GlassCard>
      )}
    </div>
  );
}
