import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Briefcase,
  Calendar,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  UserPlus,
  FileText,
  ChevronRight,
} from "lucide-react";
import { GlassCard, MetricCard } from "@/components/glass-card";
import { StatusBadge, StageBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import type { Candidate, Pass, Interview } from "@shared/schema";

interface DashboardStats {
  totalCandidates: number;
  activePasses: number;
  scheduledInterviews: number;
  hiredThisMonth: number;
}

interface PipelineCounts {
  new: number;
  screening: number;
  shortlisted: number;
  interview: number;
  offer: number;
  hired: number;
  rejected: number;
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/analytics/stats"],
  });

  const { data: pipelineCounts } = useQuery<PipelineCounts>({
    queryKey: ["/api/analytics/pipeline"],
  });

  const { data: candidates, isLoading: candidatesLoading } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates"],
  });

  const { data: passes, isLoading: passesLoading } = useQuery<Pass[]>({
    queryKey: ["/api/passes"],
  });

  const { data: interviews, isLoading: interviewsLoading } = useQuery<Interview[]>({
    queryKey: ["/api/interviews/upcoming"],
  });

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-3 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-[11px]">
            Recruitment pass overview
          </p>
        </div>
        <div className="flex gap-1.5">
          <Link href="/passes/new">
            <Button size="sm" variant="outline" className="rounded-xl gap-1 text-[11px] h-7 px-2.5" data-testid="button-new-pass">
              <FileText className="w-3 h-3" strokeWidth={2} />
              New Pass
            </Button>
          </Link>
          <Link href="/candidates/new">
            <Button size="sm" className="rounded-xl gap-1 text-[11px] h-7 px-2.5" data-testid="button-add-candidate">
              <UserPlus className="w-3 h-3" strokeWidth={2} />
              Add Candidate
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid - Compact */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <MetricCard
            title="Total Candidates"
            value={stats?.totalCandidates ?? 0}
            icon={<Users className="w-4 h-4 text-primary" strokeWidth={2} />}
          />
          <MetricCard
            title="Active Passes"
            value={stats?.activePasses ?? 0}
            icon={<Briefcase className="w-4 h-4 text-primary" strokeWidth={2} />}
          />
          <MetricCard
            title="Interviews"
            value={stats?.scheduledInterviews ?? 0}
            icon={<Calendar className="w-4 h-4 text-primary" strokeWidth={2} />}
          />
          <MetricCard
            title="Hired"
            value={stats?.hiredThisMonth ?? 0}
            icon={<TrendingUp className="w-4 h-4 text-primary" strokeWidth={2} />}
          />
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {/* Recent Candidates */}
        <GlassCard className="p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold">Recent Candidates</h2>
            <Link href="/candidates">
              <Button variant="ghost" size="sm" className="text-primary rounded-lg text-[11px] h-6 px-2 gap-0.5" data-testid="link-view-all-candidates">
                View all
                <ChevronRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
          
          {candidatesLoading ? (
            <div className="space-y-1.5">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-xl" />
              ))}
            </div>
          ) : candidates?.length ? (
            <div className="space-y-1.5">
              {candidates.slice(0, 3).map((candidate) => (
                <Link key={candidate.id} href={`/candidates/${candidate.id}`}>
                  <div 
                    className="flex items-center gap-2 p-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
                    data-testid={`candidate-row-${candidate.id}`}
                  >
                    <Avatar className="h-7 w-7 border border-primary/30 bg-white dark:bg-black">
                      <AvatarFallback className="bg-transparent text-primary text-[10px] font-semibold">
                        {getInitials(candidate.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate leading-tight">
                        {candidate.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate leading-tight">
                        {candidate.currentTitle || candidate.email || 'No details'}
                      </p>
                    </div>
                    {candidate.source && (
                      <span className="text-[9px] text-muted-foreground bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded-md flex-shrink-0">
                        {candidate.source}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-6 text-center">
              <Users className="w-4 h-4 text-primary/40 mr-1.5" strokeWidth={2} />
              <span className="text-[11px] text-muted-foreground">No candidates yet</span>
            </div>
          )}
        </GlassCard>

        {/* Active Passes */}
        <GlassCard className="p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold">Active Passes</h2>
            <Link href="/passes">
              <Button variant="ghost" size="sm" className="text-primary rounded-lg text-[11px] h-6 px-2 gap-0.5" data-testid="link-view-all-passes">
                View all
                <ChevronRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
          
          {passesLoading ? (
            <div className="space-y-1.5">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-xl" />
              ))}
            </div>
          ) : passes?.length ? (
            <div className="space-y-1.5">
              {passes.slice(0, 3).map((pass) => (
                <Link key={pass.id} href={`/passes/${pass.id}`}>
                  <div 
                    className="flex items-center gap-2 p-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
                    data-testid={`pass-row-${pass.id}`}
                  >
                    <div className="p-1.5 rounded-lg bg-primary/10 flex-shrink-0">
                      <FileText className="w-3 h-3 text-primary" strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate leading-tight">
                        {pass.positionTitle}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate leading-tight">
                        {pass.passId} - {pass.department}
                      </p>
                    </div>
                    <StatusBadge status={pass.status as any} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-6 text-center">
              <FileText className="w-4 h-4 text-primary/40 mr-1.5" strokeWidth={2} />
              <span className="text-[11px] text-muted-foreground">No passes yet</span>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Upcoming Interviews */}
      <GlassCard className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold">Upcoming Interviews</h2>
          <Link href="/interviews">
            <Button variant="ghost" size="sm" className="text-primary rounded-lg text-[11px] h-6 px-2 gap-0.5" data-testid="link-view-all-interviews">
              View all
              <ChevronRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
        
        {interviewsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-xl" />
            ))}
          </div>
        ) : interviews?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
            {interviews.slice(0, 3).map((interview) => (
              <div 
                key={interview.id}
                className="flex items-center gap-2 p-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.02]"
                data-testid={`interview-row-${interview.id}`}
              >
                <div className="p-1.5 rounded-lg bg-primary/10 flex-shrink-0">
                  <Clock className="w-3 h-3 text-primary" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium truncate leading-tight">
                    {interview.roundName || `Round ${interview.roundNumber}`}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate leading-tight">
                    {interview.interviewDate}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-6 text-center">
            <Calendar className="w-4 h-4 text-primary/40 mr-1.5" strokeWidth={2} />
            <span className="text-[11px] text-muted-foreground">No interviews scheduled</span>
          </div>
        )}
      </GlassCard>

      {/* Pipeline Overview */}
      <GlassCard className="p-3">
        <h2 className="text-xs font-semibold mb-2">Pipeline Overview</h2>
        <div className="grid grid-cols-7 gap-1.5">
          {[
            { status: "new", label: "New", icon: UserPlus },
            { status: "screening", label: "Screen", icon: Users },
            { status: "shortlisted", label: "Short", icon: CheckCircle2 },
            { status: "interview", label: "Interview", icon: Calendar },
            { status: "offer", label: "Offer", icon: TrendingUp },
            { status: "hired", label: "Hired", icon: CheckCircle2 },
            { status: "rejected", label: "Reject", icon: XCircle },
          ].map((item) => (
            <div 
              key={item.status}
              className="text-center p-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.02]"
              data-testid={`pipeline-${item.status}`}
            >
              <item.icon className="w-3.5 h-3.5 mx-auto mb-1 text-primary/60" strokeWidth={2} />
              <p className="text-base font-semibold text-foreground">
                {pipelineCounts?.[item.status as keyof PipelineCounts] ?? 0}
              </p>
              <p className="text-[9px] text-muted-foreground leading-none">{item.label}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

