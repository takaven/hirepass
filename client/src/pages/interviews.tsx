import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Search,
  Plus,
  Calendar,
  Clock,
  Video,
  MapPin,
  MoreVertical,
  Trash2,
  CheckCircle,
  XCircle,
  Users,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { StageBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { Interview } from "@shared/schema";

export default function Interviews() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [interviewToDelete, setInterviewToDelete] = useState<Interview | null>(null);
  const { toast } = useToast();

  const { data: interviews, isLoading } = useQuery<Interview[]>({
    queryKey: ["/api/interviews"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/interviews/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      toast({
        title: "Interview deleted",
        description: "The interview has been removed.",
      });
      setDeleteDialogOpen(false);
      setInterviewToDelete(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete interview.",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/interviews/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      toast({
        title: "Interview updated",
        description: "The interview status has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update interview.",
        variant: "destructive",
      });
    },
  });

  const filteredInterviews = interviews?.filter((interview) => {
    const matchesSearch = 
      interview.roundName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      interview.location?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || interview.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const today = new Date().toISOString().split('T')[0];
  const upcomingInterviews = filteredInterviews?.filter(
    (i) => i.interviewDate >= today && i.status === "scheduled"
  );
  const pastInterviews = filteredInterviews?.filter(
    (i) => i.interviewDate < today || i.status !== "scheduled"
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const handleDelete = (interview: Interview) => {
    setInterviewToDelete(interview);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Interviews</h1>
          <p className="text-muted-foreground mt-1">
            Schedule and manage candidate interviews
          </p>
        </div>
        <Link href="/interviews/new">
          <Button className="rounded-xl gap-2" data-testid="button-schedule-interview">
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            Schedule Interview
          </Button>
        </Link>
      </div>

      <GlassCard className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            <Input
              placeholder="Search interviews..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl"
              data-testid="input-search-interviews"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 rounded-xl" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </GlassCard>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : filteredInterviews?.length ? (
        <div className="space-y-8">
          {upcomingInterviews && upcomingInterviews.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" strokeWidth={1.5} />
                Upcoming Interviews
              </h2>
              <div className="space-y-3">
                {upcomingInterviews.map((interview) => (
                  <GlassCard 
                    key={interview.id} 
                    variant="elevated"
                    className="p-5"
                    data-testid={`card-interview-${interview.id}`}
                  >
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-primary/10">
                          <Calendar className="w-6 h-6 text-primary" strokeWidth={1.5} />
                        </div>
                        <div>
                          <h3 className="font-semibold">
                            {interview.roundName || `Round ${interview.roundNumber}`}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {interview.duration} minutes - {interview.format}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 flex-wrap">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                          <span>{formatDate(interview.interviewDate)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                          <span>{interview.startTime} - {interview.endTime}</span>
                        </div>
                        {interview.meetingLink && (
                          <div className="flex items-center gap-2 text-sm text-primary">
                            <Video className="w-4 h-4" strokeWidth={1.5} />
                            <span>Video Call</span>
                          </div>
                        )}
                        {interview.location && !interview.meetingLink && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="w-4 h-4" strokeWidth={1.5} />
                            <span>{interview.location}</span>
                          </div>
                        )}
                        <StageBadge stage={interview.status || "scheduled"} />
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="rounded-xl">
                              <MoreVertical className="w-4 h-4" strokeWidth={1.5} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl">
                            <DropdownMenuItem 
                              onClick={() => updateStatusMutation.mutate({ id: interview.id, status: "completed" })}
                            >
                              <CheckCircle className="w-4 h-4 mr-2 text-primary" strokeWidth={1.5} />
                              Mark Completed
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => updateStatusMutation.mutate({ id: interview.id, status: "cancelled" })}
                            >
                              <XCircle className="w-4 h-4 mr-2 text-muted-foreground" strokeWidth={1.5} />
                              Cancel
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => handleDelete(interview)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {pastInterviews && pastInterviews.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-muted-foreground">
                <Clock className="w-5 h-5" strokeWidth={1.5} />
                Past Interviews
              </h2>
              <div className="space-y-3">
                {pastInterviews.map((interview) => (
                  <GlassCard 
                    key={interview.id} 
                    variant="subtle"
                    className="p-5 opacity-75"
                    data-testid={`card-past-interview-${interview.id}`}
                  >
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-4">
                        <div className="p-2.5 rounded-xl bg-muted">
                          <Calendar className="w-5 h-5 text-muted-foreground" strokeWidth={1.5} />
                        </div>
                        <div>
                          <h3 className="font-medium">
                            {interview.roundName || `Round ${interview.roundNumber}`}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {interview.duration} minutes
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 flex-wrap">
                        <span className="text-sm text-muted-foreground">
                          {formatDate(interview.interviewDate)} at {interview.startTime}
                        </span>
                        <Badge 
                          variant="outline"
                          className={`rounded-full ${
                            interview.status === "completed" 
                              ? "border-green-400 text-green-600" 
                              : interview.status === "cancelled" 
                                ? "border-red-400 text-red-600" 
                                : ""
                          }`}
                        >
                          {interview.status === "completed" ? "Completed" : 
                           interview.status === "cancelled" ? "Cancelled" : interview.status}
                        </Badge>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <GlassCard className="py-16">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="p-4 rounded-3xl bg-primary/10 mb-4">
              <Calendar className="w-12 h-12 text-primary" strokeWidth={1} />
            </div>
            <h3 className="text-lg font-semibold">No interviews scheduled</h3>
            <p className="text-muted-foreground mt-1 max-w-sm">
              Schedule your first interview with a candidate
            </p>
            <Link href="/interviews/new">
              <Button className="mt-6 rounded-xl gap-2" data-testid="button-schedule-first">
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                Schedule Interview
              </Button>
            </Link>
          </div>
        </GlassCard>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="glass-card border-0 rounded-3xl">
          <DialogHeader>
            <DialogTitle>Delete Interview</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this interview? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setDeleteDialogOpen(false)}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => interviewToDelete && deleteMutation.mutate(interviewToDelete.id)}
              disabled={deleteMutation.isPending}
              className="rounded-xl"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
