import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays } from "date-fns";
import { 
  FileText, CheckCircle, XCircle, Users, Calendar as CalendarIcon, 
  Clock, Building2, MapPin, Check, Search, ChevronRight,
  Plus, Star, MoreVertical, Upload, Settings, BarChart3,
  ClipboardList, Send
} from "lucide-react";
import type { Pass, Candidate, PassCandidate, Interview, Manager } from "@shared/schema";

interface ManagerPassData {
  shareLink: { id: number; token: string; passId: number; managerId: number | null; linkType: string; isActive: boolean; };
  pass: Pass & { positions?: any[] };
  candidates: (PassCandidate & { candidate: Candidate })[];
  interviews: Interview[];
  manager: Manager | null;
  interviewSlots: any[];
}

interface ManagerRecruitmentPassProps {
  token: string;
}

export default function ManagerRecruitmentPass({ token }: ManagerRecruitmentPassProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("request");
  const [selectedPosition, setSelectedPosition] = useState(0);
  const [selectedCandidates, setSelectedCandidates] = useState<number[]>([]);
  const [positionFilter, setPositionFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showInterviewSetup, setShowInterviewSetup] = useState(false);
  const [interviewSetup, setInterviewSetup] = useState({
    technicalAssessment: true,
    format: "online",
    rounds: "2",
    dates: [] as Date[],
    additionalInterviewer: "",
  });

  const { data, isLoading, error } = useQuery<ManagerPassData>({
    queryKey: ["/api/manager-pass", token],
    queryFn: () => fetch(`/api/manager-pass/${token}`).then(res => res.json()),
  });

  const shortlistMutation = useMutation({
    mutationFn: (candidateId: number) => apiRequest("POST", `/api/manager-pass/${token}/candidates/${candidateId}/shortlist`),
    onSuccess: () => { toast({ title: "Candidate shortlisted" }); queryClient.invalidateQueries({ queryKey: ["/api/manager-pass", token] }); },
  });

  const rejectMutation = useMutation({
    mutationFn: (candidateId: number) => apiRequest("POST", `/api/manager-pass/${token}/candidates/${candidateId}/reject`, { reason: "Not suitable" }),
    onSuccess: () => { toast({ title: "Candidate rejected" }); queryClient.invalidateQueries({ queryKey: ["/api/manager-pass", token] }); },
  });

  const { positions, daysOpen, topCandidate } = useMemo(() => {
    if (!data?.pass) return { positions: [], daysOpen: 0, topCandidate: null };
    const pass = data.pass;
    const candidates = data.candidates || [];
    
    const sortedCandidates = [...candidates].sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));
    
    return {
      positions: pass.positions || [{ title: pass.positionTitle, id: 1 }],
      daysOpen: pass.dateRequested ? differenceInDays(new Date(), new Date(pass.dateRequested)) : 0,
      topCandidate: sortedCandidates[0] || null,
    };
  }, [data]);

  const filteredCandidates = useMemo(() => {
    if (!data?.candidates) return [];
    let filtered = data.candidates;
    
    if (positionFilter !== "all") {
      filtered = filtered.filter(c => c.candidate.currentTitle?.toLowerCase().includes(positionFilter.toLowerCase()));
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => 
        c.candidate.name.toLowerCase().includes(query) ||
        (c.candidate.email || '').toLowerCase().includes(query)
      );
    }
    
    return filtered.sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));
  }, [data?.candidates, positionFilter, searchQuery]);

  const handleSelectCandidate = (candidateId: number, checked: boolean) => {
    if (checked) {
      setSelectedCandidates(prev => [...prev, candidateId]);
    } else {
      setSelectedCandidates(prev => prev.filter(id => id !== candidateId));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-600">Unable to load recruitment pass</p>
        </div>
      </div>
    );
  }

  const { pass, candidates, interviews } = data;
  const currentPosition = positions[selectedPosition] || { title: pass.positionTitle };

  const tabs = [
    { id: "request", label: "Request", icon: FileText },
    { id: "screening", label: "Screening", icon: Search },
    { id: "interviews", label: "Interviews", icon: Users },
    { id: "decision", label: "Decision", icon: CheckCircle },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "shortlisted": return "bg-emerald-100 text-emerald-700";
      case "screening": return "bg-amber-100 text-amber-700";
      case "interview": return "bg-blue-100 text-blue-700";
      case "rejected": return "bg-red-100 text-red-700";
      default: return "bg-neutral-100 text-neutral-600";
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Clean Tab Navigation */}
      <div className="border-b sticky top-0 bg-white z-50">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-8" data-testid="tab-navigation">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 flex items-center gap-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id 
                    ? "border-neutral-900 text-neutral-900" 
                    : "border-transparent text-neutral-500 hover:text-neutral-700"
                }`}
                data-testid={`tab-${tab.id}`}
              >
                <tab.icon className="w-4 h-4" strokeWidth={1.5} />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* REQUEST TAB */}
        {activeTab === "request" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Request Details */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-neutral-600" strokeWidth={1.5} />
                </div>
                <h2 className="text-lg font-semibold text-neutral-900">Request Details</h2>
              </div>

              {/* Position Selector */}
              <div className="mb-6">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Select Position</p>
                <div className="space-y-2">
                  {positions.map((pos: any, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedPosition(idx)}
                      className={`w-full p-4 rounded-xl border text-left transition-all ${
                        selectedPosition === idx 
                          ? "border-neutral-900 bg-neutral-50" 
                          : "border-neutral-200 hover:border-neutral-300"
                      }`}
                      data-testid={`position-${idx}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-neutral-900">Position {idx + 1}</p>
                          <p className="text-sm text-neutral-500">{pos.title || pass.positionTitle}</p>
                        </div>
                        <Badge className="bg-neutral-100 text-neutral-600 border-0 text-xs">Open</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Position Details */}
              <div>
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-4">Position Details</p>
                <div className="space-y-4">
                  {[
                    { label: "Job Title", value: currentPosition.title || pass.positionTitle },
                    { label: "Recruitment Reference", value: pass.passId || `REQ-${pass.id}` },
                    { label: "Department", value: pass.department || "Engineering / R&D" },
                    { label: "Location", value: pass.location || "Abu Dhabi, UAE" },
                    { label: "Employment Type", value: pass.employmentType || "Full-time" },
                    { label: "Salary Range", value: pass.salaryRangeMax ? `AED ${pass.salaryRangeMin?.toLocaleString()} - ${pass.salaryRangeMax?.toLocaleString()}` : "Competitive" },
                    { label: "Experience Required", value: pass.experienceMin ? `${pass.experienceMin}-${pass.experienceMax} years` : "2-4 years" },
                  ].map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center py-2 border-b border-neutral-100 last:border-0">
                      <span className="text-sm text-neutral-500">{item.label}</span>
                      <span className="text-sm font-medium text-neutral-900">{item.value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-neutral-500">Approval Status</span>
                    <Badge className="bg-emerald-500 text-white border-0 gap-1">
                      <Check className="w-3 h-3" /> APPROVED
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Manager Actions */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
                  <Settings className="w-5 h-5 text-neutral-600" strokeWidth={1.5} />
                </div>
                <h2 className="text-lg font-semibold text-neutral-900">Manager Actions</h2>
              </div>

              <div className="space-y-4">
                {/* Recruitment Requisition */}
                <div className="flex items-center justify-between py-3 border-b border-neutral-100">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-neutral-400" strokeWidth={1.5} />
                    <span className="text-sm text-neutral-700">Recruitment Requisition</span>
                  </div>
                  <Select defaultValue="under-process">
                    <SelectTrigger className="w-36 h-9 border-neutral-200" data-testid="select-requisition-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="under-process">Under Process</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Job Description */}
                <div className="flex items-center justify-between py-3 border-b border-neutral-100">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-neutral-400" strokeWidth={1.5} />
                    <span className="text-sm text-neutral-700">Job Description</span>
                  </div>
                  <Select defaultValue="to-review">
                    <SelectTrigger className="w-36 h-9 border-neutral-200" data-testid="select-jd-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="to-review">To Review</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="changes-requested">Changes Requested</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Interview Setup */}
                <div className="flex items-center justify-between py-3 border-b border-neutral-100">
                  <div className="flex items-center gap-3">
                    <CalendarIcon className="w-4 h-4 text-neutral-400" strokeWidth={1.5} />
                    <span className="text-sm text-neutral-700">Interview Setup</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    className="h-9 text-neutral-600 gap-1"
                    onClick={() => setShowInterviewSetup(true)}
                    data-testid="btn-configure-interview"
                  >
                    Configure <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                {/* Custom Action */}
                <div className="flex items-center gap-2 mt-6">
                  <Input 
                    placeholder="Add custom action..." 
                    className="flex-1 h-10 border-neutral-200"
                    data-testid="input-custom-action"
                  />
                  <Button size="icon" className="bg-neutral-900 hover:bg-neutral-800 h-10 w-10" data-testid="btn-add-action">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SCREENING TAB */}
        {activeTab === "screening" && (
          <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-semibold text-neutral-900">Candidates</h1>
                <p className="text-sm text-neutral-500 mt-1">Manage your candidate pool across all recruitment passes</p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" className="gap-2 border-neutral-200" data-testid="btn-import">
                  <Upload className="w-4 h-4" /> Import
                </Button>
                <Button className="bg-neutral-900 hover:bg-neutral-800 gap-2" data-testid="btn-add-candidate">
                  <Plus className="w-4 h-4" /> Add Candidate
                </Button>
              </div>
            </div>

            {/* Position Filter Pills */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setPositionFilter("all")}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  positionFilter === "all" 
                    ? "bg-neutral-900 text-white" 
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
                data-testid="filter-all"
              >
                All Candidates
              </button>
              {positions.map((pos: any, idx: number) => (
                <button
                  key={idx}
                  onClick={() => setPositionFilter(pos.title || pass.positionTitle)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    positionFilter === (pos.title || pass.positionTitle)
                      ? "bg-neutral-900 text-white" 
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                  data-testid={`filter-position-${idx}`}
                >
                  {pos.title || pass.positionTitle}
                </button>
              ))}
            </div>

            {/* Bulk Actions Bar - appears when candidates selected */}
            {selectedCandidates.length > 0 && (
              <div className="bg-[#1F3B58] text-white rounded-xl p-4 mb-6 flex items-center justify-between" data-testid="bulk-actions-bar">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{selectedCandidates.length} candidate{selectedCandidates.length > 1 ? 's' : ''} selected</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-white/70 hover:text-white hover:bg-white/10"
                    onClick={() => setSelectedCandidates([])}
                    data-testid="btn-clear-selection"
                  >
                    Clear
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-white/30 text-white hover:bg-white/10 gap-2"
                    onClick={() => {
                      selectedCandidates.forEach(id => shortlistMutation.mutate(id));
                      setSelectedCandidates([]);
                    }}
                    disabled={shortlistMutation.isPending}
                    data-testid="btn-bulk-shortlist"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Shortlist
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-white/30 text-white hover:bg-white/10 gap-2"
                    onClick={() => setShowInterviewSetup(true)}
                    data-testid="btn-bulk-interview"
                  >
                    <Calendar className="w-4 h-4" />
                    Schedule Interview
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-red-400/50 text-red-300 hover:bg-red-500/20 gap-2"
                    onClick={() => {
                      selectedCandidates.forEach(id => rejectMutation.mutate(id));
                      setSelectedCandidates([]);
                    }}
                    disabled={rejectMutation.isPending}
                    data-testid="btn-bulk-reject"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </Button>
                </div>
              </div>
            )}

            {/* Search and Filters */}
            <div className="flex items-center gap-3 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <Input 
                  placeholder="Search by name or email..."
                  className="pl-10 border-neutral-200"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search"
                />
              </div>
              <Button variant="outline" className="gap-2 border-neutral-200" data-testid="btn-status-filter">
                All Status
              </Button>
              <Button variant="outline" className="gap-2 border-neutral-200" data-testid="btn-source-filter">
                All Sources
              </Button>
              <Button variant="outline" className="gap-2 border-neutral-200" data-testid="btn-columns">
                Columns
              </Button>
            </div>

            {/* Candidates Table */}
            <div className="border border-neutral-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <Checkbox data-testid="checkbox-select-all" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Rank</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Current Position</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Ranking</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Skills Match</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Education</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Experience</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Profile</th>
                    <th className="w-12 px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredCandidates.map((pc, idx) => (
                    <tr key={pc.id} className="hover:bg-neutral-50 transition-colors" data-testid={`row-candidate-${pc.candidate.id}`}>
                      <td className="px-4 py-4">
                        <Checkbox 
                          checked={selectedCandidates.includes(pc.id)}
                          onCheckedChange={(checked) => handleSelectCandidate(pc.id, !!checked)}
                          data-testid={`checkbox-${pc.candidate.id}`}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm font-medium text-neutral-500">#{idx + 1}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <p className="font-medium text-neutral-900">{pc.candidate.name}</p>
                          <Badge className={`${getStatusBadge(pc.status || 'new')} border-0 text-xs mt-1`}>
                            {(pc.status || 'new').charAt(0).toUpperCase() + (pc.status || 'new').slice(1)}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-neutral-600">{pc.candidate.currentTitle || "Not specified"}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                          <span className="font-medium text-neutral-900">{pc.aiScore || 0}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 min-w-24">
                          <Progress value={pc.aiScore || 0} className="h-1.5 flex-1" />
                          <span className="text-xs text-neutral-500">{pc.aiScore || 0}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-neutral-600">
                          Bachelor's Degree
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-neutral-600">
                          {pc.candidate.experienceYears ? `${pc.candidate.experienceYears}+ years` : "3+ years"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <Button variant="ghost" size="sm" className="text-neutral-500 text-xs h-7" data-testid={`btn-linkedin-${pc.candidate.id}`}>
                          LinkedIn
                        </Button>
                      </td>
                      <td className="px-4 py-4">
                        <Button variant="ghost" size="icon" className="text-neutral-400" data-testid={`btn-more-${pc.candidate.id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* INTERVIEWS TAB */}
        {activeTab === "interviews" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Calendar */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-neutral-900">
                  {format(new Date(), "MMMM yyyy")}
                </h2>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8 border-neutral-200" data-testid="btn-prev-month">
                    <ChevronRight className="w-4 h-4 rotate-180" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8 border-neutral-200" data-testid="btn-next-month">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <Calendar
                mode="single"
                className="w-full"
                classNames={{
                  months: "w-full",
                  month: "w-full",
                  table: "w-full",
                  head_row: "flex w-full",
                  head_cell: "text-neutral-500 rounded-md w-full font-normal text-xs",
                  row: "flex w-full mt-1",
                  cell: "text-center text-sm p-0 relative w-full",
                  day: "h-10 w-full p-0 font-normal text-neutral-700 hover:bg-neutral-100 rounded-lg",
                  day_selected: "bg-neutral-900 text-white hover:bg-neutral-800",
                  day_today: "bg-neutral-100",
                }}
              />
            </div>

            {/* Scheduled Interviews */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
                  <CalendarIcon className="w-5 h-5 text-neutral-600" strokeWidth={1.5} />
                </div>
                <h2 className="text-lg font-semibold text-neutral-900">Scheduled Interviews</h2>
              </div>

              {interviews.length === 0 ? (
                <div className="text-center py-12">
                  <CalendarIcon className="w-12 h-12 text-neutral-200 mx-auto mb-3" strokeWidth={1} />
                  <p className="text-neutral-500">No interviews scheduled</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {interviews.map((interview, idx) => (
                    <div key={interview.id} className="p-4 rounded-xl border border-neutral-200 hover:border-neutral-300 transition-colors" data-testid={`interview-${interview.id}`}>
                      <p className="text-lg font-semibold text-neutral-900 mb-2">
                        {format(new Date(interview.interviewDate), "hh:mm a")}
                      </p>
                      <p className="font-medium text-neutral-800">Candidate Interview</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge className="bg-neutral-100 text-neutral-600 border-0 text-xs">ROUND 1</Badge>
                        <span className="text-xs text-neutral-500">Video Call • 60 min</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* DECISION TAB */}
        {activeTab === "decision" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Decision Summary */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-neutral-600" strokeWidth={1.5} />
                </div>
                <h2 className="text-lg font-semibold text-neutral-900">Decision Summary</h2>
              </div>

              {/* Top Candidate */}
              <div className="mb-6">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Top Candidate</p>
                {topCandidate ? (
                  <div className="p-4 rounded-xl border border-neutral-200 flex items-center gap-4">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback className="bg-emerald-100 text-emerald-700 font-semibold">
                        {topCandidate.candidate.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium text-neutral-900">{topCandidate.candidate.name}</p>
                      <p className="text-sm text-neutral-500">Overall Score: {(topCandidate.aiScore || 0) / 10}/10</p>
                    </div>
                    <Badge className="bg-emerald-500 text-white border-0">RECOMMENDED</Badge>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-neutral-200 text-center">
                    <p className="text-neutral-500">No candidates evaluated yet</p>
                  </div>
                )}
              </div>

              {/* Scores */}
              <div className="space-y-4">
                {[
                  { label: "Technical Score", value: topCandidate ? `${((topCandidate.aiScore || 0) / 10).toFixed(1)} / 10` : "- / 10" },
                  { label: "Cultural Fit", value: "9.0 / 10" },
                  { label: "Communication", value: "9.0 / 10" },
                  { label: "Leadership", value: "9.3 / 10" },
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 border-b border-neutral-100 last:border-0">
                    <span className="text-sm text-neutral-600">{item.label}</span>
                    <span className="text-sm font-semibold text-neutral-900">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Offer Details */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-neutral-600" strokeWidth={1.5} />
                </div>
                <h2 className="text-lg font-semibold text-neutral-900">Offer Details</h2>
              </div>

              <div className="space-y-4 mb-6">
                {[
                  { label: "Position", value: currentPosition.title || pass.positionTitle },
                  { label: "Salary Offered", value: pass.salaryRangeMax ? `AED ${pass.salaryRangeMax?.toLocaleString()}` : "AED 18,000" },
                  { label: "Start Date", value: "Feb 1, 2025" },
                  { label: "Contract Type", value: "Permanent" },
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 border-b border-neutral-100 last:border-0">
                    <span className="text-sm text-neutral-500">{item.label}</span>
                    <span className="text-sm font-medium text-neutral-900">{item.value}</span>
                  </div>
                ))}
              </div>

              {/* Benefits */}
              <div className="mb-6">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Benefits</p>
                <div className="flex flex-wrap gap-2">
                  {["Health Insurance", "Annual Leave", "Visa Sponsorship", "Training Budget"].map((benefit, idx) => (
                    <Badge key={idx} className="bg-neutral-100 text-neutral-600 border-0 text-xs font-normal">
                      {benefit}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Offer Status */}
              <div className="mb-6">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Offer Status</p>
                <div className="space-y-2">
                  {[
                    { label: "Draft", completed: true },
                    { label: "Pending Approval", completed: true },
                    { label: "Approved", completed: false, current: true },
                    { label: "Sent to Candidate", completed: false },
                  ].map((step, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                        step.completed ? "bg-emerald-500 text-white" : 
                        step.current ? "bg-neutral-300 text-white" : "bg-neutral-100"
                      }`}>
                        {step.completed && <Check className="w-3 h-3" />}
                        {step.current && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                      <span className={`text-sm ${step.completed ? "text-neutral-900" : "text-neutral-400"}`}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <Button className="w-full bg-neutral-900 hover:bg-neutral-800 gap-2" data-testid="btn-send-offer">
                <Send className="w-4 h-4" /> Send Offer Letter
              </Button>
            </div>
          </div>
        )}

        {/* ANALYTICS TAB */}
        {activeTab === "analytics" && (
          <div className="text-center py-16">
            <BarChart3 className="w-16 h-16 text-neutral-200 mx-auto mb-4" strokeWidth={1} />
            <h2 className="text-xl font-semibold text-neutral-900 mb-2">Analytics Dashboard</h2>
            <p className="text-neutral-500">Coming soon - Track recruitment metrics and performance</p>
          </div>
        )}
      </div>

      {/* Interview Setup Modal */}
      <Dialog open={showInterviewSetup} onOpenChange={setShowInterviewSetup}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
                <CalendarIcon className="w-4 h-4 text-neutral-600" />
              </div>
              Interview Setup
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Technical Assessment */}
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Technical Assessment Required?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setInterviewSetup(prev => ({ ...prev, technicalAssessment: true }))}
                  className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                    interviewSetup.technicalAssessment 
                      ? "bg-neutral-900 text-white" 
                      : "bg-neutral-100 text-neutral-600"
                  }`}
                  data-testid="btn-tech-yes"
                >
                  Yes
                </button>
                <button
                  onClick={() => setInterviewSetup(prev => ({ ...prev, technicalAssessment: false }))}
                  className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                    !interviewSetup.technicalAssessment 
                      ? "bg-neutral-900 text-white" 
                      : "bg-neutral-100 text-neutral-600"
                  }`}
                  data-testid="btn-tech-no"
                >
                  No
                </button>
              </div>
            </div>

            {/* Interview Format */}
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Interview Format</p>
              <div className="flex gap-2">
                {["Online", "In-Person", "Hybrid"].map((format) => (
                  <button
                    key={format}
                    onClick={() => setInterviewSetup(prev => ({ ...prev, format: format.toLowerCase() }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      interviewSetup.format === format.toLowerCase()
                        ? "bg-neutral-900 text-white" 
                        : "bg-neutral-100 text-neutral-600"
                    }`}
                    data-testid={`btn-format-${format.toLowerCase()}`}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </div>

            {/* Interview Rounds */}
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Interview Rounds</p>
              <Select value={interviewSetup.rounds} onValueChange={(v) => setInterviewSetup(prev => ({ ...prev, rounds: v }))}>
                <SelectTrigger className="w-full" data-testid="select-rounds">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Round</SelectItem>
                  <SelectItem value="2">2 Rounds</SelectItem>
                  <SelectItem value="3">3 Rounds</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Picker */}
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Add Interview Date & Time Slots</p>
              <div className="flex gap-2">
                <Input type="date" className="flex-1" data-testid="input-interview-date" />
                <Button className="bg-neutral-900 hover:bg-neutral-800" data-testid="btn-add-date">Add Date</Button>
              </div>
              <p className="text-xs text-neutral-400 mt-2">No dates added yet. Select a date above and click "Add Date".</p>
            </div>

            {/* Additional Interviewer */}
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Additional Interviewer (Optional)</p>
              <Input 
                placeholder="Type interviewer name..." 
                value={interviewSetup.additionalInterviewer}
                onChange={(e) => setInterviewSetup(prev => ({ ...prev, additionalInterviewer: e.target.value }))}
                data-testid="input-interviewer"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowInterviewSetup(false)} data-testid="btn-cancel-setup">
              Cancel
            </Button>
            <Button className="bg-neutral-900 hover:bg-neutral-800" onClick={() => setShowInterviewSetup(false)} data-testid="btn-save-setup">
              Save Setup
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
