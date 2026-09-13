import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "subtle";
}

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = "default", children, ...props }, ref) => {
    const variantStyles = {
      default: "border border-[#DCE1E7] bg-white shadow-sm",
      elevated: "border border-[#DCE1E7] bg-white shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-[#C8CFD8] hover:shadow-md",
      subtle: "border border-[#DCE1E7] bg-[#F4F6F8] shadow-none",
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
          <p className="text-xs font-medium text-muted-foreground leading-none">{title}</p>
          <p className="text-xl font-semibold tracking-tight text-foreground">{value}</p>
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-xs font-medium",
              trend.isPositive ? "text-primary" : "text-destructive"
            )}>
              <span>{trend.isPositive ? "+" : ""}{trend.value}%</span>
            </div>
          )}
        </div>
        <div className="flex-shrink-0 [&>svg]:h-7 [&>svg]:w-7 [&>svg]:text-[#42494D]">
          {icon}
        </div>
      </div>
    </GlassCard>
  );
}

export { GlassCard, MetricCard };
