import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { PublicBrand, type PublicConfig } from "./public-apply";

function company(config?: PublicConfig) {
  return config?.companyName || "the hiring company";
}

export default function PublicPrivacy() {
  const { data: config } = useQuery<PublicConfig>({ queryKey: ["/api/public/config"] });
  const companyName = company(config);

  return (
    <main className="min-h-screen ios-gradient-bg px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <PublicBrand config={config} />

        <GlassCard className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-primary">Recruitment Privacy Notice</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">How candidate information is used</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Version {config?.privacyNoticeVersion || "configured by the hiring company"}
              </p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="space-y-6 p-6 text-sm leading-7 text-muted-foreground sm:p-8">
          <section>
            <h2 className="text-lg font-semibold text-foreground">Who this notice is for</h2>
            <p className="mt-2">
              This notice explains how HirePass supports recruitment processing for {companyName}. It applies when you
              submit a CV, apply for a vacancy, use a Candidate Pass, provide requested documents, respond to interview
              or offer actions, or otherwise share information during a hiring process managed in HirePass.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Information processed</h2>
            <p className="mt-2">
              HirePass may process candidate profile details, contact details, CVs, application history, documents you
              upload, messages, interview scheduling information, offer responses, hiring workflow status and related
              recruitment notes entered by the hiring team.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Why it is used</h2>
            <p className="mt-2">
              Your information is used to manage recruitment, assess suitability for vacancies, coordinate hiring
              actions, maintain a candidate record for future suitable opportunities where applicable, and preserve
              appropriate operational history for the hiring process.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">AI-assisted review</h2>
            <p className="mt-2">
              Where enabled by {companyName}, HirePass may use AI-assisted review to help identify role-related evidence,
              strengths, gaps and clarification questions from candidate information. AI does not make automatic hiring,
              rejection or offer decisions. Hiring decisions remain with people.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Candidate Library and retention</h2>
            <p className="mt-2">
              Candidate records may remain available in the hiring company&apos;s Candidate Library until deleted or
              until the company&apos;s configured/legal retention process requires removal. A candidate may ask the hiring
              company about access, correction, deletion or retention of their recruitment information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Access and storage</h2>
            <p className="mt-2">
              Candidate files are stored privately and are not published as public static files. Access is limited to
              authorised internal hiring users and scoped Candidate or Stakeholder Pass links used to complete hiring
              actions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Questions</h2>
            <p className="mt-2">
              Questions about a specific recruitment process should be directed to {companyName}
              {config?.careersContactEmail ? (
                <>
                  {" "}
                  at{" "}
                  <a className="font-medium text-primary underline underline-offset-4" href={`mailto:${config.careersContactEmail}`}>
                    {config.careersContactEmail}
                  </a>
                </>
              ) : (
                ""
              )}
              .
            </p>
          </section>
        </GlassCard>
      </div>
    </main>
  );
}
