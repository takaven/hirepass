import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Briefcase, Loader2, MapPin } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { PublicBrand, type PublicConfig, type PublicPass } from "./public-apply";

export default function PublicCareers() {
  const { data: config } = useQuery<PublicConfig>({ queryKey: ["/api/public/config"] });
  const { data: vacancies, isLoading } = useQuery<PublicPass[]>({ queryKey: ["/api/public/passes"] });

  return (
    <div className="min-h-screen ios-gradient-bg">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <header className="mb-8 text-center">
          <PublicBrand config={config} />
          <h1 className="mt-7 text-3xl font-semibold tracking-tight sm:text-5xl">
            Careers at {config?.companyName || "the hiring company"}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Explore open vacancies or share your CV for future roles. HirePass keeps the process simple and gives the hiring team clear next actions.
          </p>
        </header>

        <section className="space-y-4" aria-labelledby="open-vacancies">
          <h2 id="open-vacancies" className="text-xl font-semibold">Open opportunities</h2>
          {isLoading ? (
            <GlassCard className="p-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /><p className="mt-2 text-sm text-muted-foreground">Loading vacancies…</p></GlassCard>
          ) : vacancies?.length ? (
            <div className="grid gap-4">
              {vacancies.map((vacancy) => (
                <GlassCard key={vacancy.id} className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{vacancy.positionTitle}</h3>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {vacancy.department && <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4" />{vacancy.department}</span>}
                        {vacancy.location && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{vacancy.location}</span>}
                        {vacancy.employmentType && <span>{vacancy.employmentType}</span>}
                      </div>
                    </div>
                    <Button asChild><Link href={`/apply/${vacancy.id}`}>View / Apply</Link></Button>
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : (
            <GlassCard className="p-8 text-center"><p className="text-muted-foreground">There are no open vacancies right now.</p></GlassCard>
          )}
        </section>

        <GlassCard className="mt-8 p-6 text-center">
          <h2 className="text-xl font-semibold">Don’t see the right role?</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Join the talent pool and the hiring team may consider your profile for suitable future vacancies.
          </p>
          <Button className="mt-4" asChild><Link href="/talent-pool">Join our talent pool</Link></Button>
        </GlassCard>

        <footer className="mt-10 text-center text-xs text-muted-foreground">HirePass by TAKAVEN</footer>
      </main>
    </div>
  );
}

