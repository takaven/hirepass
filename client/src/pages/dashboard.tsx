import { useQuery } from "@tanstack/react-query";
import { Briefcase, Calendar, CheckCircle, ChevronRight, Clock, FileText, Users } from "lucide-react";
import { Link } from "wouter";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Candidate, Interview, Pass } from "@shared/schema";
import { isOperationallyOpenVacancy } from "@shared/hiring-workflow";

interface DashboardStats {
  totalCandidates: number;
  activePasses: number;
  scheduledInterviews: number;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Date to be confirmed";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date to be confirmed";
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({ queryKey: ["/api/analytics/stats"] });
  const { data: candidates, isLoading: candidatesLoading } = useQuery<Candidate[]>({ queryKey: ["/api/candidates"] });
  const { data: passes, isLoading: passesLoading } = useQuery<Pass[]>({ queryKey: ["/api/passes"] });
  const { data: interviews, isLoading: interviewsLoading } = useQuery<Interview[]>({ queryKey: ["/api/interviews/upcoming"] });

  const loading = statsLoading || candidatesLoading || passesLoading || interviewsLoading;
  const openVacancies = (passes || []).filter((pass) => isOperationallyOpenVacancy(pass.status));
  const interviewItems = (interviews || []).slice(0, 3).map((interview) => ({
    key: `interview-${interview.id}`,
    href: "/interviews",
    title: interview.roundName || `Interview round ${interview.roundNumber || ""}`.trim(),
    detail: `Interview scheduled ${formatDate(interview.interviewDate)}`,
    icon: Calendar,
  }));
  const vacancyItems = openVacancies.slice(0, Math.max(0, 5 - interviewItems.length)).map((pass) => ({
    key: `vacancy-${pass.id}`,
    href: `/vacancies/${pass.id}/candidates`,
    title: pass.positionTitle,
    detail: `${pass.department || "Vacancy"} · review candidates and next actions`,
    icon: Briefcase,
  }));
  const attentionItems = [...interviewItems, ...vacancyItems];

  return (
    <div className="space-y-6 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">What needs your attention</h1>
          <p className="mt-1 text-sm text-muted-foreground">Open hiring work, interviews and next actions in one place.</p>
        </div>
        <Button asChild className="bg-[#20242B] text-white hover:bg-[#42494D]" data-testid="button-new-vacancy">
          <Link href="/vacancies/new"><FileText className="mr-2 h-4 w-4" />New vacancy</Link>
        </Button>
      </div>

      <GlassCard className="p-5">
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, index) => <Skeleton key={index} className="h-16 rounded-2xl" />)}
          </div>
        ) : attentionItems.length ? (
          <div className="space-y-3">
            {attentionItems.map((item) => (
              <Link key={item.key} href={item.href}>
                <div className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-border bg-white p-4 transition-colors hover:bg-[#F4F6F8]" data-testid={`attention-${item.key}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-xl bg-[#01FF22]/10 p-2 text-[#20242B]"><item.icon className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#20242B]">{item.title}</p>
                      <p className="truncate text-sm text-[#68707D]">{item.detail}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#68707D]" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center" data-testid="home-up-to-date">
            <CheckCircle className="mx-auto mb-3 h-9 w-9 text-[#01A31A]" />
            <h2 className="text-lg font-semibold">You're up to date</h2>
            <p className="mt-1 text-sm text-muted-foreground">No hiring action needs attention right now.</p>
          </div>
        )}
      </GlassCard>

      <div className="grid gap-3 sm:grid-cols-3">
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <Briefcase className="h-5 w-5 text-[#42494D]" />
            <div><p className="text-sm text-muted-foreground">Open vacancies</p><p className="text-2xl font-semibold">{stats?.activePasses ?? openVacancies.length}</p></div>
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-[#42494D]" />
            <div><p className="text-sm text-muted-foreground">Candidates</p><p className="text-2xl font-semibold">{stats?.totalCandidates ?? candidates?.length ?? 0}</p></div>
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-[#42494D]" />
            <div><p className="text-sm text-muted-foreground">Upcoming interviews</p><p className="text-2xl font-semibold">{stats?.scheduledInterviews ?? interviews?.length ?? 0}</p></div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
