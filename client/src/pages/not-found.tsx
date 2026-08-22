import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Home, AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <GlassCard className="max-w-md w-full text-center p-8">
        <div className="p-4 rounded-3xl bg-destructive/10 w-fit mx-auto mb-6">
          <AlertCircle className="h-12 w-12 text-destructive" strokeWidth={1} />
        </div>
        <h1 className="text-3xl font-semibold mb-2">Page Not Found</h1>
        <p className="text-muted-foreground mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/">
          <Button className="rounded-xl gap-2" data-testid="button-go-home">
            <Home className="w-4 h-4" strokeWidth={1.5} />
            Back to Dashboard
          </Button>
        </Link>
      </GlassCard>
    </div>
  );
}
