import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { PublicBrand, PublicCandidateForm, PublicFooter, type PublicConfig } from "./public-apply";

export default function PublicTalentPool() {
  const { data: config } = useQuery<PublicConfig>({ queryKey:["/api/public/config"] });
  return <div className="min-h-screen ios-gradient-bg"><main className="mx-auto max-w-3xl px-4 py-8 sm:py-12"><PublicBrand config={config}/><header className="mx-auto mb-8 mt-8 max-w-2xl text-center"><div className="mx-auto mb-4 w-fit rounded-2xl bg-primary/10 p-3"><Users className="h-7 w-7 text-primary"/></div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Join the talent pool</h1><p className="mt-4 leading-7 text-muted-foreground">This is a general CV submission, not an application for a specific vacancy. Your profile will enter {config?.companyName || "the company"}'s candidate database so the hiring team can consider it for suitable future roles.</p><p className="mt-2 text-sm text-muted-foreground">Submission does not guarantee contact or consideration for a role.</p></header>{config && <PublicCandidateForm config={config}/>}<PublicFooter config={config}/></main></div>;
}
