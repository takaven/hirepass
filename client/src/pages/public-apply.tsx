import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, CheckCircle, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";

type PublicPass = { id:number; positionTitle:string; department?:string; location?:string; employmentType?:string; jobDescriptionFinal?:string; status?:string };
type PublicConfig = { companyName:string; privacyNoticeUrl:string; privacyNoticeVersion:string };

async function filePayload(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read the CV"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function PublicCandidateForm({ pass, config }: { pass?: PublicPass; config: PublicConfig }) {
  const [file, setFile] = useState<File | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !accepted) return;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest("POST", pass ? `/api/public/passes/${pass.id}/apply` : "/api/public/submit-cv", {
        name: form.get("name"), email: form.get("email"), phone: form.get("phone") || undefined,
        currentTitle: form.get("currentTitle") || undefined, currentCompany: form.get("currentCompany") || undefined,
        currentLocation: form.get("currentLocation") || undefined, linkedinUrl: form.get("linkedinUrl") || undefined,
        skills: String(form.get("skills") || "").split(",").map((value) => value.trim()).filter(Boolean),
        fileName: file.name, mimeType: file.type, fileDataBase64: await filePayload(file),
        privacyAcknowledged: true, privacyNoticeVersion: config.privacyNoticeVersion,
      });
      setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Submission failed. Please retry."); }
    finally { setBusy(false); }
  }

  if (done) return <GlassCard className="p-10 text-center"><CheckCircle className="mx-auto mb-4 text-green-600"/><h2 className="text-2xl font-semibold">CV submitted</h2><p className="mt-2 text-muted-foreground">Your details and CV were received. The hiring team will contact you if there is a suitable next step.</p></GlassCard>;
  return <GlassCard className="p-6"><form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
    <Input name="name" placeholder="Full name" required />
    <Input name="email" type="email" placeholder="Email" required />
    <Input name="phone" placeholder="Phone (optional)" />
    <Input name="currentTitle" placeholder="Current role (optional)" />
    <Input name="currentCompany" placeholder="Current company (optional)" />
    <Input name="currentLocation" placeholder="Location (optional)" />
    <Input name="linkedinUrl" type="url" placeholder="LinkedIn URL (optional)" />
    <Input name="skills" placeholder="Skills, comma separated (optional)" />
    <div className="sm:col-span-2"><label className="text-sm font-medium">CV (PDF, maximum 10 MB)</label><Input className="mt-2" type="file" accept=".pdf,application/pdf" required onChange={(event) => setFile(event.target.files?.[0] || null)} /></div>
    <label className="sm:col-span-2 flex gap-3 text-sm items-start"><Checkbox checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} /><span>I acknowledge the {config.privacyNoticeUrl ? <a className="underline" href={config.privacyNoticeUrl} target="_blank" rel="noreferrer">candidate privacy notice</a> : "candidate privacy notice provided by the hiring company"}.</span></label>
    {error && <p className="sm:col-span-2 text-sm text-destructive">{error}</p>}
    <Button className="sm:col-span-2" disabled={busy || !file || !accepted}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{pass ? "Submit application" : "Submit CV"}</Button>
  </form></GlassCard>;
}

export default function PublicApply({ passIdParam }: { passIdParam?: string }) {
  const { data: config } = useQuery<PublicConfig>({ queryKey:["/api/public/config"] });
  const endpoint = passIdParam ? `/api/public/passes/${passIdParam}` : "/api/public/passes";
  const { data, isLoading, error } = useQuery<PublicPass | PublicPass[]>({ queryKey:[endpoint] });
  const passes = Array.isArray(data) ? data : data ? [data] : [];
  const [selected, setSelected] = useState<number | null>(passIdParam ? Number(passIdParam) : null);
  return <div className="min-h-screen ios-gradient-bg"><main className="max-w-3xl mx-auto px-4 py-12">
    <header className="text-center mb-8"><Briefcase className="mx-auto mb-4 h-10 w-10 text-primary"/><h1 className="text-4xl font-semibold">{passIdParam ? passes[0]?.positionTitle || "Apply" : `Careers at ${config?.companyName || "our company"}`}</h1><p className="mt-3 text-muted-foreground">{passIdParam ? "Review the vacancy and submit your application directly." : "Choose an open vacancy and submit your CV."}</p></header>
    {isLoading ? <Loader2 className="mx-auto animate-spin"/> : error || !passes.length ? <GlassCard className="p-8 text-center">This vacancy is not available.</GlassCard> : passes.map((pass) => <div key={pass.id} className="mb-5"><GlassCard className="p-5"><h2 className="text-xl font-semibold">{pass.positionTitle}</h2><p className="text-sm text-muted-foreground">{[pass.department,pass.location,pass.employmentType].filter(Boolean).join(" · ")}</p>{pass.jobDescriptionFinal && <p className="mt-4 whitespace-pre-wrap">{pass.jobDescriptionFinal}</p>}{!passIdParam && <Button className="mt-4" variant="outline" onClick={() => setSelected(selected === pass.id ? null : pass.id)}>Apply</Button>}</GlassCard>{(passIdParam || selected === pass.id) && config && <div className="mt-4"><PublicCandidateForm pass={pass} config={config}/></div>}</div>)}
  </main></div>;
}
