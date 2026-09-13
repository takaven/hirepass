import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type PassStatus = 
  | "draft" 
  | "awaiting_jd_approval" 
  | "sourcing" 
  | "screening" 
  | "interviewing" 
  | "decision" 
  | "offer_pending" 
  | "closed_hired" 
  | "closed_cancelled"
  | "on_hold";

type Priority = "low" | "medium" | "high" | "urgent";
type InterviewFormat = "in_person" | "virtual" | "phone" | "panel";

interface StatusBadgeProps {
  status: PassStatus | string;
  className?: string;
}

const statusLabels: Record<string, string> = {
  draft: "Draft",
  awaiting_jd_approval: "Awaiting JD Approval",
  sourcing: "Sourcing",
  screening: "Review",
  interviewing: "Interviewing",
  decision: "Decision",
  offer_pending: "Offer Pending",
  closed_hired: "Closed - Hired",
  closed_cancelled: "Cancelled",
  on_hold: "On Hold",
  new: "Applied",
  shortlisted: "Review",
  selected: "Selected",
  hired: "Hired",
  rejected: "Not selected",
};

const statusStyles: Record<string, string> = {
  draft: "border-[#DCE1E7] bg-[#F4F6F8] text-[#68707D]",
  awaiting_jd_approval: "border-amber-300 bg-amber-50 text-amber-800",
  sourcing: "border-[#DCE1E7] bg-[#F4F6F8] text-[#42494D]",
  screening: "border-[#DCE1E7] bg-[#F4F6F8] text-[#42494D]",
  interviewing: "border-[#DCE1E7] bg-[#F4F6F8] text-[#42494D]",
  decision: "border-[#DCE1E7] bg-[#F4F6F8] text-[#42494D]",
  offer_pending: "border-[#DCE1E7] bg-[#F4F6F8] text-[#20242B]",
  closed_hired: "border-[#DCE1E7] bg-white text-[#20242B]",
  closed_cancelled: "border-red-200 bg-red-50 text-red-700",
  on_hold: "border-amber-300 bg-amber-50 text-amber-800",
  new: "border-[#DCE1E7] bg-[#F4F6F8] text-[#42494D]",
  shortlisted: "border-[#DCE1E7] bg-[#F4F6F8] text-[#42494D]",
  selected: "border-[#01FF22] bg-[#01FF22]/10 text-[#20242B]",
  hired: "border-[#DCE1E7] bg-white text-[#20242B]",
  rejected: "border-red-200 bg-red-50 text-red-700",
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const label = statusLabels[status] || status;
  const style = statusStyles[status] || "border-[#DCE1E7] bg-[#F4F6F8] text-[#68707D]";
  
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border px-3 py-1 font-medium",
        style,
        className
      )}
      data-testid={`badge-status-${status}`}
    >
      {label}
    </Badge>
  );
}

interface PriorityBadgeProps {
  priority: Priority;
  className?: string;
}

const priorityLabels: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const priorityStyles: Record<Priority, string> = {
  low: "border-[#DCE1E7] bg-[#F4F6F8] text-[#68707D]",
  medium: "border-[#DCE1E7] bg-[#F4F6F8] text-[#42494D]",
  high: "border-amber-300 bg-amber-50 text-amber-800",
  urgent: "border-red-200 bg-red-50 text-red-700",
};

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border px-3 py-1 font-medium",
        priorityStyles[priority],
        className
      )}
      data-testid={`badge-priority-${priority}`}
    >
      {priorityLabels[priority]}
    </Badge>
  );
}

interface StageBadgeProps {
  stage: InterviewFormat | string;
  className?: string;
}

const stageLabels: Record<string, string> = {
  in_person: "In-Person",
  virtual: "Virtual",
  phone: "Phone",
  panel: "Panel",
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

const stageStyles: Record<string, string> = {
  in_person: "border-[#DCE1E7] bg-[#F4F6F8] text-[#42494D]",
  virtual: "border-[#DCE1E7] bg-[#F4F6F8] text-[#42494D]",
  phone: "border-[#DCE1E7] bg-[#F4F6F8] text-[#42494D]",
  panel: "border-[#DCE1E7] bg-[#F4F6F8] text-[#42494D]",
  scheduled: "border-[#DCE1E7] bg-[#F4F6F8] text-[#42494D]",
  completed: "border-[#DCE1E7] bg-white text-[#20242B]",
  cancelled: "border-red-200 bg-red-50 text-red-700",
};

export function StageBadge({ stage, className }: StageBadgeProps) {
  const label = stageLabels[stage] || stage;
  const style = stageStyles[stage] || "border-[#DCE1E7] bg-[#F4F6F8] text-[#68707D]";
  
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border px-3 py-1 font-medium",
        style,
        className
      )}
      data-testid={`badge-stage-${stage}`}
    >
      {label}
    </Badge>
  );
}
