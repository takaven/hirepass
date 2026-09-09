import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, CheckCircle, Clock3, Loader2, MapPin } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { getPublicSubmissionConfirmation, type PublicSubmissionResult } from "@/lib/public-submission";
import { validateClientUpload } from "@/lib/upload-preflight";

export type PublicPass = { id:number; positionTitle:string; department?:string; location?:string; employmentType?:string; experienceMin?:number; experienceMax?:number; jobDescriptionFinal?:string; status?:string };
export type PublicConfig = { companyName:string; companyLocation:string; careersContactEmail:string; privacyNoticeUrl:string; privacyNoticeVersion:string; aiEnabled?: boolean };

async function filePayload(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read the CV"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function PublicBrand({ config }: { config?: PublicConfig }) {
  return <div className="flex flex-col items-center gap-3 text-center"><img src="/brand/hirepass-endorsed-light.svg" alt="HirePass by TAKAVEN" className="h-auto w-40 dark:hidden"/><img src="/brand/hirepass-endorsed-dark.svg" alt="HirePass by TAKAVEN" className="hidden h-auto w-40 dark:block"/><p className="text-sm font-medium text-muted-foreground">Hiring for {config?.companyName || "the hiring company"}</p></div>;
}

function Field({ label, name, type = "text", required = false, placeholder }: { label:string; name:string; type?:string; required?:boolean; placeholder?:string }) {
  return <label className="space-y-2 text-sm font-medium"><span>{label}{required && <span aria-hidden="true"> *</span>}</span><Input name={name} type={type} required={required} placeholder={placeholder}/></label>;
}

export function PublicCandidateForm({ pass, config }: { pass?: PublicPass; config: PublicConfig }) {
  const [file, setFile] = useState<File | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{ title:string; detail:string } | null>(null);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !accepted) return;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiRequest("POST", pass ? `/api/public/passes/${pass.id}/apply` : "/api/public/submit-cv", {
        name: form.get("name"), email: form.get("email"), phone: form.get("phone") || undefined,
        currentTitle: form.get("currentTitle") || undefined, currentCompany: form.get("currentCompany") || undefined,
        currentLocation: form.get("currentLocation") || undefined, linkedinUrl: form.get("linkedinUrl") || undefined,
        skills: String(form.get("skills") || "").split(",").map((value) => value.trim()).filter(Boolean),
        fileName: file.name, mimeType: file.type, fileDataBase64: await filePayload(file),
        privacyAcknowledged: true, privacyNoticeVersion: config.privacyNoticeVersion,
      });
      setConfirmation(getPublicSubmissionConfirmation(pass ? "vacancy" : "general", await response.json() as PublicSubmissionResult));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Submission failed. Please retry."); }
    finally { setBusy(false); }
  }

  if (confirmation) return <GlassCard className="p-8 text-center sm:p-10" role="status"><CheckCircle className="mx-auto mb-4 h-10 w-10 text-green-600"/><h2 className="text-2xl font-semibold">{confirmation.title}</h2><p className="mt-2 text-muted-foreground">{confirmation.detail}</p><p className="mt-5 text-sm text-muted-foreground">The hiring team will manage any next step. No automatic response time is promised.</p></GlassCard>;
  return <GlassCard className="p-5 sm:p-7"><div className="mb-6"><h2 className="text-xl font-semibold">{pass ? "Apply for this vacancy" : "Share your profile"}</h2><p className="mt-1 text-sm text-muted-foreground">Fields marked * are required. Your PDF is stored privately with your candidate record.</p></div><form className="grid gap-5 sm:grid-cols-2" onSubmit={submit}>
    <Field label="Full name" name="name" required/>
    <Field label="Email" name="email" type="email" required/>
    <Field label="Phone" name="phone" placeholder="Optional"/>
    <Field label="Current role" name="currentTitle" placeholder="Optional"/>
    <Field label="Current company" name="currentCompany" placeholder="Optional"/>
    <Field label="Location" name="currentLocation" placeholder="Optional"/>
    <Field label="LinkedIn profile" name="linkedinUrl" type="url" placeholder="Optional"/>
    <Field label="Skills" name="skills" placeholder="Optional, comma separated"/>
    <label className="space-y-2 text-sm font-medium sm:col-span-2"><span>CV (PDF, maximum 10 MB) *</span><Input className="h-auto min-h-11 py-2" type="file" accept=".pdf,application/pdf" required onChange={(event) => { const selected = event.target.files?.[0] || null; const issue = selected ? validateClientUpload(selected, "cv") : null; setError(issue || ""); setFile(issue ? null : selected); if (issue) event.currentTarget.value = ""; }}/></label>
    <label className="flex items-start gap-3 rounded-xl border p-4 text-sm sm:col-span-2"><Checkbox aria-label="Acknowledge candidate privacy notice" checked={accepted} onCheckedChange={(value) => setAccepted(value === true)}/><span>I acknowledge the {config.privacyNoticeUrl ? <a className="font-medium underline underline-offset-4" href={config.privacyNoticeUrl} target="_blank" rel="noreferrer">candidate privacy notice</a> : "candidate privacy notice provided by the hiring company"} (version {config.privacyNoticeVersion}).</span></label>
    {config.aiEnabled && <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground sm:col-span-2">AI-assisted review may help the hiring team assess role-related information in your submission. Hiring decisions are made by people.</p>}
    {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2" role="alert">{error}</p>}
    <Button className="min-h-11 w-full sm:col-span-2" disabled={busy || !file || !accepted}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{pass ? "Submit application" : "Submit CV"}</Button>
  </form></GlassCard>;
}

function VacancyCard({ pass, expanded, onApply }: { pass:PublicPass; expanded:boolean; onApply?:()=>void }) {
  const experience = pass.experienceMin != null || pass.experienceMax != null ? `${pass.experienceMin ?? 0}${pass.experienceMax != null ? `–${pass.experienceMax}` : "+"} years experience` : null;
  return <section className="space-y-5"><GlassCard className="overflow-hidden p-0"><div className="border-b bg-primary/[0.04] p-5 sm:p-7"><p className="text-sm font-medium text-primary">Open vacancy</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{pass.positionTitle}</h1><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">{pass.department && <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4"/>{pass.department}</span>}{pass.location && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4"/>{pass.location}</span>}{pass.employmentType && <span className="inline-flex items-center gap-1"><Clock3 className="h-4 w-4"/>{pass.employmentType}</span>}{experience && <span>{experience}</span>}</div></div><div className="p-5 sm:p-7"><h2 className="text-xl font-semibold">About the role</h2>{pass.jobDescriptionFinal ? <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground sm:text-base">{pass.jobDescriptionFinal}</div> : <p className="mt-3 text-muted-foreground">The hiring company has not published a detailed description for this vacancy.</p>}{onApply && <Button className="mt-6 w-full sm:w-auto" onClick={onApply}>{expanded ? "Close application form" : "Apply for this role"}</Button>}</div></GlassCard></section>;
}

export default function PublicApply({ passIdParam }: { passIdParam?: string }) {
  const { data: config } = useQuery<PublicConfig>({ queryKey:["/api/public/config"] });
  const endpoint = passIdParam ? `/api/public/passes/${passIdParam}` : "/api/public/passes";
  const { data, isLoading, error } = useQuery<PublicPass | PublicPass[]>({ queryKey:[endpoint] });
  const passes = Array.isArray(data) ? data : data ? [data] : [];
  const [selected, setSelected] = useState<number | null>(passIdParam ? Number(passIdParam) : null);
  return <div className="min-h-screen ios-gradient-bg"><main className="mx-auto max-w-4xl px-4 py-8 sm:py-12"><header className="mb-8"><PublicBrand config={config}/>{!passIdParam && <div className="mt-7 text-center"><h1 className="text-3xl font-semibold sm:text-4xl">Open vacancies</h1><p className="mt-2 text-muted-foreground">Review an opportunity before sharing your details.</p></div>}</header>
    {isLoading ? <div className="py-20 text-center"><Loader2 className="mx-auto animate-spin"/><p className="mt-3 text-sm text-muted-foreground">Loading vacancy…</p></div> : error || !passes.length ? <GlassCard className="p-8 text-center"><h1 className="text-xl font-semibold">This vacancy is not available</h1><p className="mt-2 text-muted-foreground">It may be closed or the link may be incorrect.</p></GlassCard> : passes.map((pass) => <div key={pass.id} className="mb-8"><VacancyCard pass={pass} expanded={selected === pass.id} onApply={!passIdParam ? () => setSelected(selected === pass.id ? null : pass.id) : undefined}/>{(passIdParam || selected === pass.id) && config && <div className="mt-5"><PublicCandidateForm pass={pass} config={config}/></div>}</div>)}
    <footer className="mt-10 text-center text-xs text-muted-foreground">HirePass by TAKAVEN{config?.careersContactEmail ? <> · Questions: <a className="underline" href={`mailto:${config.careersContactEmail}`}>{config.careersContactEmail}</a></> : null}</footer>
  </main></div>;
}
