import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  FileText, CheckCircle, Clock, Lock, AlertCircle,
  Upload, Download, Building2, User, Briefcase,
  CreditCard, Laptop, GraduationCap, Shield, Heart,
  ChevronRight, Send, FileCheck, Calendar, MapPin
} from "lucide-react";
import type { OnboardingRecord, OnboardingStageProgress, Candidate, Pass, Offer } from "@shared/schema";

const ONBOARDING_STAGES = [
  { number: 1, name: "Document Collection", icon: FileText, description: "Submit required personal and professional documents" },
  { number: 2, name: "Medical Examination", icon: Heart, description: "Complete pre-employment medical checkup" },
  { number: 3, name: "Visa Processing", icon: Shield, description: "Visa application and processing" },
  { number: 4, name: "Contract Generation", icon: FileCheck, description: "Review and sign employment contract" },
  { number: 5, name: "Emirates ID Application", icon: CreditCard, description: "Apply for Emirates ID" },
  { number: 6, name: "Bank Account Setup", icon: Building2, description: "Open corporate bank account for salary" },
  { number: 7, name: "IT Setup & Access", icon: Laptop, description: "Email, system access, and equipment" },
  { number: 8, name: "Orientation & Training", icon: GraduationCap, description: "Company orientation and role-specific training" },
  { number: 9, name: "Department Onboarding", icon: Briefcase, description: "Team introduction and workspace setup" }
];

interface OnboardingPassData {
  onboardingLink: {
    id: number;
    token: string;
    onboardingRecordId: number;
    isActive: boolean;
    expiresAt: string | null;
  };
  onboardingRecord: OnboardingRecord;
  stageProgress: OnboardingStageProgress[];
  candidate: Candidate;
  pass: Pass;
  offer: Offer | null;
}

interface OnboardingPortalPassProps {
  token: string;
}

export default function OnboardingPortalPass({ token }: OnboardingPortalPassProps) {
  const { toast } = useToast();
  const [expandedStage, setExpandedStage] = useState<string | undefined>(undefined);
  const [showContractDialog, setShowContractDialog] = useState(false);
  const [signatureName, setSignatureName] = useState("");

  const { data, isLoading, error } = useQuery<OnboardingPassData>({
    queryKey: [`/api/onboarding-portal/${token}`],
  });

  const completeTaskMutation = useMutation({
    mutationFn: ({ stageNumber, taskId }: { stageNumber: number; taskId: string }) =>
      apiRequest("POST", `/api/onboarding-portal/${token}/complete-task`, { stageNumber, taskId }),
    onSuccess: () => {
      toast({ title: "Task completed!" });
      queryClient.invalidateQueries({ queryKey: [`/api/onboarding-portal/${token}`] });
    },
    onError: () => toast({ title: "Failed to complete task", variant: "destructive" })
  });

  const signContractMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/onboarding-portal/${token}/sign-contract`, { signatureName }),
    onSuccess: () => {
      toast({ title: "Contract signed successfully!" });
      setShowContractDialog(false);
      queryClient.invalidateQueries({ queryKey: [`/api/onboarding-portal/${token}`] });
    },
    onError: () => toast({ title: "Failed to sign contract", variant: "destructive" })
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: ({ stageNumber, docType, fileName }: { stageNumber: number; docType: string; fileName: string }) =>
      apiRequest("POST", `/api/onboarding-portal/${token}/upload-document`, { stageNumber, docType, fileName }),
    onSuccess: () => {
      toast({ title: "Document uploaded!" });
      queryClient.invalidateQueries({ queryKey: [`/api/onboarding-portal/${token}`] });
    },
    onError: () => toast({ title: "Failed to upload document", variant: "destructive" })
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading your onboarding journey...</p>
        </div>
      </div>
    );
  }

  if (error || !data || !data.onboardingRecord) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Card className="max-w-md bg-slate-800 border-slate-700">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2 text-white">Invalid or Expired Link</h2>
            <p className="text-slate-400">This onboarding link is no longer valid.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { candidate, pass, offer, stageProgress } = data;

  const getStageStatus = (stageNumber: number): "locked" | "in_progress" | "completed" => {
    const stage = stageProgress.find(s => s.stageNumber === stageNumber);
    if (!stage) {
      if (stageNumber === 1) return "in_progress";
      const prevStage = stageProgress.find(s => s.stageNumber === stageNumber - 1);
      return prevStage?.status === "completed" ? "in_progress" : "locked";
    }
    return stage.status as "locked" | "in_progress" | "completed";
  };

  const completedCount = stageProgress.filter(s => s.status === "completed").length;
  const progressPercent = (completedCount / 9) * 100;

  const StageIcon = ({ stage, status }: { stage: typeof ONBOARDING_STAGES[0]; status: string }) => {
    const Icon = stage.icon;
    if (status === "completed") {
      return <CheckCircle className="w-6 h-6 text-emerald-400" data-testid={`icon-stage-${stage.number}-completed`} />;
    }
    if (status === "locked") {
      return <Lock className="w-6 h-6 text-slate-500" data-testid={`icon-stage-${stage.number}-locked`} />;
    }
    return <Icon className="w-6 h-6 text-emerald-400" data-testid={`icon-stage-${stage.number}-active`} />;
  };

  const getStageContent = (stageNumber: number) => {
    const status = getStageStatus(stageNumber);

    switch (stageNumber) {
      case 1:
        return (
          <div className="space-y-4">
            <p className="text-slate-400 text-sm">Please upload the following documents:</p>
            <div className="grid gap-3">
              {[
                { id: "passport", label: "Passport Copy (Front & Back)", required: true },
                { id: "emirates_id", label: "Emirates ID (if available)", required: false },
                { id: "education", label: "Educational Certificates", required: true },
                { id: "experience", label: "Experience Certificates", required: true },
                { id: "photos", label: "Passport-size Photos (4 copies)", required: true },
              ].map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg" data-testid={`doc-row-${doc.id}`}>
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-200 text-sm">{doc.label}</span>
                    {doc.required && <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-400">Required</Badge>}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="border-slate-600 text-slate-300"
                    onClick={() => uploadDocumentMutation.mutate({ stageNumber: 1, docType: doc.id, fileName: `${doc.id}.pdf` })}
                    disabled={uploadDocumentMutation.isPending || status === "completed"}
                    data-testid={`btn-upload-${doc.id}`}
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    Upload
                  </Button>
                </div>
              ))}
            </div>
            {status !== "completed" && (
              <Button 
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => completeTaskMutation.mutate({ stageNumber: 1, taskId: "documents" })}
                disabled={completeTaskMutation.isPending}
                data-testid="btn-complete-documents"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Mark Documents as Complete
              </Button>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <Heart className="w-5 h-5 text-red-400 mt-0.5" />
                <div>
                  <h4 className="text-slate-200 font-medium">Medical Examination</h4>
                  <p className="text-slate-400 text-sm mt-1">
                    Please visit the designated medical center for your pre-employment checkup.
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Building2 className="w-4 h-4" />
                      <span>SEHA Medical Center, Abu Dhabi</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <Calendar className="w-4 h-4" />
                      <span>Appointment will be scheduled by HR</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {status !== "completed" && (
              <Button 
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => completeTaskMutation.mutate({ stageNumber: 2, taskId: "medical" })}
                disabled={completeTaskMutation.isPending}
                data-testid="btn-complete-medical"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Confirm Medical Complete
              </Button>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-400 mt-0.5" />
                <div>
                  <h4 className="text-slate-200 font-medium">Visa Processing</h4>
                  <p className="text-slate-400 text-sm mt-1">
                    Your visa application is being processed. Current status:
                  </p>
                  <Badge className="mt-2 bg-amber-500/20 text-amber-400 border-amber-500/50" data-testid="badge-visa-status">
                    <Clock className="w-3 h-3 mr-1" />
                    Processing
                  </Badge>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-slate-400 text-sm">Required for visa:</p>
              <div className="grid gap-2">
                <div className="flex items-center gap-2 text-slate-300 text-sm">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Passport submitted
                </div>
                <div className="flex items-center gap-2 text-slate-300 text-sm">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Medical fitness certificate
                </div>
                <div className="flex items-center gap-2 text-slate-300 text-sm">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Visa stamping pending
                </div>
              </div>
            </div>
            {status !== "completed" && (
              <Button 
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => completeTaskMutation.mutate({ stageNumber: 3, taskId: "visa" })}
                disabled={completeTaskMutation.isPending}
                data-testid="btn-complete-visa"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Confirm Visa Received
              </Button>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <FileCheck className="w-5 h-5 text-emerald-400 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-slate-200 font-medium">Employment Contract</h4>
                  <p className="text-slate-400 text-sm mt-1">
                    Review and sign your employment contract.
                  </p>
                  {offer && (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-slate-500">Position:</span>
                        <p className="text-slate-200">{pass.positionTitle}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Salary:</span>
                        <p className="text-slate-200">{offer.salaryCurrency} {offer.salary?.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Start Date:</span>
                        <p className="text-slate-200">{offer.startDate || "TBD"}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Contract Type:</span>
                        <p className="text-slate-200">{offer.contractType || "Full-time"}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1 border-slate-600 text-slate-300"
                data-testid="btn-download-contract"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Contract
              </Button>
              {status !== "completed" && (
                <Button 
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => setShowContractDialog(true)}
                  data-testid="btn-sign-contract"
                >
                  <FileCheck className="w-4 h-4 mr-2" />
                  Sign Contract
                </Button>
              )}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <CreditCard className="w-5 h-5 text-purple-400 mt-0.5" />
                <div>
                  <h4 className="text-slate-200 font-medium">Emirates ID Application</h4>
                  <p className="text-slate-400 text-sm mt-1">
                    Apply for your Emirates ID at the nearest ICP center.
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-300">
                      <MapPin className="w-4 h-4" />
                      <span>ICP Service Center, Abu Dhabi Mall</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {status !== "completed" && (
              <Button 
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => completeTaskMutation.mutate({ stageNumber: 5, taskId: "emirates_id" })}
                disabled={completeTaskMutation.isPending}
                data-testid="btn-complete-emirates-id"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Confirm Emirates ID Received
              </Button>
            )}
          </div>
        );

      case 6:
        return (
          <div className="space-y-4">
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <Building2 className="w-5 h-5 text-cyan-400 mt-0.5" />
                <div>
                  <h4 className="text-slate-200 font-medium">Bank Account Setup</h4>
                  <p className="text-slate-400 text-sm mt-1">
                    Open a salary account with our partner bank.
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Building2 className="w-4 h-4" />
                      <span>First Abu Dhabi Bank (FAB)</span>
                    </div>
                    <p className="text-slate-400 text-xs">Bring your passport, visa, and Emirates ID</p>
                  </div>
                </div>
              </div>
            </div>
            {status !== "completed" && (
              <Button 
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => completeTaskMutation.mutate({ stageNumber: 6, taskId: "bank" })}
                disabled={completeTaskMutation.isPending}
                data-testid="btn-complete-bank"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Confirm Bank Account Opened
              </Button>
            )}
          </div>
        );

      case 7:
        return (
          <div className="space-y-4">
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <Laptop className="w-5 h-5 text-orange-400 mt-0.5" />
                <div>
                  <h4 className="text-slate-200 font-medium">IT Setup & Access</h4>
                  <p className="text-slate-400 text-sm mt-1">
                    Your IT equipment and access will be prepared.
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-300">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      Corporate email setup
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      System access credentials
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <Clock className="w-4 h-4 text-amber-400" />
                      Laptop & equipment issuance
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {status !== "completed" && (
              <Button 
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => completeTaskMutation.mutate({ stageNumber: 7, taskId: "it_setup" })}
                disabled={completeTaskMutation.isPending}
                data-testid="btn-complete-it"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Confirm IT Setup Complete
              </Button>
            )}
          </div>
        );

      case 8:
        return (
          <div className="space-y-4">
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <GraduationCap className="w-5 h-5 text-yellow-400 mt-0.5" />
                <div>
                  <h4 className="text-slate-200 font-medium">Orientation & Training</h4>
                  <p className="text-slate-400 text-sm mt-1">
                    Complete company orientation and required trainings.
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Clock className="w-4 h-4 text-amber-400" />
                      Company orientation (2 hours)
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <Clock className="w-4 h-4 text-amber-400" />
                      Safety & compliance training
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <Clock className="w-4 h-4 text-amber-400" />
                      Role-specific training
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {status !== "completed" && (
              <Button 
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => completeTaskMutation.mutate({ stageNumber: 8, taskId: "training" })}
                disabled={completeTaskMutation.isPending}
                data-testid="btn-complete-training"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Confirm Training Complete
              </Button>
            )}
          </div>
        );

      case 9:
        return (
          <div className="space-y-4">
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <Briefcase className="w-5 h-5 text-emerald-400 mt-0.5" />
                <div>
                  <h4 className="text-slate-200 font-medium">Department Onboarding</h4>
                  <p className="text-slate-400 text-sm mt-1">
                    Final steps to get you started in your new role.
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-300">
                      <User className="w-4 h-4" />
                      Meet your team
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <MapPin className="w-4 h-4" />
                      Workspace assignment
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <Briefcase className="w-4 h-4" />
                      Initial project assignment
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {status !== "completed" && (
              <Button 
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => completeTaskMutation.mutate({ stageNumber: 9, taskId: "department" })}
                disabled={completeTaskMutation.isPending}
                data-testid="btn-complete-onboarding"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Complete Onboarding
              </Button>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white" data-testid="text-header-title">Welcome, {candidate.name}</h1>
              <p className="text-slate-400 mt-1">Your onboarding journey with HirePass Demo Company</p>
            </div>
            <div className="text-right">
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50" data-testid="badge-position">
                <Briefcase className="w-3 h-3 mr-1" />
                {pass.positionTitle}
              </Badge>
              <p className="text-slate-500 text-sm mt-1">{pass.department}</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-300 text-sm font-medium">Onboarding Progress</span>
              <span className="text-emerald-400 text-sm font-medium" data-testid="text-progress-percent">{Math.round(progressPercent)}%</span>
            </div>
            <Progress value={progressPercent} className="h-2 bg-slate-700" data-testid="progress-bar" />
            <p className="text-slate-500 text-xs mt-1">{completedCount} of 9 stages completed</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Stage Timeline */}
        <div className="relative">
          {/* Vertical Line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-700" />

          <Accordion 
            type="single" 
            collapsible 
            value={expandedStage}
            onValueChange={setExpandedStage}
            className="space-y-4"
          >
            {ONBOARDING_STAGES.map((stage) => {
              const status = getStageStatus(stage.number);
              const isLocked = status === "locked";

              return (
                <AccordionItem 
                  key={stage.number} 
                  value={`stage-${stage.number}`}
                  className={`
                    border-0 rounded-xl overflow-hidden
                    ${status === "completed" 
                      ? "bg-emerald-900/20 border border-emerald-800/50" 
                      : status === "in_progress"
                        ? "bg-slate-800 border border-slate-700"
                        : "bg-slate-800/50 border border-slate-700/50"
                    }
                  `}
                  disabled={isLocked}
                  data-testid={`accordion-stage-${stage.number}`}
                >
                  <AccordionTrigger 
                    className={`
                      px-4 py-4 hover:no-underline
                      ${isLocked ? "cursor-not-allowed opacity-60" : ""}
                    `}
                    disabled={isLocked}
                    data-testid={`btn-expand-stage-${stage.number}`}
                  >
                    <div className="flex items-center gap-4 w-full">
                      {/* Stage Number Circle */}
                      <div className={`
                        relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2
                        ${status === "completed" 
                          ? "bg-emerald-600 border-emerald-500" 
                          : status === "in_progress"
                            ? "bg-slate-700 border-emerald-500"
                            : "bg-slate-800 border-slate-600"
                        }
                      `} data-testid={`circle-stage-${stage.number}`}>
                        <StageIcon stage={stage} status={status} />
                      </div>

                      {/* Stage Info */}
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-medium ${isLocked ? "text-slate-500" : "text-white"}`}>
                            Stage {stage.number}: {stage.name}
                          </span>
                          {status === "completed" && (
                            <Badge className="bg-emerald-500/20 text-emerald-400 text-xs" data-testid={`badge-complete-${stage.number}`}>
                              Complete
                            </Badge>
                          )}
                          {status === "in_progress" && (
                            <Badge className="bg-amber-500/20 text-amber-400 text-xs" data-testid={`badge-progress-${stage.number}`}>
                              In Progress
                            </Badge>
                          )}
                        </div>
                        <p className={`text-sm ${isLocked ? "text-slate-600" : "text-slate-400"}`}>
                          {stage.description}
                        </p>
                      </div>

                      {/* Chevron */}
                      {!isLocked && (
                        <ChevronRight className="w-5 h-5 text-slate-400 transition-transform duration-200" />
                      )}
                    </div>
                  </AccordionTrigger>

                  {!isLocked && (
                    <AccordionContent className="px-4 pb-4 pt-0">
                      <div className="ml-16 pl-4 border-l border-slate-700">
                        {getStageContent(stage.number)}
                      </div>
                    </AccordionContent>
                  )}
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>

        {/* Completion Card */}
        {completedCount === 9 && (
          <Card className="mt-8 bg-gradient-to-r from-emerald-900/50 to-slate-800 border-emerald-700" data-testid="card-onboarding-complete">
            <CardContent className="pt-6 text-center">
              <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Onboarding Complete!</h2>
              <p className="text-slate-300">
                Congratulations! You have completed all onboarding steps.
                Welcome to the HirePass Demo Company team!
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Contract Signing Dialog */}
      <Dialog open={showContractDialog} onOpenChange={setShowContractDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Sign Employment Contract</DialogTitle>
            <DialogDescription className="text-slate-400">
              By signing, you agree to the terms and conditions of your employment contract.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-slate-700/50 p-4 rounded-lg text-sm text-slate-300">
              <p>I hereby confirm that:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-400">
                <li>I have read and understood the employment contract</li>
                <li>All information provided is accurate and complete</li>
                <li>I agree to abide by company policies and procedures</li>
              </ul>
            </div>
            
            <div>
              <Label htmlFor="signature" className="text-slate-300">Type your full name to sign:</Label>
              <Input 
                id="signature" 
                placeholder={candidate.name}
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                className="mt-2 bg-slate-700 border-slate-600 text-white"
                data-testid="input-signature"
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowContractDialog(false)}
              className="border-slate-600 text-slate-300"
              data-testid="btn-cancel-contract"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => signContractMutation.mutate()}
              disabled={signContractMutation.isPending || !signatureName.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="btn-confirm-sign-contract"
            >
              {signContractMutation.isPending ? "Signing..." : "Sign Contract"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

