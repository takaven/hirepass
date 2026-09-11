import { useQuery } from "@tanstack/react-query";
import { Briefcase, Calendar, Clock, Users } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Candidate, Interview, Pass } from "@shared/schema";

function Metric({ label, value, detail, icon: Icon }: { label: string; value: number | string; detail?: string; icon: typeof Briefcase }) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-[#F4F6F8] p-3 text-[#42494D]"><Icon className="h-5 w-5" /></div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold text-[#20242B]">{value}</p>
          {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
        </div>
      </div>
    </GlassCard>
  );
}

export default function Analytics() {
  const { data: passes, isLoading: passesLoading } = useQuery<Pass[]>({ queryKey: ["/api/passes"] });
  const { data: candidates, isLoading: candidatesLoading } = useQuery<Candidate[]>({ queryKey: ["/api/candidates"] });
  const { data: interviews, isLoading: interviewsLoading } = useQuery<Interview[]>({ queryKey: ["/api/interviews"] });

  const isLoading = passesLoading || candidatesLoading || interviewsLoading;
  const openVacancies = passes?.filter((pass) => ["active", "open", "in_progress", "screening", "sourcing"].includes(pass.status || "")).length || 0;
  const scheduledInterviews = interviews?.filter((interview) => interview.status === "scheduled").length || 0;
  const completedVacancies = passes?.filter((pass) => pass.status === "filled").length || 0;
  const departments = Array.from(new Set((passes || []).map((pass) => pass.department).filter(Boolean)));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((index) => <Skeleton key={index} className="h-32 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">A simple operational view of current hiring activity.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Metric label="Open vacancies" value={openVacancies} icon={Briefcase} />
        <Metric label="Candidates" value={candidates?.length || 0} icon={Users} />
        <Metric label="Scheduled interviews" value={scheduledInterviews} icon={Calendar} />
        <Metric label="Time to fill" value="—" detail={completedVacancies > 0 ? "Not enough completed timing data" : "No completed hire timing yet"} icon={Clock} />
      </div>

      <GlassCard className="p-5">
        <h2 className="text-lg font-semibold text-[#20242B]">Vacancy status</h2>
        {passes?.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {["active", "open", "in_progress", "on_hold", "filled", "cancelled", "draft"].map((status) => {
              const count = passes.filter((pass) => pass.status === status).length;
              if (!count) return null;
              return (
                <div key={status} className="flex items-center justify-between rounded-xl border border-border bg-[#F4F6F8] px-4 py-3">
                  <span className="text-sm capitalize text-[#42494D]">{status.replace(/_/g, " ")}</span>
                  <span className="text-sm font-semibold text-[#20242B]">{count}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No vacancies yet.</p>
        )}
      </GlassCard>

      {departments.length > 1 && (
        <GlassCard className="p-5">
          <h2 className="text-lg font-semibold text-[#20242B]">Departments with vacancies</h2>
          <p className="mt-2 text-sm text-muted-foreground">{departments.join(", ")}</p>
        </GlassCard>
      )}
    </div>
  );
}
