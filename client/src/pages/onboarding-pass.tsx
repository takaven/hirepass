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
  Circle,
  ClipboardList,
  FolderOpen,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Candidate, Pass, Offer, OnboardingRecord } from "@shared/schema";

interface PassCandidate {
  id: number;
  passId: number;
  candidateId: number;
  status: string;
  positionId: number | null;
}

interface PassPosition {
  id: number;
  passId: number;
  positionTitle: string;
  headcount: number;
}

interface ChecklistItem {
  item: string;
  completed: boolean;
  completedAt?: string;
}

interface RequiredDocument {
  name: string;
  received: boolean;
  receivedAt?: string;
}

interface OnboardingPassProps {
  passIdParam?: string; // Clean pass ID like BAYN-OP-2025-001 (for future use)
  params?: { id?: string }; // From wouter route
}

export default function OnboardingPass({ passIdParam, params: propsParams }: OnboardingPassProps = {}) {
  const [, routeParams] = useRoute("/candidates/:id/onboarding-pass");
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

  // Get the hired pass association (status = 'hired')
  const hiredPassCandidate = passCandidates?.find(pc => pc.status === 'hired') || passCandidates?.[0];

  const { data: pass } = useQuery<Pass>({
    queryKey: ["/api/passes", hiredPassCandidate?.passId?.toString()],
    enabled: !!hiredPassCandidate?.passId,
  });

  const { data: positions } = useQuery<PassPosition[]>({
    queryKey: ["/api/passes", hiredPassCandidate?.passId?.toString(), "positions"],
    enabled: !!hiredPassCandidate?.passId,
  });

  // Get offer for this candidate
  const { data: offers } = useQuery<Offer[]>({
    queryKey: ["/api/pass-candidates", hiredPassCandidate?.id?.toString(), "offers"],
    enabled: !!hiredPassCandidate?.id,
  });

  const acceptedOffer = offers?.find(o => o.status === 'accepted') || offers?.[0];

  // Get onboarding record
  const { data: onboardingRecord } = useQuery<OnboardingRecord>({
    queryKey: ["/api/onboarding", hiredPassCandidate?.id?.toString()],
    enabled: !!hiredPassCandidate?.id,
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

  const appliedPosition = positions?.find(p => p.id === hiredPassCandidate?.positionId);

  // Default checklist if no onboarding record
  const checklistItems: ChecklistItem[] = (onboardingRecord?.checklistItems as ChecklistItem[]) || [
    { item: "Employment contract signed", completed: false },
    { item: "ID documents collected", completed: false },
    { item: "Bank details provided", completed: false },
    { item: "Emergency contact information", completed: false },
    { item: "IT equipment issued", completed: false },
    { item: "Access cards/badges issued", completed: false },
    { item: "Email account created", completed: false },
    { item: "System access granted", completed: false },
    { item: "Orientation session completed", completed: false },
    { item: "Department introduction completed", completed: false },
    { item: "Safety training completed", completed: false },
    { item: "Company policies reviewed", completed: false },
  ];

  const requiredDocuments: RequiredDocument[] = (onboardingRecord?.requiredDocuments as RequiredDocument[]) || [
    { name: "Passport copy", received: false },
    { name: "Emirates ID copy", received: false },
    { name: "Visa copy", received: false },
    { name: "Educational certificates", received: false },
    { name: "Experience certificates", received: false },
    { name: "Passport photos", received: false },
  ];

  const completedCount = checklistItems.filter(item => item.completed).length;
  const totalCount = checklistItems.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  const documentsReceivedCount = requiredDocuments.filter(doc => doc.received).length;

  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      {/* Print Controls - Hidden on print */}
      <div className="print:hidden sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <Link href={`/candidates/${candidateId}`}>
            <Button variant="ghost" size="icon" className="rounded-xl" data-testid="button-back-from-onboarding-pass">
              <ArrowLeft className="w-5 h-5" strokeWidth={2} />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              className="rounded-xl gap-2"
              onClick={handlePrint}
              data-testid="button-print-onboarding-pass"
            >
              <Printer className="w-4 h-4" strokeWidth={2} />
              Print Pass
            </Button>
          </div>
        </div>
      </div>

      {/* Onboarding Pass Document */}
      <div className="max-w-4xl mx-auto p-8 print:p-0 print:max-w-none">
        <div className="bg-white rounded-2xl shadow-sm border print:shadow-none print:border-none print:rounded-none">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-[#00C853] to-[#00E676] text-white p-8 rounded-t-2xl print:rounded-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-white/80 text-sm mb-2">
                  <Building2 className="w-4 h-4" strokeWidth={2} />
                  HirePass Demo Company
                </div>
                <h1 className="text-3xl font-bold tracking-tight">ONBOARDING PASS</h1>
                <p className="text-white/90 mt-1">New Employee Onboarding Document</p>
              </div>
              <div className="text-right">
                <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-3">
                  <div className="text-white/80 text-xs uppercase tracking-wide">Employee ID</div>
                  <div className="text-2xl font-bold font-mono">
                    {onboardingRecord?.employeeId || `EMP-${candidate.id.toString().padStart(4, '0')}`}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Status Bar */}
          <div className="bg-gray-50 px-8 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#00C853]" strokeWidth={2} />
                <span className="text-muted-foreground">Start Date:</span>
                <span className="font-medium">
                  {onboardingRecord?.startDate 
                    ? format(new Date(onboardingRecord.startDate), "MMM dd, yyyy")
                    : acceptedOffer?.startDate
                      ? format(new Date(acceptedOffer.startDate), "MMM dd, yyyy")
                      : "To be confirmed"}
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
            <div className="flex items-center gap-2">
              <div className="text-sm text-muted-foreground">Onboarding Progress:</div>
              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#00C853] transition-all duration-300" 
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-sm font-medium">{progressPercent}%</span>
            </div>
          </div>

          {/* Main Content */}
          <div className="p-8 space-y-8">
            
            {/* Employee Information */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-[#00C853]" strokeWidth={2} />
                Employee Information
              </h2>
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="flex items-start gap-6">
                  <div className="w-20 h-20 rounded-2xl bg-[#00C853]/10 flex items-center justify-center shrink-0">
                    <User className="w-10 h-10 text-[#00C853]" strokeWidth={2} />
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{candidate.name}</div>
                      <div className="text-[#00C853] font-medium mt-1">
                        {appliedPosition?.positionTitle || pass?.positionTitle || "New Employee"}
                      </div>
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
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Position Details */}
            {pass && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-[#00C853]" strokeWidth={2} />
                  Position Details
                </h2>
                <div className="bg-gray-50 rounded-xl p-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Position</div>
                      <div className="font-medium">
                        {appliedPosition?.positionTitle || pass.positionTitle}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Department</div>
                      <div className="font-medium flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-[#00C853]" strokeWidth={2} />
                        {onboardingRecord?.department || pass.department}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Location</div>
                      <div className="font-medium flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#00C853]" strokeWidth={2} />
                        {onboardingRecord?.workLocation || pass.location}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Reports To</div>
                      <div className="font-medium">
                        {onboardingRecord?.reportingTo || "To be assigned"}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Offer Summary */}
            {acceptedOffer && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#00C853]" strokeWidth={2} />
                  Offer Summary
                </h2>
                <div className="bg-gray-50 rounded-xl p-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Salary</div>
                      <div className="font-semibold text-lg">
                        {acceptedOffer.salaryCurrency} {acceptedOffer.salary.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">per month</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Contract Type</div>
                      <div className="font-medium">{acceptedOffer.contractType || "Full-time"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Probation Period</div>
                      <div className="font-medium">
                        {acceptedOffer.probationPeriod ? `${acceptedOffer.probationPeriod} months` : "3 months"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Start Date</div>
                      <div className="font-medium flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#00C853]" strokeWidth={2} />
                        {acceptedOffer.startDate 
                          ? format(new Date(acceptedOffer.startDate), "MMM dd, yyyy")
                          : "To be confirmed"}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Onboarding Checklist */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-[#00C853]" strokeWidth={2} />
                Onboarding Checklist
                <span className="text-sm font-normal text-muted-foreground ml-auto">
                  {completedCount} of {totalCount} completed
                </span>
              </h2>
              <div className="border rounded-xl overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2">
                  {checklistItems.map((item, index) => (
                    <div 
                      key={index} 
                      className={`flex items-center gap-3 p-4 ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                      } border-b last:border-b-0 md:last:border-b md:[&:nth-last-child(2)]:border-b-0`}
                    >
                      {item.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-[#00C853] shrink-0" strokeWidth={2} />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300 shrink-0" strokeWidth={2} />
                      )}
                      <span className={`text-sm ${item.completed ? 'text-gray-500 line-through' : 'text-gray-700'}`}>
                        {item.item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Required Documents */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-[#00C853]" strokeWidth={2} />
                Required Documents
                <span className="text-sm font-normal text-muted-foreground ml-auto">
                  {documentsReceivedCount} of {requiredDocuments.length} received
                </span>
              </h2>
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Document</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600 print:hidden">Signature</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {requiredDocuments.map((doc, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-4 py-3 font-medium flex items-center gap-2">
                          {doc.received ? (
                            <CheckCircle2 className="w-4 h-4 text-[#00C853]" strokeWidth={2} />
                          ) : (
                            <Circle className="w-4 h-4 text-gray-300" strokeWidth={2} />
                          )}
                          {doc.name}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            doc.received ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {doc.received ? 'Received' : 'Pending'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center print:hidden">
                          <div className="w-24 border-b border-gray-300 mx-auto"></div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* First Day Information */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#00C853]" strokeWidth={2} />
                First Day Information
              </h2>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <div>
                    <div className="font-semibold text-blue-900 mb-3">Reporting Details</div>
                    <ul className="space-y-2 text-blue-800">
                      <li className="flex items-start gap-2">
                        <Clock className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" strokeWidth={2} />
                        <span>Arrive at 8:30 AM on your first day</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" strokeWidth={2} />
                        <span>Report to HR Department at the main reception</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <FileText className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" strokeWidth={2} />
                        <span>Bring this pass and all required documents</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <div className="font-semibold text-blue-900 mb-3">What to Expect</div>
                    <ul className="space-y-2 text-blue-800">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" strokeWidth={2} />
                        <span>ID card and access badge issuance</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" strokeWidth={2} />
                        <span>IT equipment setup and account creation</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" strokeWidth={2} />
                        <span>Department introduction and facility tour</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* Notes */}
            {onboardingRecord?.notes && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Additional Notes</h2>
                <div className="bg-gray-50 rounded-xl p-6">
                  <p className="text-gray-700 whitespace-pre-wrap">{onboardingRecord.notes}</p>
                </div>
              </section>
            )}

            {/* Signature Section for Print */}
            <section className="border-t pt-8 mt-8 print:block">
              <div className="grid grid-cols-3 gap-8">
                <div>
                  <div className="text-sm text-muted-foreground mb-8">Employee Signature</div>
                  <div className="border-b border-gray-300 mb-2"></div>
                  <div className="text-sm text-muted-foreground">Name & Date</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-8">HR Officer Signature</div>
                  <div className="border-b border-gray-300 mb-2"></div>
                  <div className="text-sm text-muted-foreground">Name & Date</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-8">Department Head Signature</div>
                  <div className="border-b border-gray-300 mb-2"></div>
                  <div className="text-sm text-muted-foreground">Name & Date</div>
                </div>
              </div>
            </section>

          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-8 py-4 rounded-b-2xl print:rounded-none border-t text-center text-xs text-muted-foreground">
            <p>HirePass Demo Company - Abu Dhabi, UAE</p>
            <p className="mt-1">This is an official onboarding document. Generated on {format(new Date(), "MMMM dd, yyyy 'at' HH:mm")}</p>
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

