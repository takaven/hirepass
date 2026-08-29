import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/components/theme-provider";
import {
  Building2,
  Moon,
  Sun,
  Bell,
  Shield,
  Database,
} from "lucide-react";

export default function Settings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure your recruitment system preferences
        </p>
      </div>

      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-primary/10">
            <Building2 className="w-5 h-5 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="font-semibold">Company Information</h2>
            <p className="text-sm text-muted-foreground">Your organization details</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Company Name</Label>
            <Input 
              id="company-name"
              defaultValue="Your Organization"
              className="rounded-xl"
              data-testid="input-company-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-location">Location</Label>
            <Input 
              id="company-location"
              defaultValue="Remote / Hybrid"
              className="rounded-xl"
              data-testid="input-company-location"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-email">Contact Email</Label>
            <Input 
              id="company-email"
              type="email"
              placeholder="hr@hirepass.example"
              className="rounded-xl"
              data-testid="input-company-email"
            />
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-primary/10">
            {theme === "dark" ? (
              <Moon className="w-5 h-5 text-primary" strokeWidth={1.5} />
            ) : (
              <Sun className="w-5 h-5 text-primary" strokeWidth={1.5} />
            )}
          </div>
          <div>
            <h2 className="font-semibold">Appearance</h2>
            <p className="text-sm text-muted-foreground">Customize the interface</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
            <div className="space-y-0.5">
              <Label>Dark Mode</Label>
              <p className="text-sm text-muted-foreground">
                Switch between light and dark themes
              </p>
            </div>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
              data-testid="switch-dark-mode"
            />
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-primary/10">
            <Bell className="w-5 h-5 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="font-semibold">Notifications</h2>
            <p className="text-sm text-muted-foreground">Configure notification preferences</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
            <div className="space-y-0.5">
              <Label>Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive email updates for new applications
              </p>
            </div>
            <Switch defaultChecked data-testid="switch-email-notifications" />
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
            <div className="space-y-0.5">
              <Label>Interview Reminders</Label>
              <p className="text-sm text-muted-foreground">
                Get reminded before scheduled interviews
              </p>
            </div>
            <Switch defaultChecked data-testid="switch-interview-reminders" />
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-primary/10">
            <Database className="w-5 h-5 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="font-semibold">Data Management</h2>
            <p className="text-sm text-muted-foreground">Manage your recruitment data</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
            <div className="space-y-0.5">
              <Label>Data Retention</Label>
              <p className="text-sm text-muted-foreground">
                Keep rejected candidate data for 12 months
              </p>
            </div>
            <Switch defaultChecked data-testid="switch-data-retention" />
          </div>
        </div>

        <Separator className="my-6" />

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-destructive">Danger Zone</p>
            <p className="text-sm text-muted-foreground">
              Irreversible actions
            </p>
          </div>
          <Button variant="destructive" className="rounded-xl" data-testid="button-export-data">
            Export All Data
          </Button>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-primary/10">
            <Shield className="w-5 h-5 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="font-semibold">About</h2>
            <p className="text-sm text-muted-foreground">System information</p>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version</span>
            <span className="font-medium">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Company</span>
            <span className="font-medium">Your Organization</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Location</span>
            <span className="font-medium">Configured per workspace</span>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

