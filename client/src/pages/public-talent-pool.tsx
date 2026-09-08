import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { PublicCandidateForm } from "./public-apply";

type PublicConfig = { companyName:string; privacyNoticeUrl:string; privacyNoticeVersion:string };

export default function PublicTalentPool() {
  const { data: config } = useQuery<PublicConfig>({ queryKey:["/api/public/config"] });
  return <div className="min-h-screen ios-gradient-bg"><main className="max-w-2xl mx-auto px-4 py-12"><header className="text-center mb-8"><Users className="mx-auto mb-4 h-10 w-10 text-primary"/><h1 className="text-4xl font-semibold">Join {config?.companyName || "our"} talent pool</h1><p className="mt-3 text-muted-foreground">Submit your CV without applying for a specific vacancy. Your profile will be available to the hiring team for suitable future roles.</p></header>{config && <PublicCandidateForm config={config}/>}</main></div>;
}
