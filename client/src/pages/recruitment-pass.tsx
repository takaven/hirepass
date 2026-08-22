import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { format } from "date-fns";
import {
  ArrowLeft,
  Printer,
  Building2,
  MapPin,
  Calendar,
  Users,
  Briefcase,
  Clock,
  FileText,
  User,
  CheckCircle2,
  Star,
  Search,
  Filter,
  Download,
  Upload,
  Plus,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Send,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Pass, Manager, Candidate, Interview } from "@shared/schema";

interface PassPosition {
  id: number;
  passId: number;
  positionTitle: string;
  headcount: number;
  experienceMin: number | null;
  experienceMax: number | null;
  salaryRangeMin: number | null;
  salaryRangeMax: number | null;
  salaryCurrency: string;
  requirements: string | null;
}

interface PassCandidate {
  id: number;
  passId: number;
  candidateId: number;
  status: string | null;
  aiRank: number | null;
  aiScore: number | null;
  aiBrief: string | null;
  positionId: number | null;
  candidate: Candidate;
}

interface RecruitmentPassProps {
  passIdParam?: string;
  params?: { id?: string };
}

type TabType = "request" | "screening" | "interviews" | "decision" | "analytics";

export default function RecruitmentPass({ passIdParam, params: propsParams }: RecruitmentPassProps = {}) {
  const [, routeParams] = useRoute("/passes/:id/pass");
  const numericId = propsParams?.id || routeParams?.id;
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState<TabType>("request");
  const [selectedPosition, setSelectedPosition] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCandidates, setSelectedCandidates] = useState<number[]>([]);
  const [positionFilter, setPositionFilter] = useState("all");
  const [interviewModalOpen, setInterviewModalOpen] = useState(false);
  
  const useCleanId = !!passIdParam;
  const queryUrl = useCleanId 
    ? `/api/passes/lookup/${passIdParam}`
    : `/api/passes/${numericId}`;
  
  const getDisplayPassId = (dbPassId: string) => {
    if (passIdParam) return passIdParam;
    return dbPassId.startsWith("BAYN-") ? dbPassId : `BAYN-${dbPassId}`;
  };

  const { data: pass, isLoading: passLoading } = useQuery<Pass>({
    queryKey: useCleanId ? ["/api/passes/lookup", passIdParam] : ["/api/passes", numericId],
    enabled: useCleanId ? !!passIdParam : !!numericId,
  });

  const { data: positions } = useQuery<PassPosition[]>({
    queryKey: ["/api/passes", pass?.id, "positions"],
    enabled: !!pass?.id,
  });

  const { data: passCandidates } = useQuery<PassCandidate[]>({
    queryKey: ["/api/passes", pass?.id, "candidates"],
    enabled: !!pass?.id,
  });

  const { data: interviews } = useQuery<Interview[]>({
    queryKey: ["/api/interviews"],
  });

  const { data: managers } = useQuery<Manager[]>({
    queryKey: ["/api/managers"],
  });

  const hiringManager = managers?.find(m => m.id === pass?.hiringManagerId);
  const passInterviews = interviews?.filter(i => 
    passCandidates?.some(pc => pc.id === i.passCandidateId)
  ) || [];

  const handlePrint = () => {
    window.print();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new": return "bg-neutral-100 text-neutral-600";
      case "screening": return "bg-blue-50 text-blue-600";
      case "shortlisted": return "bg-purple-50 text-purple-600";
      case "interview": return "bg-amber-50 text-amber-600";
      case "offer": return "bg-emerald-50 text-emerald-600";
      case "hired": return "bg-green-500 text-white";
      case "rejected": return "bg-red-50 text-red-600";
      default: return "bg-neutral-100 text-neutral-600";
    }
  };

  const handleSelectCandidate = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedCandidates([...selectedCandidates, id]);
    } else {
      setSelectedCandidates(selectedCandidates.filter(c => c !== id));
    }
  };

  const filteredCandidates = passCandidates?.filter(pc => {
    const matchesSearch = pc.candidate.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPosition = positionFilter === "all" || 
      (positions && pc.positionId === positions[parseInt(positionFilter)]?.id);
    return matchesSearch && matchesPosition;
  }) || [];

  const topCandidate = passCandidates?.sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0))[0];

  const currentPosition = positions?.[selectedPosition] || {
    positionTitle: pass?.positionTitle || "",
    headcount: pass?.headcount || 1,
    experienceMin: pass?.experienceMin,
    experienceMax: pass?.experienceMax,
    salaryRangeMin: pass?.salaryRangeMin,
    salaryRangeMax: pass?.salaryRangeMax,
  };

  if (passLoading) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <Skeleton className="h-[800px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!pass) {
    return (
      <div className="max-w-6xl mx-auto p-8 text-center">
        <FileText className="w-16 h-16 mx-auto text-muted-foreground/30" strokeWidth={1} />
        <h3 className="mt-4 text-lg font-medium">Pass not found</h3>
        <Link href="/passes">
          <Button variant="outline" className="mt-4 rounded-xl">
            Back to Passes
          </Button>
        </Link>
      </div>
    );
  }

  const tabs = [
    { id: "request" as TabType, label: "Request", icon: FileText },
    { id: "screening" as TabType, label: "Screening", icon: Users },
    { id: "interviews" as TabType, label: "Interviews", icon: Calendar },
    { id: "decision" as TabType, label: "Decision", icon: CheckCircle2 },
    { id: "analytics" as TabType, label: "Analytics", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-[#EDF1F7]">
      {/* Print Controls - Compact */}
      <div className="print:hidden sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-slate-200 px-4 py-2">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
          <Link href={`/passes/${pass?.id}`}>
            <Button variant="ghost" size="sm" className="rounded-md text-slate-600 h-8 w-8 p-0" data-testid="button-back-from-pass">
              <ArrowLeft className="w-4 h-4" strokeWidth={2} />
            </Button>
          </Link>
          <Button 
            variant="outline" 
            size="sm"
            className="rounded-md gap-1.5 border-slate-300 text-slate-700 h-8 text-xs"
            onClick={handlePrint}
            data-testid="button-print-pass"
          >
            <Printer className="w-3.5 h-3.5" strokeWidth={2} />
            Print Pass
          </Button>
        </div>
      </div>

      {/* Main Content - Compact */}
      <div className="max-w-5xl mx-auto px-4 py-4 print:p-0 print:max-w-none">
        {/* Header - Compact Navy Theme */}
        <div className="bg-white border-l-4 border-l-[#1F3B58] rounded-md shadow-sm p-4 mb-4 print:rounded-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1">
                <Building2 className="w-3.5 h-3.5" strokeWidth={2} />
                HirePass Demo Company
              </div>
              <h1 className="text-2xl font-light tracking-wide text-[#1F3B58]">RECRUITMENT PASS</h1>
              <p className="text-slate-500 text-sm font-light">Official Hiring Authorization Document</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
              <div className="text-slate-500 text-[10px] uppercase tracking-wide">Pass Number</div>
              <div className="text-base font-medium text-[#1F3B58] font-mono">{getDisplayPassId(pass.passId)}</div>
            </div>
          </div>
        </div>

        {/* Tab Navigation - Compact */}
        <div className="bg-white rounded-md shadow-sm border border-slate-200 mb-4 print:hidden">
          <div className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? "text-[#1F3B58] border-b-[#1F3B58] bg-slate-50"
                    : "text-slate-400 border-b-transparent hover:text-slate-600 hover:bg-slate-50"
                }`}
                data-testid={`tab-${tab.id}`}
              >
                <tab.icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* REQUEST TAB */}
        {activeTab === "request" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left Column - Request Details */}
            <div className="lg:col-span-2 space-y-4">
              {/* Position Selector */}
              <div className="bg-white border-l-4 border-l-[#1F3B58] rounded-md shadow-sm p-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center">
                    <Briefcase className="w-4 h-4 text-[#1F3B58]" strokeWidth={1.5} />
                  </div>
                  <h2 className="text-base font-medium text-[#1F3B58]">Request Details</h2>
                </div>

                {/* Position Tabs */}
                <div className="flex gap-2 mb-4">
                  {(positions && positions.length > 0 ? positions : [{ positionTitle: pass.positionTitle, id: 0 }]).map((pos, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedPosition(idx)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        selectedPosition === idx
                          ? "bg-[#1F3B58] text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                      data-testid={`position-${idx}`}
                    >
                      Position {idx + 1}
                    </button>
                  ))}
                </div>

                {/* Position Details */}
                <div className="space-y-0">
                  {[
                    { label: "Job Title", value: currentPosition.positionTitle || pass.positionTitle },
                    { label: "Recruitment Reference", value: pass.passId || `REQ-${pass.id}` },
                    { label: "Department", value: pass.department || "Engineering / R&D" },
                    { label: "Location", value: pass.location || "Abu Dhabi, UAE" },
                    { label: "Employment Type", value: pass.employmentType || "Full-time" },
                    { label: "Salary Range", value: pass.salaryRangeMax ? `AED ${pass.salaryRangeMin?.toLocaleString()} - ${pass.salaryRangeMax?.toLocaleString()}` : "Competitive" },
                    { label: "Experience Required", value: pass.experienceMin ? `${pass.experienceMin}-${pass.experienceMax} years` : "2-4 years" },
                  ].map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center py-3 border-b border-slate-100 last:border-0">
                      <span className="text-sm text-slate-500">{item.label}</span>
                      <span className="text-sm font-medium text-[#1F3B58]">{item.value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-3">
                    <span className="text-sm text-slate-500">Approval Status</span>
                    <Badge className={`${pass.status === 'approved' ? 'bg-slate-100 text-[#1F3B58]' : 'bg-amber-50 text-amber-700'} border-0`}>
                      {pass.status ? pass.status.charAt(0).toUpperCase() + pass.status.slice(1) : 'Draft'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Hiring Manager */}
              <div className="bg-white border-l-4 border-l-[#1F3B58] rounded-md shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center">
                    <User className="w-4 h-4 text-[#1F3B58]" strokeWidth={1.5} />
                  </div>
                  <h2 className="text-base font-medium text-[#1F3B58]">Hiring Manager</h2>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm">
                    <span className="text-[#1F3B58] font-medium">
                      {hiringManager?.name?.split(' ').map(n => n[0]).join('') || 'HM'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#1F3B58]">{hiringManager?.name || "Hiring Manager"}</p>
                    <p className="text-xs text-slate-500">{hiringManager?.jobTitle || "Department Head"}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Manager Actions */}
            <div className="space-y-4">
              <div className="bg-white border-l-4 border-l-[#1F3B58] rounded-md shadow-sm p-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-[#1F3B58]" strokeWidth={1.5} />
                  </div>
                  <h2 className="text-base font-medium text-[#1F3B58]">Manager Actions</h2>
                </div>

                <div className="space-y-3">
                  {/* Requisition Status */}
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Recruitment Requisition</label>
                    <Select defaultValue="approved">
                      <SelectTrigger className="mt-1 rounded-md border-slate-300 h-8 text-sm" data-testid="select-requisition">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* JD Status */}
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Job Description</label>
                    <Select defaultValue="finalized">
                      <SelectTrigger className="mt-1 rounded-md border-slate-300 h-8 text-sm" data-testid="select-jd-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="finalized">Finalized</SelectItem>
                        <SelectItem value="review">Under Review</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Interview Setup */}
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Interview Setup</label>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="w-full mt-1 rounded-md justify-between border-slate-300 h-8 text-sm"
                      onClick={() => setInterviewModalOpen(true)}
                      data-testid="btn-configure-interview"
                    >
                      Configure
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SCREENING TAB */}
        {activeTab === "screening" && (
          <div className="bg-white border-l-4 border-l-[#1F3B58] rounded-md shadow-sm overflow-hidden">
            {/* Header - Compact */}
            <div className="p-4 border-b border-slate-100">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center">
                    <Users className="w-4 h-4 text-[#1F3B58]" strokeWidth={1.5} />
                  </div>
                  <h2 className="text-base font-medium text-[#1F3B58]">Candidates</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="rounded-md gap-1.5 border-slate-300 h-7 text-xs" data-testid="btn-import">
                    <Upload className="w-3.5 h-3.5" />
                    Import
                  </Button>
                  <Button size="sm" className="rounded-md gap-1.5 bg-[#1F3B58] hover:bg-[#2a4a6b] h-7 text-xs" data-testid="btn-add-candidate">
                    <Plus className="w-3.5 h-3.5" />
                    Add Candidate
                  </Button>
                </div>
              </div>

              {/* Filters - Compact */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1.5">
                  <Button
                    variant={positionFilter === "all" ? "default" : "outline"}
                    size="sm"
                    className={`rounded-full h-7 text-xs px-3 ${positionFilter === "all" ? "bg-[#1F3B58] hover:bg-[#2a4a6b]" : "border-slate-300"}`}
                    onClick={() => setPositionFilter("all")}
                    data-testid="filter-all"
                  >
                    All
                  </Button>
                  {positions?.map((pos, idx) => (
                    <Button
                      key={idx}
                      variant={positionFilter === String(idx) ? "default" : "outline"}
                      size="sm"
                      className={`rounded-full h-7 text-xs px-3 ${positionFilter === String(idx) ? "bg-[#1F3B58] hover:bg-[#2a4a6b]" : "border-slate-300"}`}
                      onClick={() => setPositionFilter(String(idx))}
                      data-testid={`filter-position-${idx}`}
                    >
                      {pos.positionTitle}
                    </Button>
                  ))}
                </div>
                <div className="flex-1" />
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 rounded-md border-slate-200 w-48 h-7 text-xs"
                    data-testid="input-search"
                  />
                </div>
                <Button variant="outline" size="sm" className="rounded-md border-slate-300 h-7 w-7 p-0" data-testid="btn-filter">
                  <Filter className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Table - Compact */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <Checkbox data-testid="checkbox-select-all" />
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wide">Rank</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wide">Name</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wide">Position</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wide">Score</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wide">Match</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wide">Exp</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wide">Profile</th>
                    <th className="w-10 px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCandidates.length > 0 ? filteredCandidates.map((pc, idx) => (
                    <tr key={pc.id} className="hover:bg-slate-50 transition-colors" data-testid={`row-candidate-${pc.candidate.id}`}>
                      <td className="px-3 py-2">
                        <Checkbox 
                          checked={selectedCandidates.includes(pc.id)}
                          onCheckedChange={(checked) => handleSelectCandidate(pc.id, !!checked)}
                          data-testid={`checkbox-${pc.candidate.id}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs font-medium text-slate-500">#{idx + 1}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-[#1F3B58]">{pc.candidate.name}</p>
                          <Badge className={`${getStatusBadge(pc.status || 'new')} border-0 text-[10px] px-1.5 py-0`}>
                            {(pc.status || 'new').charAt(0).toUpperCase() + (pc.status || 'new').slice(1)}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs text-slate-600">{pc.candidate.currentTitle || "Not specified"}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          <span className="text-xs font-medium text-[#1F3B58]">{pc.aiScore || 0}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 min-w-20">
                          <Progress value={pc.aiScore || 0} className="h-1 flex-1" />
                          <span className="text-[10px] text-slate-500">{pc.aiScore || 0}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs text-slate-600">
                          {pc.candidate.experienceYears ? `${pc.candidate.experienceYears}y` : "3y"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Button variant="ghost" size="sm" className="text-slate-500 text-[10px] h-6 px-2" data-testid={`btn-linkedin-${pc.candidate.id}`}>
                          LinkedIn
                        </Button>
                      </td>
                      <td className="px-3 py-2">
                        <Button variant="ghost" size="sm" className="text-slate-400 h-6 w-6 p-0" data-testid={`btn-more-${pc.candidate.id}`}>
                          <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-slate-500 text-sm">
                        No candidates found. Add candidates to start screening.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* INTERVIEWS TAB */}
        {activeTab === "interviews" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Calendar */}
            <div className="bg-white border-l-4 border-l-[#1F3B58] rounded-md shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-medium text-[#1F3B58]">
                  {format(new Date(), "MMMM yyyy")}
                </h2>
                <div className="flex gap-0.5">
                  <Button variant="ghost" size="sm" className="rounded-md text-slate-600 h-7 w-7 p-0" data-testid="btn-prev-month">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="rounded-md text-slate-600 h-7 w-7 p-0" data-testid="btn-next-month">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              
              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                  <div key={day} className="text-xs font-medium text-slate-400 py-2">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }, (_, i) => {
                  const day = i - new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay() + 1;
                  const isCurrentMonth = day > 0 && day <= new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
                  const isToday = day === new Date().getDate();
                  const hasInterview = passInterviews.some(int => {
                    if (!int.interviewDate) return false;
                    const intDate = new Date(int.interviewDate);
                    return intDate.getDate() === day && intDate.getMonth() === new Date().getMonth();
                  });
                  
                  return (
                    <div
                      key={i}
                      className={`aspect-square flex flex-col items-center justify-center rounded-md text-sm relative ${
                        !isCurrentMonth ? "text-slate-300" :
                        isToday ? "bg-[#1F3B58] text-white font-medium" :
                        "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {isCurrentMonth && day}
                      {hasInterview && isCurrentMonth && (
                        <div className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-[#1F3B58]" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scheduled Interviews */}
            <div className="bg-white border-l-4 border-l-[#1F3B58] rounded-md shadow-sm p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-[#1F3B58]" strokeWidth={1.5} />
                </div>
                <h2 className="text-base font-medium text-[#1F3B58]">Scheduled Interviews</h2>
              </div>

              <div className="space-y-2">
                {passInterviews.length > 0 ? passInterviews.map((interview) => {
                  const passCandidate = passCandidates?.find(pc => pc.id === interview.passCandidateId);
                  const candidate = passCandidate?.candidate;
                  return (
                    <div key={interview.id} className="p-3 rounded-md border border-slate-200 hover:border-slate-300 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-[#1F3B58]">{candidate?.name || "Candidate"}</p>
                          <p className="text-xs text-slate-500">{pass.positionTitle}</p>
                        </div>
                        <Badge className="bg-slate-100 text-[#1F3B58] border-0 text-[10px] px-1.5">{interview.roundName || "Technical"}</Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {interview.interviewDate ? format(new Date(interview.interviewDate), "MMM dd") : "TBD"}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {interview.interviewDate ? format(new Date(interview.interviewDate), "h:mm a") : "TBD"}
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="p-6 text-center text-slate-500 text-sm">
                    <Calendar className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p>No interviews scheduled</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* DECISION TAB */}
        {activeTab === "decision" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Decision Summary */}
            <div className="bg-white border-l-4 border-l-[#1F3B58] rounded-md shadow-sm p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-[#1F3B58]" strokeWidth={1.5} />
                </div>
                <h2 className="text-base font-medium text-[#1F3B58]">Decision Summary</h2>
              </div>

              {/* Top Candidate */}
              <div className="mb-4">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-2">Top Candidate</p>
                {topCandidate ? (
                  <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-[#1F3B58] flex items-center justify-center text-white text-sm font-medium">
                        {topCandidate.candidate.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#1F3B58]">{topCandidate.candidate.name}</p>
                        <p className="text-xs text-slate-600">{topCandidate.candidate.currentTitle || pass.positionTitle}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-md border border-slate-200 text-center">
                    <p className="text-sm text-slate-500">No candidates evaluated yet</p>
                  </div>
                )}
              </div>

              {/* Scores */}
              <div className="space-y-0">
                {[
                  { label: "Technical Score", value: topCandidate ? `${((topCandidate.aiScore || 0) / 10).toFixed(1)} / 10` : "- / 10" },
                  { label: "Cultural Fit", value: "9.0 / 10" },
                  { label: "Communication", value: "9.0 / 10" },
                  { label: "Leadership", value: "9.3 / 10" },
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                    <span className="text-xs text-slate-600">{item.label}</span>
                    <span className="text-xs font-medium text-[#1F3B58]">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Offer Details */}
            <div className="bg-white border-l-4 border-l-[#1F3B58] rounded-md shadow-sm p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-[#1F3B58]" strokeWidth={1.5} />
                </div>
                <h2 className="text-base font-medium text-[#1F3B58]">Offer Details</h2>
              </div>

              <div className="space-y-0 mb-4">
                {[
                  { label: "Position", value: pass.positionTitle },
                  { label: "Salary Offered", value: pass.salaryRangeMax ? `AED ${pass.salaryRangeMax?.toLocaleString()}` : "AED 18,000" },
                  { label: "Start Date", value: "Feb 1, 2025" },
                  { label: "Contract Type", value: "Permanent" },
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                    <span className="text-xs text-slate-500">{item.label}</span>
                    <span className="text-xs font-medium text-[#1F3B58]">{item.value}</span>
                  </div>
                ))}
              </div>

              {/* Benefits */}
              <div className="mb-4">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-2">Benefits</p>
                <div className="flex flex-wrap gap-1.5">
                  {["Health Insurance", "Annual Leave", "Visa Sponsorship", "Training Budget"].map((benefit, idx) => (
                    <Badge key={idx} className="bg-slate-100 text-slate-600 border-0 text-xs font-normal">
                      {benefit}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Offer Status */}
              <div className="mb-4">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-2">Offer Status</p>
                <div className="space-y-1.5">
                  {[
                    { label: "Draft", completed: true },
                    { label: "Pending Approval", completed: true },
                    { label: "Approved", completed: false, current: true },
                    { label: "Sent to Candidate", completed: false },
                  ].map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                        step.completed ? "bg-[#1F3B58] text-white" : 
                        step.current ? "border-2 border-[#1F3B58] bg-white" : 
                        "bg-slate-200"
                      }`}>
                        {step.completed && <Check className="w-2.5 h-2.5" />}
                      </div>
                      <span className={`text-xs ${step.completed || step.current ? "text-[#1F3B58]" : "text-slate-400"}`}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <Button size="sm" className="w-full rounded-md gap-1.5 bg-[#1F3B58] hover:bg-[#2a4a6b] h-8 text-xs" data-testid="btn-send-offer">
                <Send className="w-3.5 h-3.5" />
                Send Offer Letter
              </Button>
            </div>
          </div>
        )}

        {/* ANALYTICS TAB */}
        {activeTab === "analytics" && (
          <div className="bg-white border-l-4 border-l-[#1F3B58] rounded-md shadow-sm p-8 text-center">
            <BarChart3 className="w-12 h-12 mx-auto text-slate-300 mb-3" strokeWidth={1} />
            <h3 className="text-base font-medium text-[#1F3B58] mb-1">Analytics Dashboard</h3>
            <p className="text-sm text-slate-500">Coming soon - Track recruitment metrics and performance.</p>
          </div>
        )}
      </div>

      {/* Interview Setup Modal */}
      <Dialog open={interviewModalOpen} onOpenChange={setInterviewModalOpen}>
        <DialogContent className="rounded-md max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-light tracking-wide text-[#1F3B58]">Interview Setup</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-700">Technical Assessment</span>
              <Switch defaultChecked data-testid="switch-tech-assessment" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-700">HR Screening</span>
              <Switch defaultChecked data-testid="switch-hr-screening" />
            </div>
            <div>
              <label className="text-sm text-slate-700 mb-2 block">Interview Format</label>
              <Select defaultValue="in-person">
                <SelectTrigger className="rounded-md border-slate-300" data-testid="select-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in-person">In-person</SelectItem>
                  <SelectItem value="video">Video Call</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-slate-700 mb-2 block">Number of Rounds</label>
              <Select defaultValue="2">
                <SelectTrigger className="rounded-md border-slate-300" data-testid="select-rounds">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Round</SelectItem>
                  <SelectItem value="2">2 Rounds</SelectItem>
                  <SelectItem value="3">3 Rounds</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              className="w-full rounded-md bg-[#1F3B58] hover:bg-[#2a4a6b]"
              onClick={() => {
                setInterviewModalOpen(false);
                toast({ title: "Interview setup saved" });
              }}
              data-testid="btn-save-interview-setup"
            >
              Save Configuration
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

