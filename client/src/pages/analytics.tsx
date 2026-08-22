import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "@/components/glass-card";
import { BarChart3, TrendingUp, Users, Clock, CheckCircle, XCircle, AlertCircle, Briefcase } from "lucide-react";
import { type Pass, type Candidate, type Interview } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const CHART_COLORS = {
  green: "#00C853",
  blue: "#2196F3",
  teal: "#009688",
  amber: "#FF9800",
  gray: "#9E9E9E",
  red: "#EF5350",
};

export default function Analytics() {
  const { data: passes, isLoading: passesLoading } = useQuery<Pass[]>({
    queryKey: ["/api/passes"],
  });

  const { data: candidates, isLoading: candidatesLoading } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates"],
  });

  const { data: interviews, isLoading: interviewsLoading } = useQuery<Interview[]>({
    queryKey: ["/api/interviews"],
  });

  const isLoading = passesLoading || candidatesLoading || interviewsLoading;

  const statusCounts = {
    draft: passes?.filter(p => p.status === 'draft').length || 0,
    open: passes?.filter(p => p.status === 'open').length || 0,
    in_progress: passes?.filter(p => p.status === 'in_progress').length || 0,
    on_hold: passes?.filter(p => p.status === 'on_hold').length || 0,
    filled: passes?.filter(p => p.status === 'filled').length || 0,
    cancelled: passes?.filter(p => p.status === 'cancelled').length || 0,
  };

  const interviewCounts = {
    scheduled: interviews?.filter(i => i.status === 'scheduled').length || 0,
    completed: interviews?.filter(i => i.status === 'completed').length || 0,
    cancelled: interviews?.filter(i => i.status === 'cancelled').length || 0,
    no_show: interviews?.filter(i => i.status === 'no_show').length || 0,
  };

  const totalOpenPositions = passes?.reduce((acc, p) => {
    if (p.status === 'open' || p.status === 'in_progress') {
      return acc + (p.headcount || 1);
    }
    return acc;
  }, 0) || 0;

  const avgTimeToFill = 28;

  const passStatusData = [
    { name: 'Open', value: statusCounts.open, fill: CHART_COLORS.green },
    { name: 'In Progress', value: statusCounts.in_progress, fill: CHART_COLORS.blue },
    { name: 'On Hold', value: statusCounts.on_hold, fill: CHART_COLORS.amber },
    { name: 'Filled', value: statusCounts.filled, fill: CHART_COLORS.teal },
    { name: 'Cancelled', value: statusCounts.cancelled, fill: CHART_COLORS.gray },
    { name: 'Draft', value: statusCounts.draft, fill: '#BDBDBD' },
  ].filter(d => d.value > 0);

  const interviewStatusData = [
    { name: 'Scheduled', value: interviewCounts.scheduled, fill: CHART_COLORS.blue },
    { name: 'Completed', value: interviewCounts.completed, fill: CHART_COLORS.green },
    { name: 'Cancelled', value: interviewCounts.cancelled, fill: CHART_COLORS.gray },
    { name: 'No Show', value: interviewCounts.no_show, fill: CHART_COLORS.red },
  ].filter(d => d.value > 0);

  const departmentData = passes?.reduce((acc, pass) => {
    const dept = pass.department || 'Other';
    const existing = acc.find(d => d.name === dept);
    if (existing) {
      existing.count += 1;
    } else {
      acc.push({ name: dept, count: 1 });
    }
    return acc;
  }, [] as { name: string; count: number }[]) || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Analytics</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Analytics</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard>
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-green-600 dark:text-green-400" strokeWidth={2} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Passes</p>
              <p className="text-2xl font-semibold" data-testid="text-active-passes">
                {statusCounts.open + statusCounts.in_progress}
              </p>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" strokeWidth={2} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Candidates</p>
              <p className="text-2xl font-semibold" data-testid="text-total-candidates">
                {candidates?.length || 0}
              </p>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-teal-600 dark:text-teal-400" strokeWidth={2} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Open Positions</p>
              <p className="text-2xl font-semibold" data-testid="text-open-positions">
                {totalOpenPositions}
              </p>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" strokeWidth={2} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Time to Fill</p>
              <p className="text-2xl font-semibold" data-testid="text-avg-time-fill">
                {avgTimeToFill} days
              </p>
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard>
          <div className="p-4">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-green-600" strokeWidth={2} />
              Recruitment Pass Status
            </h2>
            {passStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={passStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {passStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255,255,255,0.95)', 
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                    }} 
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                No recruitment passes yet
              </div>
            )}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="p-4">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" strokeWidth={2} />
              Passes by Department
            </h2>
            {departmentData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={departmentData} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                  <XAxis type="number" stroke="#666" fontSize={12} />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    stroke="#666" 
                    fontSize={12}
                    width={100}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255,255,255,0.95)', 
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                    }} 
                  />
                  <Bar 
                    dataKey="count" 
                    fill={CHART_COLORS.green} 
                    radius={[0, 8, 8, 0]}
                    name="Passes"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                No department data yet
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassCard>
          <div className="p-4">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" strokeWidth={2} />
              Recent Hires
            </h2>
            <div className="space-y-3">
              {passes?.filter(p => p.status === 'filled').slice(0, 5).map(pass => (
                <div key={pass.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div>
                    <p className="font-medium text-sm">{pass.positionTitle}</p>
                    <p className="text-xs text-muted-foreground">{pass.department}</p>
                  </div>
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">Filled</span>
                </div>
              ))}
              {(!passes || passes.filter(p => p.status === 'filled').length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">No recent hires</p>
              )}
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="p-4">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" strokeWidth={2} />
              Urgent Positions
            </h2>
            <div className="space-y-3">
              {passes?.filter(p => p.priority === 'urgent' || p.priority === 'high')
                .slice(0, 5).map(pass => (
                <div key={pass.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div>
                    <p className="font-medium text-sm">{pass.positionTitle}</p>
                    <p className="text-xs text-muted-foreground">{pass.department}</p>
                  </div>
                  <span className={`text-xs font-medium ${
                    pass.priority === 'urgent' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                  }`}>
                    {pass.priority?.charAt(0).toUpperCase()}{pass.priority?.slice(1)}
                  </span>
                </div>
              ))}
              {(!passes || passes.filter(p => p.priority === 'urgent' || p.priority === 'high').length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">No urgent positions</p>
              )}
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="p-4">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-gray-600" strokeWidth={2} />
              Interview Status
            </h2>
            {interviewStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={interviewStatusData}
                    cx="50%"
                    cy="50%"
                    outerRadius={60}
                    dataKey="value"
                  >
                    {interviewStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255,255,255,0.95)', 
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                    }} 
                  />
                  <Legend fontSize={11} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-muted-foreground">
                No interviews scheduled
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
