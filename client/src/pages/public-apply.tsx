import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Briefcase,
  MapPin,
  Clock,
  DollarSign,
  Users,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
  CheckCircle,
  Linkedin,
  Phone,
  Mail,
  User,
  Building,
  Calendar,
  Tag,
  ArrowRight,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PublicPass {
  id: number;
  passId: string;
  positionTitle: string;
  department: string;
  location: string;
  employmentType: string;
  experienceMin: number | null;
  experienceMax: number | null;
  salaryRangeMin: number | null;
  salaryRangeMax: number | null;
  salaryCurrency: string | null;
  jobDescriptionFinal: string | null;
  dateRequested: string | null;
}

const applicationSchema = z.object({
  name: z.string().min(1, "Full name is required"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().optional(),
  currentTitle: z.string().optional(),
  currentCompany: z.string().optional(),
  experienceYears: z.coerce.number().min(0).optional(),
  skills: z.string().optional(),
  expectedSalary: z.coerce.number().min(0).optional(),
  linkedinUrl: z.string().url("Please enter a valid LinkedIn URL").optional().or(z.literal("")),
  willingToRelocate: z.boolean().default(false),
});

type ApplicationFormData = z.infer<typeof applicationSchema>;

function PositionCard({ 
  position, 
  isExpanded, 
  onToggle 
}: { 
  position: PublicPass; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const { toast } = useToast();

  const form = useForm<ApplicationFormData>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      currentTitle: "",
      currentCompany: "",
      experienceYears: undefined,
      skills: "",
      expectedSalary: undefined,
      linkedinUrl: "",
      willingToRelocate: false,
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (data: ApplicationFormData) => {
      const skillsArray = data.skills 
        ? data.skills.split(",").map(s => s.trim()).filter(s => s.length > 0)
        : [];
      
      return await apiRequest("POST", "/api/public/apply", {
        passId: position.id,
        name: data.name,
        email: data.email,
        phone: data.phone || undefined,
        currentTitle: data.currentTitle || undefined,
        currentCompany: data.currentCompany || undefined,
        experienceYears: data.experienceYears || undefined,
        skills: skillsArray.length > 0 ? skillsArray : undefined,
        expectedSalary: data.expectedSalary || undefined,
        linkedinUrl: data.linkedinUrl || undefined,
        willingToRelocate: data.willingToRelocate,
        source: "public_application",
      });
    },
    onSuccess: () => {
      setSubmissionSuccess(true);
      toast({
        title: "Application Submitted",
        description: "Your application has been received. We'll be in touch soon!",
      });
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to submit application. Please try again.";
      toast({
        title: "Submission Failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ApplicationFormData) => {
    applyMutation.mutate(data);
  };

  const formatSalaryRange = () => {
    if (!position.salaryRangeMin && !position.salaryRangeMax) return null;
    const currency = position.salaryCurrency || "AED";
    const min = position.salaryRangeMin?.toLocaleString();
    const max = position.salaryRangeMax?.toLocaleString();
    if (min && max) return `${currency} ${min} - ${max}`;
    if (min) return `${currency} ${min}+`;
    if (max) return `Up to ${currency} ${max}`;
    return null;
  };

  const formatExperienceRange = () => {
    if (!position.experienceMin && !position.experienceMax) return null;
    if (position.experienceMin && position.experienceMax) {
      return `${position.experienceMin} - ${position.experienceMax} years`;
    }
    if (position.experienceMin) return `${position.experienceMin}+ years`;
    if (position.experienceMax) return `Up to ${position.experienceMax} years`;
    return null;
  };

  const salaryRange = formatSalaryRange();
  const experienceRange = formatExperienceRange();

  return (
    <GlassCard 
      variant="elevated" 
      className="overflow-hidden"
      data-testid={`position-card-${position.id}`}
    >
      <div
        className="p-6 cursor-pointer"
        onClick={onToggle}
        data-testid={`position-header-${position.id}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <h3 className="text-xl font-semibold text-foreground">
                {position.positionTitle}
              </h3>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                {position.employmentType}
              </Badge>
            </div>
            
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5">
                <Building className="w-4 h-4" strokeWidth={2} />
                {position.department}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" strokeWidth={2} />
                {position.location}
              </span>
              {experienceRange && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" strokeWidth={2} />
                  {experienceRange}
                </span>
              )}
              {salaryRange && (
                <span className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4" strokeWidth={2} />
                  {salaryRange}
                </span>
              )}
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0"
            data-testid={`toggle-expand-${position.id}`}
          >
            {isExpanded ? (
              <ChevronUp className="w-5 h-5" strokeWidth={2} />
            ) : (
              <ChevronDown className="w-5 h-5" strokeWidth={2} />
            )}
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="px-6 pb-6 border-t border-white/20 dark:border-white/10 pt-6">
          {submissionSuccess ? (
            <div className="text-center py-8" data-testid={`success-message-${position.id}`}>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <CheckCircle className="w-8 h-8 text-primary" strokeWidth={2} />
              </div>
              <h4 className="text-xl font-semibold mb-2">Application Submitted!</h4>
              <p className="text-muted-foreground max-w-md mx-auto">
                Thank you for applying to the {position.positionTitle} position. 
                Our team will review your application and get back to you soon.
              </p>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <User className="w-4 h-4" strokeWidth={2} />
                          Full Name *
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="John Doe"
                            className="rounded-xl"
                            data-testid="input-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Mail className="w-4 h-4" strokeWidth={2} />
                          Email Address *
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="john@example.com"
                            className="rounded-xl"
                            data-testid="input-email"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Phone className="w-4 h-4" strokeWidth={2} />
                          Phone Number
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="+971 50 123 4567"
                            className="rounded-xl"
                            data-testid="input-phone"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="linkedinUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Linkedin className="w-4 h-4" strokeWidth={2} />
                          LinkedIn Profile
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://linkedin.com/in/johndoe"
                            className="rounded-xl"
                            data-testid="input-linkedin"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="currentTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Briefcase className="w-4 h-4" strokeWidth={2} />
                          Current Job Title
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Software Engineer"
                            className="rounded-xl"
                            data-testid="input-current-title"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="currentCompany"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Building className="w-4 h-4" strokeWidth={2} />
                          Current Company
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Tech Corp"
                            className="rounded-xl"
                            data-testid="input-current-company"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="experienceYears"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" strokeWidth={2} />
                          Years of Experience
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            placeholder="5"
                            className="rounded-xl"
                            data-testid="input-experience-years"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="expectedSalary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4" strokeWidth={2} />
                          Expected Salary (AED/month)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            placeholder="25000"
                            className="rounded-xl"
                            data-testid="input-expected-salary"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="skills"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Tag className="w-4 h-4" strokeWidth={2} />
                        Skills (comma-separated)
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="JavaScript, React, Node.js, Python"
                          className="rounded-xl"
                          data-testid="input-skills"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="willingToRelocate"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-willing-to-relocate"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          I am willing to relocate for this position
                        </FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end pt-4">
                  <Button
                    type="submit"
                    className="rounded-xl gap-2 px-8"
                    disabled={applyMutation.isPending}
                    data-testid="button-submit-application"
                  >
                    {applyMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" strokeWidth={2} />
                        Submit Application
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </div>
      )}
    </GlassCard>
  );
}

export default function PublicApply() {
  const [expandedPosition, setExpandedPosition] = useState<number | null>(null);

  const { data: positions, isLoading } = useQuery<PublicPass[]>({
    queryKey: ["/api/public/passes"],
  });

  const togglePosition = (id: number) => {
    setExpandedPosition(expandedPosition === id ? null : id);
  };

  return (
    <div className="min-h-screen ios-gradient-bg">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
            <Briefcase className="w-8 h-8 text-primary" strokeWidth={2} />
          </div>
          <h1 className="text-4xl font-semibold tracking-tight mb-4" data-testid="page-title">
            Join Our Team
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Explore our open positions and take the next step in your career.
            We're looking for talented individuals to join our growing team.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        ) : positions?.length ? (
          <div className="space-y-4" data-testid="positions-list">
            {positions.map((position) => (
              <PositionCard
                key={position.id}
                position={position}
                isExpanded={expandedPosition === position.id}
                onToggle={() => togglePosition(position.id)}
              />
            ))}
          </div>
        ) : (
          <GlassCard className="p-12 text-center" data-testid="no-positions-message">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted/50 mb-4">
              <Users className="w-8 h-8 text-muted-foreground" strokeWidth={2} />
            </div>
            <h3 className="text-xl font-semibold mb-2">No Open Positions</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              We don't have any open positions at the moment, but check back soon!
              New opportunities are added regularly.
            </p>
          </GlassCard>
        )}

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            Questions? Contact our HR team at careers@hirepass.example
          </p>
        </div>
      </div>
    </div>
  );
}

