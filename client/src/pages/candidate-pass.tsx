import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { format } from "date-fns";
import {
  ArrowLeft,
  Printer,
  Building2,
  MapPin,
  Calendar,
  User,
  Briefcase,
  Phone,
  Mail,
  Clock,
  FileText,
  CheckCircle2,
  Video,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Candidate, Pass, Interview } from "@shared/schema";

interface PassCandidate {
  id: number;
  passId: number;
  candidateId: number;
  status: string;
  positionId: number | null;
  aiScore: number | null;
}

interface PassPosition {
  id: number;
  passId: number;
  positionTitle: string;
  headcount: number;
}

interface CandidatePassProps {
  passIdParam?: string; // Clean pass ID like HP-CP-2025-001 (for future use)
  params?: { id?: string }; // From wouter route
}

export default function CandidatePass({ passIdParam, params: propsParams }: CandidatePassProps = {}) {
  const [, routeParams] = useRoute("/candidates/:id/pass");
  const candidateId = propsParams?.id || routeParams?.id;

  const { data: candidate, isLoading: candidateLoading } = useQuery<Candidate>({
    queryKey: ["/api/candidates", candidateId],
    enabled: !!candidateId,
  });

  // Get all pass-candidate associations for this candidate
  const { data: passCandidates } = useQuery<PassCandidate[]>({
    queryKey: ["/api/candidates", candidateId, "passes"],
    enabled: !!candidateId,
  });

  // Get the most recent/active pass association
  const activePassCandidate = passCandidates?.[0];

  const { data: pass } = useQuery<Pass>({
    queryKey: ["/api/passes", activePassCandidate?.passId?.toString()],
    enabled: !!activePassCandidate?.passId,
  });

  const { data: positions } = useQuery<PassPosition[]>({
    queryKey: ["/api/passes", activePassCandidate?.passId?.toString(), "positions"],
    enabled: !!activePassCandidate?.passId,
  });

  // Get interviews for this candidate
  const { data: interviews } = useQuery<Interview[]>({
    queryKey: ["/api/pass-candidates", activePassCandidate?.id?.toString(), "interviews"],
    enabled: !!activePassCandidate?.id,
  });

  const handlePrint = () => {
    window.print();
  };

  if (candidateLoading) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <Skeleton className="h-[800px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <User className="w-16 h-16 mx-auto text-muted-foreground/30" strokeWidth={1} />
        <h3 className="mt-4 text-lg font-medium">Candidate not found</h3>
        <Link href="/candidates">
          <Button variant="outline" className="mt-4 rounded-xl">
            Back to Candidates
          </Button>
        </Link>
      </div>
    );
  }

  const appliedPosition = positions?.find(p => p.id === activePassCandidate?.positionId);

  // Get scheduled/upcoming interviews
  const upcomingInterviews = interviews?.filter(i => 
    i.status === 'scheduled' || i.status === 'confirmed'
  ).sort((a, b) => new Date(a.interviewDate).getTime() - new Date(b.interviewDate).getTime()) || [];

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'new': 'Application Received',
      'screening': 'Under Review',
      'shortlisted': 'Shortlisted',
      'interview': 'Interview Stage',
      'offer': 'Offer Stage',
      'hired': 'Hired',
      'rejected': 'Not Selected',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'new': 'bg-blue-100 text-blue-700',
      'screening': 'bg-amber-100 text-amber-700',
      'shortlisted': 'bg-purple-100 text-purple-700',
      'interview': 'bg-cyan-100 text-cyan-700',
      'offer': 'bg-green-100 text-green-700',
      'hired': 'bg-emerald-100 text-emerald-700',
      'rejected': 'bg-gray-100 text-gray-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      {/* Print Controls - Hidden on print */}
      <div className="print:hidden sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <Link href={`/candidates/${candidateId}`}>
            <Button variant="ghost" size="icon" className="rounded-xl" data-testid="button-back-from-candidate-pass">
              <ArrowLeft className="w-5 h-5" strokeWidth={2} />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              className="rounded-xl gap-2"
              onClick={handlePrint}
              data-testid="button-print-candidate-pass"
            >
              <Printer className="w-4 h-4" strokeWidth={2} />
              Print Pass
            </Button>
          </div>
        </div>
      </div>

      {/* Candidate Pass Document */}
      <div className="max-w-4xl mx-auto p-8 print:p-0 print:max-w-none">
        <div className="bg-white rounded-2xl shadow-sm border print:shadow-none print:border-none print:rounded-none">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-[#00C853] to-[#00E676] text-white p-8 rounded-t-2xl print:rounded-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-white/80 text-sm mb-2">
                  <Building2 className="w-4 h-4" strokeWidth={2} />
                  HirePass
                </div>
                <h1 className="text-3xl font-bold tracking-tight">CANDIDATE PASS</h1>
                <p className="text-white/90 mt-1">Interview Authorization Document</p>
              </div>
              <div className="text-right">
                <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-3">
                  <div className="text-white/80 text-xs uppercase tracking-wide">Candidate ID</div>
                  <div className="text-2xl font-bold font-mono">C-{candidate.id.toString().padStart(4, '0')}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Application Status Bar */}
          <div className="bg-gray-50 px-8 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#00C853]" strokeWidth={2} />
                <span className="text-muted-foreground">Applied:</span>
                <span className="font-medium">
                  {candidate.createdAt ? format(new Date(candidate.createdAt), "MMM dd, yyyy") : "N/A"}
                </span>
              </div>
              {pass && (
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#00C853]" strokeWidth={2} />
                  <span className="text-muted-foreground">Pass:</span>
                  <span className="font-medium">{pass.passId}</span>
                </div>
              )}
            </div>
            {activePassCandidate && (
              <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${getStatusColor(activePassCandidate.status)}`}>
                {getStatusLabel(activePassCandidate.status)}
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="p-8 space-y-8">
            
            {/* Candidate Information */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-[#00C853]" strokeWidth={2} />
                Candidate Information
              </h2>
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="flex items-start gap-6">
                  <div className="w-20 h-20 rounded-2xl bg-[#00C853]/10 flex items-center justify-center shrink-0">
                    <User className="w-10 h-10 text-[#00C853]" strokeWidth={2} />
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{candidate.name}</div>
                      {candidate.currentTitle && (
                        <div className="text-muted-foreground">{candidate.currentTitle}</div>
                      )}
                      {candidate.currentCompany && (
                        <div className="text-sm text-muted-foreground">at {candidate.currentCompany}</div>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {candidate.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-[#00C853]" strokeWidth={2} />
                          <span>{candidate.email}</span>
                        </div>
                      )}
                      {candidate.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-[#00C853]" strokeWidth={2} />
                          <span>{candidate.phone}</span>
                        </div>
                      )}
                      {candidate.currentLocation && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-[#00C853]" strokeWidth={2} />
                          <span>{candidate.currentLocation}</span>
                        </div>
                      )}
                      {candidate.experienceYears && (
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-4 h-4 text-[#00C853]" strokeWidth={2} />
                          <span>{candidate.experienceYears} years experience</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Position Applied For */}
            {pass && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-[#00C853]" strokeWidth={2} />
                  Position Applied For
                </h2>
                <div className="bg-gray-50 rounded-xl p-6">
                  <div className="text-xl font-bold text-gray-900 mb-4">
                    {appliedPosition?.positionTitle || pass.positionTitle}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Department</div>
                      <div className="font-medium flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-[#00C853]" strokeWidth={2} />
                        {pass.department}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Location</div>
                      <div className="font-medium flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#00C853]" strokeWidth={2} />
                        {pass.location}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Employment Type</div>
                      <div className="font-medium">{pass.employmentType}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Pass Number</div>
                      <div className="font-medium font-mono">{pass.passId}</div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Interview Schedule */}
            {upcomingInterviews.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#00C853]" strokeWidth={2} />
                  Interview Schedule
                </h2>
                <div className="space-y-4">
                  {upcomingInterviews.map((interview, index) => (
                    <div key={interview.id} className="border rounded-xl p-5 bg-white">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#00C853]/10 flex items-center justify-center">
                            {interview.format === 'video' || interview.format === 'virtual' ? (
                              <Video className="w-5 h-5 text-[#00C853]" strokeWidth={2} />
                            ) : interview.format === 'panel' ? (
                              <Users className="w-5 h-5 text-[#00C853]" strokeWidth={2} />
                            ) : (
                              <User className="w-5 h-5 text-[#00C853]" strokeWidth={2} />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">
                              {interview.roundName || `Round ${interview.roundNumber}`}
                            </div>
                            <div className="text-sm text-muted-foreground capitalize">
                              {interview.format} Interview
                            </div>
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                          interview.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {interview.status === 'confirmed' ? 'Confirmed' : 'Scheduled'}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-[#00C853]" strokeWidth={2} />
                          <span className="text-muted-foreground">Date:</span>
                          <span className="font-medium">
                            {format(new Date(interview.interviewDate), "EEEE, MMMM dd, yyyy")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-[#00C853]" strokeWidth={2} />
                          <span className="text-muted-foreground">Time:</span>
                          <span className="font-medium">
                            {interview.startTime} - {interview.endTime}
                          </span>
                        </div>
                        {interview.location && (
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-[#00C853]" strokeWidth={2} />
                            <span className="text-muted-foreground">Location:</span>
                            <span className="font-medium">{interview.location}</span>
                          </div>
                        )}
                      </div>

                      {interview.meetingLink && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                          <div className="text-xs text-blue-600 uppercase tracking-wide mb-1">Meeting Link</div>
                          <div className="text-sm font-medium text-blue-800 break-all">{interview.meetingLink}</div>
                        </div>
                      )}

                      {interview.interviewNotes && (
                        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</div>
                          <div className="text-sm">{interview.interviewNotes}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Important Information */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#00C853]" strokeWidth={2} />
                Important Information
              </h2>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                <ul className="space-y-3 text-sm text-amber-900">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" strokeWidth={2} />
                    <span>Please arrive 15 minutes before your scheduled interview time</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" strokeWidth={2} />
                    <span>Bring a valid photo ID and this pass for verification</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" strokeWidth={2} />
                    <span>For virtual interviews, test your audio/video connection beforehand</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" strokeWidth={2} />
                    <span>Contact HR if you need to reschedule: recruitment@hirepass.example</span>
                  </li>
                </ul>
              </div>
            </section>

            {/* Company Contact */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#00C853]" strokeWidth={2} />
                Company Contact
              </h2>
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <div className="font-semibold text-gray-900 mb-2">Hiring Team</div>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" strokeWidth={2} />
                        Location shared by the hiring team
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4" strokeWidth={2} />
                        recruitment@hirepass.example
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4" strokeWidth={2} />
                        Contact number shared by the hiring team
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Office Hours</div>
                    <div className="text-sm text-muted-foreground">
                      <div>Sunday - Thursday: 8:00 AM - 5:00 PM</div>
                      <div>Friday - Saturday: Closed</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Verification Section for Print */}
            <section className="border-t pt-8 mt-8 print:block">
              <div className="grid grid-cols-2 gap-12">
                <div>
                  <div className="text-sm text-muted-foreground mb-8">Security Verification</div>
                  <div className="border-b border-gray-300 mb-2"></div>
                  <div className="text-sm text-muted-foreground">Guard Name & Date</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-8">HR Verification</div>
                  <div className="border-b border-gray-300 mb-2"></div>
                  <div className="text-sm text-muted-foreground">HR Name & Date</div>
                </div>
              </div>
            </section>

          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-8 py-4 rounded-b-2xl print:rounded-none border-t text-center text-xs text-muted-foreground">
            <p>HirePass candidate pass</p>
            <p className="mt-1">This is an official candidate pass. Generated on {format(new Date(), "MMMM dd, yyyy 'at' HH:mm")}</p>
          </div>

        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:block {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}

