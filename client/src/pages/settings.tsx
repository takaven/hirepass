import { useQuery } from "@tanstack/react-query";
import { Building2, ExternalLink, Moon, Shield, Sun } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/components/theme-provider";

type PublicConfig = {
  companyName: string;
  companyLocation: string;
  careersContactEmail: string;
  privacyNoticeUrl: string;
  privacyNoticeVersion: string;
};

function ConfigValue({ label, value }: { label: string; value?: string }) {
  return <div className="rounded-xl bg-muted/30 p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 break-words font-medium">{value || "Not configured"}</p></div>;
}

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { data: config, isLoading } = useQuery<PublicConfig>({ queryKey: ["/api/public/config"] });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div><h1 className="text-3xl font-semibold tracking-tight">Settings</h1><p className="mt-1 text-muted-foreground">Deployment identity and working interface preferences</p></div>
      <GlassCard>
        <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2"><Building2 className="h-5 w-5 text-primary" /></div><div><h2 className="font-semibold">Company identity</h2><p className="text-sm text-muted-foreground">Read-only values supplied by the deployment owner</p></div></div>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading deployment configuration…</p> : <div className="grid gap-3 sm:grid-cols-2">
          <ConfigValue label="Hiring for" value={config?.companyName} />
          <ConfigValue label="Company location" value={config?.companyLocation} />
          <ConfigValue label="Careers contact" value={config?.careersContactEmail} />
          <ConfigValue label="Privacy notice version" value={config?.privacyNoticeVersion} />
          <div className="rounded-xl bg-muted/30 p-4 sm:col-span-2"><p className="text-sm text-muted-foreground">Candidate privacy notice</p>{config?.privacyNoticeUrl ? <a className="mt-1 inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4" href={config.privacyNoticeUrl} target="_blank" rel="noreferrer">Open configured notice <ExternalLink className="h-4 w-4" /></a> : <p className="mt-1 font-medium">Not configured</p>}</div>
        </div>}
        <p className="mt-4 text-xs text-muted-foreground">Change these values through the deployment environment, then restart the application. HirePass does not claim to manage customer privacy policy or retention law.</p>
      </GlassCard>
      <GlassCard>
        <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2">{theme === "dark" ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}</div><div><h2 className="font-semibold">Appearance</h2><p className="text-sm text-muted-foreground">A preference stored in this browser</p></div></div>
        <div className="flex items-center justify-between rounded-xl bg-muted/30 p-4"><div><Label htmlFor="dark-mode">Dark mode</Label><p className="text-sm text-muted-foreground">Switch between light and dark themes</p></div><Switch id="dark-mode" checked={theme === "dark"} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} data-testid="switch-dark-mode" /></div>
      </GlassCard>
      <GlassCard><div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2"><Shield className="h-5 w-5 text-primary" /></div><div><h2 className="font-semibold">HirePass by TAKAVEN</h2><p className="text-sm text-muted-foreground">Core launch configuration is managed per isolated customer deployment.</p></div></div></GlassCard>
    </div>
  );
}
