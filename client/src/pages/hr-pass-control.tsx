import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, Clock, ExternalLink, RefreshCcw, ShieldOff, UserCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type WaitingOn = "candidate" | "manager" | "hr" | "upcoming_event" | "no_action" | "completed" | "expired_revoked";

type PassControlCandidate = {
  id: number;
  candidateName: string;
  status: string;
  waitingOn: WaitingOn;
  stateLabel: string;
  nextAction: string;
  isStalled: boolean;
  activeCandidateLink: { id: number; token: string; expiresAt?: string | null } | null;
  latestCandidateLink: { id: number; token: string; expiresAt?: string | null; isActive?: boolean } | null;
};

type PassControlItem = {
  passId: number;
  readablePassId: string | null;
  title: string;
  department: string | null;
  managerName: string | null;
  waitingOn: WaitingOn;
  priority: "attention" | "monitor" | "complete";
  isStalled: boolean;
  status: string;
  nextAction: string;
  candidateActions: number;
  managerActions: number;
  upcomingEvents: number;
  expiredOrRevokedLinks: number;
  activeManagerLink: { id: number; token: string; expiresAt?: string | null } | null;
  latestManagerLink: { id: number; token: string; expiresAt?: string | null; isActive?: boolean } | null;
  candidates: PassControlCandidate[];
  recentActivity: Array<{ id: number; action: string; actorName?: string | null; createdAt?: string | null; details?: unknown }>;
};

const waitingLabels: Record<WaitingOn, string> = {
  candidate: "Waiting on candidate",
  manager: "Waiting on manager",
  hr: "Waiting on HR",
  upcoming_event: "Upcoming event",
  no_action: "No action",
  completed: "Completed",
  expired_revoked: "Expired or revoked",
};

const waitingStyles: Record<WaitingOn, string> = {
  candidate: "bg-amber-50 text-amber-700 border-amber-200",
  manager: "bg-blue-50 text-blue-700 border-blue-200",
  hr: "bg-rose-50 text-rose-700 border-rose-200",
  upcoming_event: "bg-cyan-50 text-cyan-700 border-cyan-200",
  no_action: "bg-slate-50 text-slate-700 border-slate-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expired_revoked: "bg-zinc-100 text-zinc-700 border-zinc-300",
};

function passUrl(type: "candidate" | "manager", token: string) {
  return type === "candidate" ? `/candidate-pass/${token}` : `/manager-pass/${token}`;
}

export default function HrPassControl() {
  const { toast } = useToast();
  const [extendDate, setExtendDate] = useState(() => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const { data, isLoading } = useQuery<{ items: PassControlItem[] }>({
    queryKey: ["/api/hr-pass-control"],
    refetchInterval: 30000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/hr-pass-control"] });
  const actionMutation = useMutation({
    mutationFn: async ({ method, url, body }: { method: string; url: string; body?: unknown }) => {
      const response = await apiRequest(method, url, body);
      return response.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Pass control updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to update Pass control", description: error.message, variant: "destructive" });
    },
  });

  const items = data?.items || [];
  const counts = useMemo(() => ({
    candidate: items.filter((item) => item.waitingOn === "candidate").length,
    manager: items.filter((item) => item.waitingOn === "manager").length,
    stalled: items.filter((item) => item.isStalled).length,
    expired: items.filter((item) => item.expiredOrRevokedLinks > 0).length,
  }), [items]);

  const extendExpiry = new Date(`${extendDate}T23:59:00.000Z`).toISOString();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">HR Pass Control</p>
          <h1 className="text-2xl font-semibold tracking-tight">Live action workspace</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            See who is waiting on whom, refresh controlled links, record nudges and inspect recent Pass activity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input className="h-9 w-40" type="date" value={extendDate} onChange={(event) => setExtendDate(event.target.value)} aria-label="Extend expiry date" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Candidate actions</p><p className="text-2xl font-semibold">{counts.candidate}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Manager decisions</p><p className="text-2xl font-semibold">{counts.manager}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Stalled Passes</p><p className="text-2xl font-semibold">{counts.stalled}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Expired / revoked</p><p className="text-2xl font-semibold">{counts.expired}</p></CardContent></Card>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading Pass controls...</CardContent></Card>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">No recruitment Passes require attention.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.passId} className={item.priority === "attention" ? "border-amber-200" : ""}>
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{item.readablePassId} · {item.department || "No department"} · {item.managerName || "No manager"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={waitingStyles[item.waitingOn]}>{waitingLabels[item.waitingOn]}</Badge>
                    {item.isStalled && <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700"><AlertTriangle className="mr-1 h-3 w-3" />Stalled</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
                  <div className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">Next Pass action</p>
                        <p className="text-sm text-muted-foreground">{item.nextAction}</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => actionMutation.mutate({ method: "POST", url: `/api/hr-pass-control/passes/${item.passId}/manager-link` })}
                        >
                          <RefreshCcw className="mr-1 h-3.5 w-3.5" /> Issue Manager Pass
                        </Button>
                        {item.activeManagerLink && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => window.open(passUrl("manager", item.activeManagerLink!.token), "_blank")}>
                              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => actionMutation.mutate({ method: "POST", url: `/api/hr-pass-control/passes/${item.passId}/manager-links/${item.activeManagerLink!.id}/extend`, body: { expiresAt: extendExpiry } })}
                            >
                              <Clock className="mr-1 h-3.5 w-3.5" /> Extend
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => actionMutation.mutate({ method: "POST", url: `/api/hr-pass-control/passes/${item.passId}/manager-links/${item.activeManagerLink!.id}/revoke` })}
                            >
                              <ShieldOff className="mr-1 h-3.5 w-3.5" /> Revoke
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          onClick={() => actionMutation.mutate({ method: "POST", url: `/api/hr-pass-control/passes/${item.passId}/nudge`, body: { targetType: item.waitingOn === "manager" ? "manager" : "hr", reason: "Manual HR follow-up recorded from Pass Control." } })}
                        >
                          <Bell className="mr-1 h-3.5 w-3.5" /> Nudge
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border p-3">
                    <p className="text-sm font-medium">Recent activity</p>
                    <div className="mt-2 space-y-1">
                      {item.recentActivity.length ? item.recentActivity.map((activity) => (
                        <p key={activity.id} className="text-xs text-muted-foreground">
                          {activity.action.replaceAll("_", " ")}
                          {activity.createdAt ? ` · ${formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}` : ""}
                        </p>
                      )) : <p className="text-xs text-muted-foreground">No activity yet.</p>}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {item.candidates.map((candidate) => (
                    <div key={candidate.id} className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{candidate.candidateName}</p>
                          <Badge variant="outline" className={waitingStyles[candidate.waitingOn]}>{waitingLabels[candidate.waitingOn]}</Badge>
                          {candidate.isStalled && <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Stalled</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{candidate.stateLabel} · {candidate.nextAction}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => actionMutation.mutate({ method: "POST", url: `/api/hr-pass-control/passes/${item.passId}/candidates/${candidate.id}/candidate-link` })}
                        >
                          <UserCheck className="mr-1 h-3.5 w-3.5" /> Issue Candidate Pass
                        </Button>
                        {candidate.activeCandidateLink && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => window.open(passUrl("candidate", candidate.activeCandidateLink!.token), "_blank")}>Open</Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => actionMutation.mutate({ method: "POST", url: `/api/hr-pass-control/passes/${item.passId}/candidate-links/${candidate.activeCandidateLink!.id}/extend`, body: { expiresAt: extendExpiry } })}
                            >
                              Extend
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => actionMutation.mutate({ method: "POST", url: `/api/hr-pass-control/passes/${item.passId}/candidate-links/${candidate.activeCandidateLink!.id}/revoke` })}
                            >
                              Revoke
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          onClick={() => actionMutation.mutate({ method: "POST", url: `/api/hr-pass-control/passes/${item.passId}/nudge`, body: { targetType: "candidate", targetId: candidate.id, reason: "Manual candidate follow-up recorded from Pass Control." } })}
                        >
                          Nudge
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
