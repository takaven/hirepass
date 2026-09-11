import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  Briefcase,
  FileText,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Candidate, Pass } from "@shared/schema";
import { presentCandidateSource, presentHiringStatusLabel } from "@shared/hiring-workflow";

type CandidateLibrary = {
  cvs: Array<{ id: number; current: boolean; fileName?: string | null; provenance: string; createdAt?: string | null }>;
  applications: Array<{ id: number; status: string; pass: Pick<Pass, "id" | "positionTitle" | "department"> }>;
};

export default function CandidateProfile() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [reusePassId, setReusePassId] = useState("");

  const { data: candidate, isLoading } = useQuery<Candidate>({
    queryKey: ["/api/candidates", id],
    enabled: !!id,
  });
  const { data: library } = useQuery<CandidateLibrary>({
    queryKey: ["/api/candidates", id, "library"],
    enabled: !!id,
  });
  const { data: passes } = useQuery<Pass[]>({ queryKey: ["/api/passes"] });

  const reuseMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/candidates/${id}/reuse`, { passId: Number(reusePassId) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", id, "library"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      toast({ title: "Candidate added to vacancy" });
      setReusePassId("");
    },
    onError: () => toast({ title: "Could not add candidate to vacancy", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (!candidate) {
    return (
      <GlassCard className="p-10 text-center">
        <h1 className="text-lg font-semibold">Candidate not found</h1>
        <Link href="/candidates">
          <Button className="mt-4 rounded-xl" variant="outline">Back to Candidates</Button>
        </Link>
      </GlassCard>
    );
  }

  const applications = library?.applications ?? [];
  const cvs = library?.cvs ?? [];
  const availableVacancies = passes?.filter((pass) => !applications.some((application) => application.pass.id === pass.id)) ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/candidates">
            <Button variant="ghost" size="icon" className="rounded-xl" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{candidate.name}</h1>
            <p className="text-muted-foreground">Candidate Library profile</p>
          </div>
        </div>
        <Link href={`/candidates/${candidate.id}/edit`}>
          <Button className="rounded-xl" variant="outline" data-testid="button-edit-candidate">Edit profile</Button>
        </Link>
      </div>

      <GlassCard className="p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <UserRound className="h-5 w-5 text-primary" />
              Profile
            </h2>
            <div className="mt-4 space-y-3 text-sm">
              {candidate.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{candidate.email}</p>}
              {candidate.phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{candidate.phone}</p>}
              {candidate.currentTitle && <p className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground" />{candidate.currentTitle}</p>}
              {candidate.currentCompany && <p className="text-muted-foreground">{candidate.currentCompany}</p>}
              {candidate.currentLocation && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{candidate.currentLocation}</p>}
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Library status</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline">{presentCandidateSource(candidate.source)}</Badge>
              {candidate.inTalentPool && presentCandidateSource(candidate.source) !== "Talent pool" && <Badge variant="secondary">Talent pool</Badge>}
              {candidate.isAnonymized && <Badge variant="destructive">Erased profile</Badge>}
              {candidate.privacyNoticeVersion && <Badge variant="outline">Privacy notice {candidate.privacyNoticeVersion}</Badge>}
            </div>
            {candidate.cvSummary && <p className="mt-4 text-sm leading-6 text-muted-foreground">{candidate.cvSummary}</p>}
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard className="p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FileText className="h-5 w-5 text-primary" />
            CV history
          </h2>
          {cvs.length ? (
            <ul className="mt-4 space-y-3">
              {cvs.map((cv) => (
                <li key={cv.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                  <span>
                    <span className="font-medium">{cv.fileName || "Candidate CV"}</span>
                    <span className="block text-muted-foreground">
                      {cv.provenance} · {cv.createdAt ? new Date(cv.createdAt).toLocaleDateString() : "date unavailable"}
                      {cv.current ? " · current CV" : ""}
                    </span>
                  </span>
                  <a href={`/api/candidates/${id}/cvs/${cv.id}`}>
                    <Button type="button" size="sm" variant="outline">Download</Button>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No retained CV is available for this candidate.</p>
          )}
        </GlassCard>

        <GlassCard className="p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Vacancy history
          </h2>
          {applications.length ? (
            <ul className="mt-4 space-y-3">
              {applications.map((application) => (
                <li key={application.id} className="rounded-xl border p-3 text-sm">
                  <Link href={`/vacancies/${application.pass.id}`} className="font-medium hover:text-primary">
                    {application.pass.positionTitle}
                  </Link>
                  <span className="block text-muted-foreground">{application.pass.department || "No department"} · {presentHiringStatusLabel(application.status)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No vacancy applications yet. This may be a general talent-pool submission.</p>
          )}
        </GlassCard>
      </div>

      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold">Add to another vacancy</h2>
        <p className="mt-1 text-sm text-muted-foreground">Use this when a library candidate should be considered for a specific vacancy.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Select value={reusePassId} onValueChange={setReusePassId}>
            <SelectTrigger className="rounded-xl" data-testid="select-reuse-vacancy">
              <SelectValue placeholder="Select vacancy" />
            </SelectTrigger>
            <SelectContent>
              {availableVacancies.map((pass) => (
                <SelectItem key={pass.id} value={String(pass.id)}>{pass.positionTitle}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            className="rounded-xl"
            disabled={!reusePassId || reuseMutation.isPending}
            onClick={() => reuseMutation.mutate()}
            data-testid="button-reuse-candidate"
          >
            Add to vacancy
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
