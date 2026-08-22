import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  FileText, CheckCircle, XCircle, Clock, Calendar,
  MessageSquare, Upload, Download, ExternalLink,
  Briefcase, Building2, MapPin, DollarSign,
  ChevronRight, AlertCircle, Send, Inbox,
  ClipboardCheck, Timer, FileCheck, User
} from "lucide-react";
import type { Pass, Candidate, PassCandidate, Interview, Offer, CandidateMessage, CandidateDocument } from "@shared/schema";

interface CandidatePassData {
  candidateLink: {
    id: number;
    token: string;
    passCandidateId: number;
    isActive: boolean;
    expiresAt: string | null;
  };
  candidate: Candidate;
  passCandidate: PassCandidate;
  pass: Pass;
  messages: CandidateMessage[];
  documents: CandidateDocument[];
  timeline: any[];
  interviews: Interview[];
  offer: Offer | null;
  interviewSlots: any[];
}

interface CandidatePortalPassProps {
  token: string;
}

export default function CandidatePortalPass({ token }: CandidatePortalPassProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("next");
  const [messageText, setMessageText] = useState("");
  const [showSlotDialog, setShowSlotDialog] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery<CandidatePassData>({
    queryKey: ["/api/candidate-pass", token],
    queryFn: () => fetch(`/api/candidate-pass/${token}`).then(res => res.json()),
  });

  const sendMessageMutation = useMutation({
    mutationFn: (message: string) => apiRequest("POST", `/api/candidate-pass/${token}/messages`, { message }),
    onSuccess: () => {
      toast({ title: "Message sent!" });
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-pass", token] });
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" })
  });

  const bookSlotMutation = useMutation({
    mutationFn: (slotId: number) => apiRequest("POST", `/api/candidate-pass/${token}/interview-slot`, { slotId }),
    onSuccess: () => {
      toast({ title: "Interview slot booked!" });
      setShowSlotDialog(false);
      setSelectedSlotId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-pass", token] });
    },
    onError: () => toast({ title: "Failed to book slot", variant: "destructive" })
  });

  const respondOfferMutation = useMutation({
    mutationFn: (response: { response: string; reason?: string; message?: string }) =>
      apiRequest("POST", `/api/candidate-pass/${token}/offer-response`, response),
    onSuccess: () => {
      toast({ title: "Response submitted!" });
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-pass", token] });
    },
    onError: () => toast({ title: "Failed to respond", variant: "destructive" })
  });

  const confirmAssessmentMutation = useMutation({
    mutationFn: (assessmentType: string) =>
      apiRequest("POST", `/api/candidate-pass/${token}/assessment-complete`, { assessmentType }),
    onSuccess: () => {
      toast({ title: "Assessment completion recorded" });
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-pass", token] });
    },
    onError: () => toast({ title: "Failed to record completion", variant: "destructive" })
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading your application...</p>
        </div>
      </div>
    );
  }

  if (error || !data || !data.passCandidate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Card className="max-w-md bg-slate-800 border-slate-700">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2 text-white">Invalid or Expired Link</h2>
            <p className="text-slate-400">This application link is no longer valid.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { candidate, passCandidate, pass, messages, documents, timeline, interviews, offer, interviewSlots } = data;
  const unreadMessages = messages.filter(m => !m.isRead && m.senderType === "hr").length;

  const getStageProgress = () => {
    const stages = ["new", "screening", "shortlisted", "interview", "offer", "hired"];
    const currentIndex = stages.indexOf(passCandidate.status || "new");
    return Math.max(0, ((currentIndex + 1) / stages.length) * 100);
  };

  const getStageName = (status: string) => {
    const names: Record<string, string> = {
      new: "Application Received",
      screening: "Under Review",
      shortlisted: "Shortlisted",
      interview: "Interview Stage",
      offer: "Offer Extended",
      hired: "Welcome Aboard!"
    };
    return names[status] || status;
  };

  const pendingDocs = documents.filter(d => d.status === "pending");
  const hasAssessments = pass.softSkillsAssessmentUrl || pass.technicalAssessmentUrl;
  const softSkillsCompleted = passCandidate.softSkillsCompletedAt;
  const technicalCompleted = passCandidate.technicalCompletedAt;

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 text-white p-2 rounded-lg">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">My Application</h1>
                <p className="text-sm text-slate-400">{pass.positionTitle}</p>
              </div>
            </div>
            {unreadMessages > 0 && (
              <Badge variant="destructive" className="bg-red-500">
                {unreadMessages} new message{unreadMessages > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <Card className="mb-6 bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                {candidate.name?.charAt(0) || "?"}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{candidate.name}</h2>
                <p className="text-slate-400">{candidate.email}</p>
              </div>
            </div>
            
            <div className="bg-slate-700/50 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-3 text-sm text-slate-300 mb-3">
                <span className="flex items-center gap-1">
                  <Building2 className="w-4 h-4" />
                  {pass.department}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {pass.location}
                </span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">Application Progress</span>
                <Badge className="bg-blue-600">{getStageName(passCandidate.status || "new")}</Badge>
              </div>
              <Progress value={getStageProgress()} className="h-2 bg-slate-600" />
              <div className="flex justify-between mt-2 text-xs text-slate-500">
                <span>Applied</span>
                <span>Review</span>
                <span>Interview</span>
                <span>Offer</span>
                <span>Hired</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 h-auto p-1 bg-slate-800 border border-slate-700">
            <TabsTrigger 
              value="next" 
              className="flex flex-col items-center gap-1 py-3 text-slate-400 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
              data-testid="tab-next"
            >
              <ClipboardCheck className="w-5 h-5" />
              <span className="text-xs">Next Steps</span>
            </TabsTrigger>
            <TabsTrigger 
              value="timeline" 
              className="flex flex-col items-center gap-1 py-3 text-slate-400 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
              data-testid="tab-timeline"
            >
              <Timer className="w-5 h-5" />
              <span className="text-xs">Timeline</span>
            </TabsTrigger>
            <TabsTrigger 
              value="inbox" 
              className="flex flex-col items-center gap-1 py-3 text-slate-400 data-[state=active]:bg-blue-600 data-[state=active]:text-white relative"
              data-testid="tab-inbox"
            >
              <Inbox className="w-5 h-5" />
              <span className="text-xs">Inbox</span>
              {unreadMessages > 0 && (
                <span className="absolute top-1 right-4 w-2 h-2 bg-red-500 rounded-full"></span>
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="docs" 
              className="flex flex-col items-center gap-1 py-3 text-slate-400 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
              data-testid="tab-docs"
            >
              <FileCheck className="w-5 h-5" />
              <span className="text-xs">Documents</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="next" className="space-y-4">
            {passCandidate.status === "rejected" ? (
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="py-8 text-center">
                  <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">Application Not Successful</h3>
                  <p className="text-slate-400">
                    Unfortunately, we have decided not to move forward with your application at this time.
                    We appreciate your interest and wish you the best in your future endeavors.
                  </p>
                </CardContent>
              </Card>
            ) : passCandidate.status === "hired" ? (
              <Card className="bg-slate-800 border-slate-700 border-green-500">
                <CardContent className="py-8 text-center">
                  <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">Welcome to the Team!</h3>
                  <p className="text-slate-400">
                    Congratulations on accepting the offer. We're excited to have you join us!
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {hasAssessments && (
                  <div className="space-y-3">
                    {pass.softSkillsAssessmentUrl && !softSkillsCompleted && (
                      <Card className="bg-slate-800 border-slate-700 border-l-4 border-l-yellow-500">
                        <CardContent className="py-4">
                          <div className="flex items-start gap-4">
                            <div className="bg-yellow-500/20 p-3 rounded-lg">
                              <FileText className="w-6 h-6 text-yellow-400" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold text-white mb-1">Soft Skills Assessment</h4>
                              <p className="text-sm text-slate-400 mb-3">
                                Complete this assessment to help us understand your work style and preferences.
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <Button 
                                  size="sm"
                                  onClick={() => window.open(pass.softSkillsAssessmentUrl!, "_blank")}
                                  data-testid="btn-soft-skills-assessment"
                                >
                                  <ExternalLink className="w-4 h-4 mr-1" />
                                  Start Assessment
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => confirmAssessmentMutation.mutate("softSkills")}
                                  disabled={confirmAssessmentMutation.isPending}
                                  className="border-slate-600 text-slate-300"
                                  data-testid="btn-confirm-soft-skills"
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  I've Completed This
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    {pass.softSkillsAssessmentUrl && softSkillsCompleted && (
                      <Card className="bg-slate-800 border-slate-700 border-l-4 border-l-green-500">
                        <CardContent className="py-4">
                          <div className="flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-green-400" />
                            <span className="text-slate-300">Soft Skills Assessment Completed</span>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {pass.technicalAssessmentUrl && !technicalCompleted && (
                      <Card className="bg-slate-800 border-slate-700 border-l-4 border-l-purple-500">
                        <CardContent className="py-4">
                          <div className="flex items-start gap-4">
                            <div className="bg-purple-500/20 p-3 rounded-lg">
                              <ClipboardCheck className="w-6 h-6 text-purple-400" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold text-white mb-1">Technical Assessment</h4>
                              <p className="text-sm text-slate-400 mb-3">
                                Complete this technical assessment to demonstrate your skills.
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <Button 
                                  size="sm"
                                  onClick={() => window.open(pass.technicalAssessmentUrl!, "_blank")}
                                  className="bg-purple-600 hover:bg-purple-700"
                                  data-testid="btn-technical-assessment"
                                >
                                  <ExternalLink className="w-4 h-4 mr-1" />
                                  Start Assessment
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => confirmAssessmentMutation.mutate("technical")}
                                  disabled={confirmAssessmentMutation.isPending}
                                  className="border-slate-600 text-slate-300"
                                  data-testid="btn-confirm-technical"
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  I've Completed This
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    {pass.technicalAssessmentUrl && technicalCompleted && (
                      <Card className="bg-slate-800 border-slate-700 border-l-4 border-l-green-500">
                        <CardContent className="py-4">
                          <div className="flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-green-400" />
                            <span className="text-slate-300">Technical Assessment Completed</span>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {passCandidate.status === "shortlisted" && interviewSlots.length > 0 && (
                  <Card className="bg-slate-800 border-slate-700 border-l-4 border-l-blue-500">
                    <CardContent className="py-4">
                      <div className="flex items-start gap-4">
                        <div className="bg-blue-500/20 p-3 rounded-lg">
                          <Calendar className="w-6 h-6 text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-white mb-1">Schedule Your Interview</h4>
                          <p className="text-sm text-slate-400 mb-3">
                            Select a time slot that works best for you.
                          </p>
                          <Dialog open={showSlotDialog} onOpenChange={setShowSlotDialog}>
                            <DialogTrigger asChild>
                              <Button data-testid="btn-select-interview-slot">
                                <Calendar className="w-4 h-4 mr-1" />
                                View Available Slots
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-slate-800 border-slate-700">
                              <DialogHeader>
                                <DialogTitle className="text-white">Select Interview Slot</DialogTitle>
                                <DialogDescription className="text-slate-400">
                                  Choose a time that works for you
                                </DialogDescription>
                              </DialogHeader>
                              <ScrollArea className="max-h-80">
                                <div className="space-y-2">
                                  {interviewSlots.map((slot: any) => (
                                    <div
                                      key={slot.id}
                                      onClick={() => setSelectedSlotId(slot.id)}
                                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                                        selectedSlotId === slot.id
                                          ? "bg-blue-600 border-blue-500"
                                          : "bg-slate-700 border-slate-600 hover:border-blue-500"
                                      }`}
                                      data-testid={`slot-${slot.id}`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <p className="font-medium text-white">{slot.slotDate}</p>
                                          <p className="text-sm text-slate-400">
                                            {slot.startTime} - {slot.endTime}
                                          </p>
                                        </div>
                                        <Badge variant="outline" className="border-slate-500">
                                          {slot.format}
                                        </Badge>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </ScrollArea>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setShowSlotDialog(false)} className="border-slate-600">
                                  Cancel
                                </Button>
                                <Button
                                  onClick={() => selectedSlotId && bookSlotMutation.mutate(selectedSlotId)}
                                  disabled={!selectedSlotId || bookSlotMutation.isPending}
                                  data-testid="btn-confirm-slot"
                                >
                                  Confirm Slot
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {interviews.length > 0 && (
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-base">Scheduled Interviews</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {interviews.map((interview) => (
                        <div key={interview.id} className="flex items-center gap-4 p-3 bg-slate-700/50 rounded-lg">
                          <Calendar className="w-5 h-5 text-blue-400" />
                          <div>
                            <p className="font-medium text-white">{interview.interviewDate}</p>
                            <p className="text-sm text-slate-400">
                              {interview.startTime} - {interview.endTime} ({interview.format})
                            </p>
                          </div>
                          {interview.meetingLink && (
                            <Button size="sm" variant="outline" className="ml-auto border-slate-600" asChild>
                              <a href={interview.meetingLink} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-4 h-4 mr-1" />
                                Join
                              </a>
                            </Button>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {offer && offer.status === "pending" && (
                  <Card className="bg-slate-800 border-slate-700 border-l-4 border-l-green-500">
                    <CardContent className="py-4">
                      <div className="flex items-start gap-4">
                        <div className="bg-green-500/20 p-3 rounded-lg">
                          <DollarSign className="w-6 h-6 text-green-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-white mb-1">Offer Extended!</h4>
                          <p className="text-sm text-slate-400 mb-3">
                            Congratulations! You have received an offer. Please review and respond.
                          </p>
                          <div className="bg-slate-700/50 rounded-lg p-3 mb-3">
                            <p className="text-slate-300">
                              <strong>Salary:</strong> {offer.salary?.toLocaleString()} AED/month
                            </p>
                            {offer.startDate && (
                              <p className="text-slate-300">
                                <strong>Start Date:</strong> {offer.startDate}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() => respondOfferMutation.mutate({ response: "accept" })}
                              disabled={respondOfferMutation.isPending}
                              className="bg-green-600 hover:bg-green-700"
                              data-testid="btn-accept-offer"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Accept Offer
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => respondOfferMutation.mutate({ response: "negotiate", message: "I would like to discuss the offer" })}
                              disabled={respondOfferMutation.isPending}
                              className="border-slate-600 text-slate-300"
                              data-testid="btn-negotiate-offer"
                            >
                              Request to Negotiate
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => respondOfferMutation.mutate({ response: "decline", reason: "Personal reasons" })}
                              disabled={respondOfferMutation.isPending}
                              data-testid="btn-decline-offer"
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Decline
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {pendingDocs.length > 0 && (
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-base flex items-center gap-2">
                        <Upload className="w-5 h-5 text-orange-400" />
                        Documents Required
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {pendingDocs.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                            <div>
                              <p className="font-medium text-white">{doc.label}</p>
                              <p className="text-xs text-slate-400">{doc.docType}</p>
                            </div>
                            <Button size="sm" variant="outline" className="border-slate-600">
                              <Upload className="w-4 h-4 mr-1" />
                              Upload
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!hasAssessments && interviewSlots.length === 0 && !offer && pendingDocs.length === 0 && (
                  <Card className="bg-slate-800 border-slate-700">
                    <CardContent className="py-8 text-center">
                      <Clock className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-white mb-2">Your Application is Being Reviewed</h3>
                      <p className="text-slate-400">
                        Our team is reviewing your application. You'll receive an update soon.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="timeline" className="space-y-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Application Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-700"></div>
                  <div className="space-y-6">
                    <div className="relative pl-10">
                      <div className="absolute left-2 top-1 w-4 h-4 rounded-full bg-green-500 border-2 border-slate-800"></div>
                      <p className="font-medium text-white">Application Submitted</p>
                      <p className="text-sm text-slate-400">{passCandidate.updatedAt ? new Date(passCandidate.updatedAt).toLocaleDateString() : "Recently"}</p>
                    </div>
                    
                    {timeline.map((event, idx) => (
                      <div key={event.id || idx} className="relative pl-10">
                        <div className="absolute left-2 top-1 w-4 h-4 rounded-full bg-blue-500 border-2 border-slate-800"></div>
                        <p className="font-medium text-white">{event.title}</p>
                        <p className="text-sm text-slate-400">{event.description}</p>
                        <p className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleDateString()}</p>
                      </div>
                    ))}

                    {passCandidate.status !== "new" && (
                      <div className="relative pl-10">
                        <div className="absolute left-2 top-1 w-4 h-4 rounded-full bg-blue-500 border-2 border-slate-800"></div>
                        <p className="font-medium text-white">Status: {getStageName(passCandidate.status || "new")}</p>
                        <p className="text-sm text-slate-400">Current stage</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inbox" className="space-y-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Messages</CardTitle>
              </CardHeader>
              <CardContent>
                {messages.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No messages yet</p>
                  </div>
                ) : (
                  <ScrollArea className="h-80 pr-4">
                    <div className="space-y-4">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`p-3 rounded-lg ${
                            msg.senderType === "hr"
                              ? "bg-slate-700 mr-8"
                              : "bg-blue-600 ml-8"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-slate-400">
                              {msg.senderType === "hr" ? msg.senderName || "HR Team" : "You"}
                            </span>
                            <span className="text-xs text-slate-500">
                              {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : ""}
                            </span>
                          </div>
                          <p className="text-sm text-white">{msg.message}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
              <CardFooter className="border-t border-slate-700 pt-4">
                <div className="flex w-full gap-2">
                  <Textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 min-h-10 bg-slate-700 border-slate-600 text-white resize-none"
                    data-testid="input-message"
                  />
                  <Button
                    onClick={() => sendMessageMutation.mutate(messageText)}
                    disabled={sendMessageMutation.isPending || !messageText.trim()}
                    data-testid="btn-send-message"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="docs" className="space-y-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Documents</CardTitle>
                <CardDescription className="text-slate-400">
                  Upload and manage your application documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No documents yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-slate-400" />
                          <div>
                            <p className="font-medium text-white">{doc.label || doc.docType}</p>
                            {doc.fileName && (
                              <p className="text-xs text-slate-400">{doc.fileName}</p>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant={
                            doc.status === "approved"
                              ? "default"
                              : doc.status === "rejected"
                              ? "destructive"
                              : doc.status === "uploaded"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {doc.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
