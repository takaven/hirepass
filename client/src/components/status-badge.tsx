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
  screening: "Screening",
  interviewing: "Interviewing",
  decision: "Decision",
  offer_pending: "Offer Pending",
  closed_hired: "Closed - Hired",
  closed_cancelled: "Cancelled",
  on_hold: "On Hold",
  new: "New",
  shortlisted: "Shortlisted",
  selected: "Selected",
  hired: "Hired",
  rejected: "Rejected",
};

const statusStyles: Record<string, string> = {
  draft: "border-gray-400 bg-gray-50/50 text-gray-600 dark:border-gray-500 dark:bg-gray-800/30 dark:text-gray-400",
  awaiting_jd_approval: "border-amber-400 bg-amber-50/50 text-amber-700 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-300",
  sourcing: "border-blue-400 bg-blue-50/50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300",
  screening: "border-indigo-400 bg-indigo-50/50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-300",
  interviewing: "border-purple-400 bg-purple-50/50 text-purple-700 dark:border-purple-500 dark:bg-purple-900/30 dark:text-purple-300",
  decision: "border-orange-400 bg-orange-50/50 text-orange-700 dark:border-orange-500 dark:bg-orange-900/30 dark:text-orange-300",
  offer_pending: "border-primary bg-primary/10 text-primary",
  closed_hired: "border-green-400 bg-green-50/50 text-green-700 dark:border-green-500 dark:bg-green-900/30 dark:text-green-300",
  closed_cancelled: "border-red-400 bg-red-50/50 text-red-700 dark:border-red-500 dark:bg-red-900/30 dark:text-red-300",
  on_hold: "border-amber-400 bg-amber-50/50 text-amber-700 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-300",
  new: "border-blue-400 bg-blue-50/50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300",
  shortlisted: "border-indigo-400 bg-indigo-50/50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-300",
  selected: "border-primary bg-primary/10 text-primary",
  hired: "border-green-400 bg-green-50/50 text-green-700 dark:border-green-500 dark:bg-green-900/30 dark:text-green-300",
  rejected: "border-red-400 bg-red-50/50 text-red-700 dark:border-red-500 dark:bg-red-900/30 dark:text-red-300",
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const label = statusLabels[status] || status;
  const style = statusStyles[status] || "border-gray-400 bg-gray-50/50 text-gray-600";
  
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-3 py-1 font-medium border-2",
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
  low: "border-gray-400 bg-gray-50/50 text-gray-600 dark:border-gray-500 dark:bg-gray-800/30 dark:text-gray-400",
  medium: "border-blue-400 bg-blue-50/50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300",
  high: "border-orange-400 bg-orange-50/50 text-orange-700 dark:border-orange-500 dark:bg-orange-900/30 dark:text-orange-300",
  urgent: "border-red-400 bg-red-50/50 text-red-700 dark:border-red-500 dark:bg-red-900/30 dark:text-red-300",
};

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-3 py-1 font-medium border-2",
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
  in_person: "border-blue-400 bg-blue-50/50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300",
  virtual: "border-purple-400 bg-purple-50/50 text-purple-700 dark:border-purple-500 dark:bg-purple-900/30 dark:text-purple-300",
  phone: "border-amber-400 bg-amber-50/50 text-amber-700 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-300",
  panel: "border-primary bg-primary/10 text-primary",
  scheduled: "border-blue-400 bg-blue-50/50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300",
  completed: "border-green-400 bg-green-50/50 text-green-700 dark:border-green-500 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "border-red-400 bg-red-50/50 text-red-700 dark:border-red-500 dark:bg-red-900/30 dark:text-red-300",
};

export function StageBadge({ stage, className }: StageBadgeProps) {
  const label = stageLabels[stage] || stage;
  const style = stageStyles[stage] || "border-gray-400 bg-gray-50/50 text-gray-600";
  
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-3 py-1 font-medium border-2",
        style,
        className
      )}
      data-testid={`badge-stage-${stage}`}
    >
      {label}
    </Badge>
  );
}
