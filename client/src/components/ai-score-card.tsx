import { useMutation } from "@tanstack/react-query";
import { Sparkles, RefreshCw, TrendingUp, Award, AlertTriangle, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AiScoreDetails {
  overallScore: number;
  skillsMatch: number;
  experienceMatch: number;
  cultureMatch: number;
  recommendation: "strong_yes" | "yes" | "maybe" | "no";
  strengths: string[];
  improvements: string[];
  summary?: string;
  matchBreakdown?: {
    technicalSkills: number;
    softSkills: number;
    industryExperience: number;
    growthPotential: number;
  };
}

interface AiScoreCardProps {
  passId: number;
  passCandidateId: number;
  candidateName: string;
  existingScore?: number | null;
  existingDetails?: string | null;
  onScoreUpdate?: () => void;
  compact?: boolean;
}

function ScoreGauge({ score, size = "large" }: { score: number; size?: "small" | "large" }) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-amber-600 dark:text-amber-400";
    if (score >= 40) return "text-orange-600 dark:text-orange-400";
    return "text-red-600 dark:text-red-400";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-amber-500";
    if (score >= 40) return "bg-orange-500";
    return "bg-red-500";
  };

  const dimensions = size === "large" ? "w-24 h-24" : "w-12 h-12";
  const textSize = size === "large" ? "text-2xl" : "text-sm";
  const strokeWidth = size === "large" ? 6 : 4;
  const radius = size === "large" ? 40 : 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className={`relative ${dimensions} flex items-center justify-center`}>
      <svg className="absolute w-full h-full -rotate-90">
        <circle
          cx="50%"
          cy="50%"
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-muted/20"
        />
        <circle
          cx="50%"
          cy="50%"
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={getScoreColor(score)}
          style={{ transition: "stroke-dashoffset 0.5s ease-in-out" }}
        />
      </svg>
      <span className={`${textSize} font-bold ${getScoreColor(score)}`}>
        {score}
      </span>
    </div>
  );
}

function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const config = {
    strong_yes: { label: "Strong Yes", variant: "default" as const, icon: CheckCircle, className: "bg-green-600 text-white" },
    yes: { label: "Yes", variant: "default" as const, icon: TrendingUp, className: "bg-green-500/80 text-white" },
    maybe: { label: "Maybe", variant: "secondary" as const, icon: AlertTriangle, className: "bg-amber-500 text-white" },
    no: { label: "No", variant: "destructive" as const, icon: XCircle, className: "" },
  };

  const { label, icon: Icon, className } = config[recommendation as keyof typeof config] || config.maybe;

  return (
    <Badge variant="secondary" className={`gap-1 ${className}`} data-testid="badge-ai-recommendation">
      <Icon className="w-3 h-3" strokeWidth={2} />
      {label}
    </Badge>
  );
}

export function AiScoreCard({
  passId,
  passCandidateId,
  candidateName,
  existingScore,
  existingDetails,
  onScoreUpdate,
  compact = false,
}: AiScoreCardProps) {
  const { toast } = useToast();

  let parsedDetails: AiScoreDetails | null = null;
  if (existingDetails) {
    try {
      parsedDetails = JSON.parse(existingDetails);
    } catch {
      parsedDetails = null;
    }
  }

  const scoreMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai/score-candidate", {
        passId,
        passCandidateId,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Scoring Complete", description: `${candidateName} scored ${data.overallScore}%` });
      queryClient.invalidateQueries({ queryKey: ["/api/passes", String(passId), "candidates", "pipeline"] });
      onScoreUpdate?.();
    },
    onError: (error: any) => {
      const message = error.message || "Failed to score candidate";
      toast({ title: "Scoring Failed", description: message, variant: "destructive" });
    },
  });

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {existingScore ? (
          <div className="flex items-center gap-2">
            <ScoreGauge score={existingScore} size="small" />
            {parsedDetails?.recommendation && (
              <RecommendationBadge recommendation={parsedDetails.recommendation} />
            )}
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => scoreMutation.mutate()}
            disabled={scoreMutation.isPending}
            className="rounded-xl gap-1.5 text-xs"
            data-testid={`button-score-candidate-${passCandidateId}`}
          >
            {scoreMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" strokeWidth={2} />
            )}
            Score
          </Button>
        )}
      </div>
    );
  }

  if (scoreMutation.isPending) {
    return (
      <GlassCard className="p-4" data-testid="ai-score-loading">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary animate-pulse" strokeWidth={2} />
          </div>
          <div>
            <h4 className="text-sm font-medium">Analysis in Progress</h4>
            <p className="text-xs text-muted-foreground">Evaluating candidate profile...</p>
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-24 w-24 rounded-full mx-auto" />
          <Skeleton className="h-4 w-3/4 mx-auto" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        </div>
      </GlassCard>
    );
  }

  if (!existingScore || !parsedDetails) {
    return (
      <GlassCard className="p-6 text-center" data-testid="ai-score-empty">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8 text-primary/50" strokeWidth={1.5} />
        </div>
        <h4 className="text-sm font-medium mb-2">Score Not Available</h4>
        <p className="text-xs text-muted-foreground mb-4">
          Get a detailed analysis of this candidate's fit for the position.
        </p>
        <Button
          onClick={() => scoreMutation.mutate()}
          disabled={scoreMutation.isPending}
          className="rounded-xl gap-2"
          data-testid={`button-score-candidate-${passCandidateId}`}
        >
          <Sparkles className="w-4 h-4" strokeWidth={2} />
          Generate Score
        </Button>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-4" data-testid="ai-score-card">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Award className="w-4 h-4 text-primary" strokeWidth={2} />
          </div>
          <div>
            <h4 className="text-sm font-medium flex items-center gap-2">
              Compatibility Score
              <RecommendationBadge recommendation={parsedDetails.recommendation} />
            </h4>
            <p className="text-xs text-muted-foreground">Automated Analysis</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => scoreMutation.mutate()}
          disabled={scoreMutation.isPending}
          className="rounded-xl"
          data-testid="button-rescore"
        >
          {scoreMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" strokeWidth={2} />
          )}
        </Button>
      </div>

      <div className="flex items-center gap-6 mb-4">
        <ScoreGauge score={existingScore} />
        <div className="flex-1 space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Skills Match</span>
              <span className="font-medium">{parsedDetails.skillsMatch}%</span>
            </div>
            <Progress value={parsedDetails.skillsMatch} className="h-2" />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Experience Match</span>
              <span className="font-medium">{parsedDetails.experienceMatch}%</span>
            </div>
            <Progress value={parsedDetails.experienceMatch} className="h-2" />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Culture Fit</span>
              <span className="font-medium">{parsedDetails.cultureMatch}%</span>
            </div>
            <Progress value={parsedDetails.cultureMatch} className="h-2" />
          </div>
        </div>
      </div>

      {parsedDetails.summary && (
        <p className="text-sm text-muted-foreground bg-muted/30 rounded-xl p-3 mb-4" data-testid="text-ai-summary">
          {parsedDetails.summary}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h5 className="text-xs font-medium mb-2 flex items-center gap-1 text-green-600 dark:text-green-400">
            <CheckCircle className="w-3 h-3" strokeWidth={2} />
            Strengths
          </h5>
          <ul className="space-y-1">
            {parsedDetails.strengths?.slice(0, 3).map((strength, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="w-1 h-1 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                {strength}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h5 className="text-xs font-medium mb-2 flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3 h-3" strokeWidth={2} />
            Areas to Explore
          </h5>
          <ul className="space-y-1">
            {parsedDetails.improvements?.slice(0, 2).map((improvement, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                {improvement}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </GlassCard>
  );
}

export function AiScoreBadge({ 
  score, 
  onClick,
  showButton = false 
}: { 
  score?: number | null; 
  onClick?: () => void;
  showButton?: boolean;
}) {
  if (!score && !showButton) return null;

  if (!score && showButton) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        className="rounded-full gap-1 text-xs px-2 py-0.5 h-6"
        data-testid="button-score-badge"
      >
        <Sparkles className="w-3 h-3" strokeWidth={2} />
        Score
      </Button>
    );
  }

  const getScoreClass = (score: number) => {
    if (score >= 80) return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800";
    if (score >= 60) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800";
    if (score >= 40) return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800";
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800";
  };

  return (
    <span 
      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border ${getScoreClass(score!)}`}
      data-testid="badge-ai-score"
    >
      <Sparkles className="w-2.5 h-2.5" strokeWidth={2} />
      {score}%
    </span>
  );
}
