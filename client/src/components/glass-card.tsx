import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "subtle";
}

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = "default", children, ...props }, ref) => {
    const variantStyles = {
      default: "bg-white/70 dark:bg-[rgba(30,30,30,0.8)] backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-sm",
      elevated: "bg-white/75 dark:bg-[rgba(30,30,30,0.85)] backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-md hover:shadow-lg transition-shadow duration-200",
      subtle: "bg-white/50 dark:bg-[rgba(30,30,30,0.6)] backdrop-blur-lg border border-white/40 dark:border-white/5 shadow-xs",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-2xl",
          variantStyles[variant],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlassCard.displayName = "GlassCard";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

function MetricCard({ title, value, icon, trend, className }: MetricCardProps) {
  return (
    <GlassCard variant="elevated" className={cn("p-3", className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-[11px] font-medium text-muted-foreground leading-none">{title}</p>
          <p className="text-xl font-semibold tracking-tight text-foreground">{value}</p>
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-[10px] font-medium",
              trend.isPositive ? "text-primary" : "text-destructive"
            )}>
              <span>{trend.isPositive ? "+" : ""}{trend.value}%</span>
            </div>
          )}
        </div>
        <div className="flex-shrink-0 [&>svg]:w-7 [&>svg]:h-7 [&>svg]:text-primary [&>svg]:drop-shadow-[0_2px_3px_rgba(0,200,83,0.3)] [&>svg]:filter">
          {icon}
        </div>
      </div>
    </GlassCard>
  );
}

export { GlassCard, MetricCard };
