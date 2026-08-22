import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { z } from "zod";
import {
  ArrowLeft,
  Upload,
  Sparkles,
  Loader2,
  User,
  Mail,
  Phone,
  Briefcase,
  Building2,
  MapPin,
  Link as LinkIcon,
  DollarSign,
  Save,
  FileText,
  ClipboardList,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import type { Candidate } from "@shared/schema";

const candidateFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Valid email is required").optional().or(z.literal("")),
  phone: z.string().optional(),
  currentTitle: z.string().optional(),
  currentCompany: z.string().optional(),
  experienceYears: z.coerce.number().min(0).optional(),
  skills: z.string().optional(),
  currentLocation: z.string().optional(),
  willingToRelocate: z.boolean().optional(),
  noticePeriod: z.string().optional(),
  expectedSalary: z.coerce.number().min(0).optional(),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  source: z.string().optional(),
  sourceDetails: z.string().optional(),
  inTalentPool: z.boolean().optional(),
  talentPoolNotes: z.string().optional(),
});

type CandidateFormValues = z.infer<typeof candidateFormSchema>;

export default function CandidateForm() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isEditing = Boolean(id) && id !== "new";
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [resumeText, setResumeText] = useState("");

  const { data: candidate, isLoading: candidateLoading } = useQuery<Candidate>({
    queryKey: ["/api/candidates", id],
    enabled: isEditing,
  });

  const form = useForm<CandidateFormValues>({
    resolver: zodResolver(candidateFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      currentTitle: "",
      currentCompany: "",
      experienceYears: undefined,
      skills: "",
      currentLocation: "",
      willingToRelocate: false,
      noticePeriod: "",
      expectedSalary: undefined,
      linkedinUrl: "",
      source: "Direct",
      sourceDetails: "",
      inTalentPool: false,
      talentPoolNotes: "",
    },
  });

  if (candidate && form.getValues("name") === "") {
    form.reset({
      name: candidate.name,
      email: candidate.email || "",
      phone: candidate.phone || "",
      currentTitle: candidate.currentTitle || "",
      currentCompany: candidate.currentCompany || "",
      experienceYears: candidate.experienceYears ?? undefined,
      skills: (candidate.skills as string[])?.join(", ") || "",
      currentLocation: candidate.currentLocation || "",
      willingToRelocate: candidate.willingToRelocate || false,
      noticePeriod: candidate.noticePeriod || "",
      expectedSalary: candidate.expectedSalary ?? undefined,
      linkedinUrl: candidate.linkedinUrl || "",
      source: candidate.source || "Direct",
      sourceDetails: candidate.sourceDetails || "",
      inTalentPool: candidate.inTalentPool || false,
      talentPoolNotes: candidate.talentPoolNotes || "",
    });
  }

  const mutation = useMutation({
    mutationFn: async (data: CandidateFormValues) => {
      const payload = {
        ...data,
        skills: data.skills ? data.skills.split(",").map(s => s.trim()).filter(Boolean) : [],
        experienceYears: data.experienceYears || null,
        expectedSalary: data.expectedSalary || null,
        linkedinUrl: data.linkedinUrl || null,
        email: data.email || null,
      };

      if (isEditing) {
        await apiRequest("PATCH", `/api/candidates/${id}`, payload);
      } else {
        await apiRequest("POST", "/api/candidates", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      toast({
        title: isEditing ? "Candidate updated" : "Candidate created",
        description: isEditing 
          ? "The candidate has been updated successfully."
          : "The candidate has been added to your pipeline.",
      });
      setLocation("/candidates");
    },
    onError: () => {
      toast({
        title: "Error",
        description: `Failed to ${isEditing ? "update" : "create"} candidate. Please try again.`,
        variant: "destructive",
      });
    },
  });

  const handleResumeUpload = async (file: File) => {
    setResumeFile(file);
    
    if (file.type === "text/plain" || file.name.endsWith('.txt')) {
      const text = await file.text();
      setResumeText(text);
      analyzeResume(text);
    } else {
      toast({
        title: "File uploaded",
        description: "For best results, please paste the resume text below.",
      });
    }
  };

  const analyzeResume = async (text: string) => {
    if (!text || text.length < 50) {
      toast({ title: "Please provide more resume text for analysis", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);

    try {
      const response = await apiRequest("POST", "/api/ai/analyze-resume", { resumeText: text });
      const analysis = await response.json();
      
      if (analysis.name) form.setValue("name", analysis.name);
      if (analysis.email) form.setValue("email", analysis.email);
      if (analysis.phone) form.setValue("phone", analysis.phone);
      if (analysis.currentCompany) form.setValue("currentCompany", analysis.currentCompany);
      if (analysis.currentTitle) form.setValue("currentTitle", analysis.currentTitle);
      if (analysis.experienceYears) form.setValue("experienceYears", analysis.experienceYears);
      if (analysis.skills) form.setValue("skills", analysis.skills.join(", "));

      toast({
        title: "Resume analyzed",
        description: "Information has been extracted from the resume.",
      });
    } catch (error) {
      toast({
        title: "Analysis failed",
        description: "Could not analyze resume. Please fill in details manually.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (candidateLoading && isEditing) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href="/candidates">
            <Button variant="ghost" size="icon" className="rounded-xl" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {isEditing ? "Edit Candidate" : "Add Candidate"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {isEditing ? "Update candidate information" : "Add a new candidate to your pipeline"}
            </p>
          </div>
        </div>
        {isEditing && (
          <div className="flex items-center gap-2">
            <Link href={`/candidates/${id}/pass`}>
              <Button variant="outline" className="rounded-xl gap-2" data-testid="button-view-candidate-pass">
                <FileText className="w-4 h-4" strokeWidth={2} />
                Candidate Pass
              </Button>
            </Link>
            <Link href={`/candidates/${id}/onboarding-pass`}>
              <Button variant="outline" className="rounded-xl gap-2" data-testid="button-view-onboarding-pass">
                <ClipboardList className="w-4 h-4" strokeWidth={2} />
                Onboarding Pass
              </Button>
            </Link>
          </div>
        )}
      </div>

      <GlassCard className="p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium mb-3">Resume Upload & Analysis</label>
          <div 
            className="border-2 border-dashed border-primary/30 rounded-2xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => document.getElementById("resume-input")?.click()}
          >
            <input
              id="resume-input"
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleResumeUpload(file);
              }}
              data-testid="input-resume-upload"
            />
            {isAnalyzing ? (
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 rounded-2xl bg-primary/10">
                  <Sparkles className="w-8 h-8 text-primary animate-pulse" strokeWidth={1.5} />
                </div>
                <p className="font-medium">Analyzing resume...</p>
                <p className="text-sm text-muted-foreground">Extracting candidate information</p>
              </div>
            ) : resumeFile ? (
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 rounded-2xl bg-primary/10">
                  <Sparkles className="w-8 h-8 text-primary" strokeWidth={1.5} />
                </div>
                <p className="font-medium">{resumeFile.name}</p>
                <p className="text-sm text-muted-foreground">Click to upload a different file</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 rounded-2xl bg-muted">
                  <Upload className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <p className="font-medium">Upload Resume</p>
                <p className="text-sm text-muted-foreground">
                  PDF, Word, or text file - AI will extract details
                </p>
              </div>
            )}
          </div>
          
          <div className="mt-4">
            <label className="block text-sm font-medium mb-2">Or paste resume text for AI analysis</label>
            <Textarea
              placeholder="Paste resume text here for AI analysis..."
              className="min-h-[100px] rounded-xl"
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              data-testid="textarea-resume-text"
            />
            <Button 
              type="button"
              variant="outline"
              className="mt-2 rounded-xl gap-2"
              onClick={() => analyzeResume(resumeText)}
              disabled={isAnalyzing || resumeText.length < 50}
              data-testid="button-analyze-resume"
            >
              {isAnalyzing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" strokeWidth={1.5} />
              )}
              Analyze with AI
            </Button>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    Full Name
                  </FormLabel>
                  <FormControl>
                    <Input {...field} className="rounded-xl" placeholder="John Doe" data-testid="input-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-primary" strokeWidth={1.5} />
                      Email
                    </FormLabel>
                    <FormControl>
                      <Input {...field} type="email" className="rounded-xl" data-testid="input-email" />
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
                      <Phone className="w-4 h-4 text-primary" strokeWidth={1.5} />
                      Phone
                    </FormLabel>
                    <FormControl>
                      <Input {...field} className="rounded-xl" placeholder="+971 XX XXX XXXX" data-testid="input-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="currentTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-primary" strokeWidth={1.5} />
                      Current Title
                    </FormLabel>
                    <FormControl>
                      <Input {...field} className="rounded-xl" placeholder="Sales Manager" data-testid="input-title" />
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
                      <Building2 className="w-4 h-4 text-primary" strokeWidth={1.5} />
                      Current Company
                    </FormLabel>
                    <FormControl>
                      <Input {...field} className="rounded-xl" data-testid="input-company" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="experienceYears"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Years of Experience</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number" 
                        min="0" 
                        className="rounded-xl" 
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        data-testid="input-experience" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currentLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" strokeWidth={1.5} />
                      Current Location
                    </FormLabel>
                    <FormControl>
                      <Input {...field} className="rounded-xl" placeholder="Dubai, UAE" data-testid="input-location" />
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
                  <FormLabel>Skills (comma-separated)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Sales, Negotiation, CRM, B2B" className="rounded-xl" data-testid="input-skills" />
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
                    <LinkIcon className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    LinkedIn URL
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="https://linkedin.com/in/..." className="rounded-xl" data-testid="input-linkedin" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="noticePeriod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notice Period</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl" data-testid="select-notice-period">
                          <SelectValue placeholder="Select period" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="immediate">Immediate</SelectItem>
                        <SelectItem value="1_week">1 Week</SelectItem>
                        <SelectItem value="2_weeks">2 Weeks</SelectItem>
                        <SelectItem value="1_month">1 Month</SelectItem>
                        <SelectItem value="2_months">2 Months</SelectItem>
                        <SelectItem value="3_months">3 Months</SelectItem>
                      </SelectContent>
                    </Select>
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
                      <DollarSign className="w-4 h-4 text-primary" strokeWidth={1.5} />
                      Expected Salary (AED)
                    </FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number" 
                        min="0" 
                        className="rounded-xl" 
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        data-testid="input-salary" 
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
                  <FormItem className="flex flex-row items-center justify-between rounded-xl border p-3">
                    <div>
                      <FormLabel>Willing to Relocate</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-relocate"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl" data-testid="select-source">
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Direct">Direct Application</SelectItem>
                        <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                        <SelectItem value="Referral">Employee Referral</SelectItem>
                        <SelectItem value="Agency">Recruitment Agency</SelectItem>
                        <SelectItem value="Indeed">Indeed</SelectItem>
                        <SelectItem value="Bayt">Bayt</SelectItem>
                        <SelectItem value="GulfTalent">GulfTalent</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sourceDetails"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source Details</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Referred by John" className="rounded-xl" data-testid="input-source-details" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4 border rounded-xl p-4">
              <FormField
                control={form.control}
                name="inTalentPool"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between">
                    <div>
                      <FormLabel>Add to Talent Pool</FormLabel>
                      <FormDescription>
                        Keep this candidate in pool for future opportunities
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-talent-pool"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              {form.watch("inTalentPool") && (
                <FormField
                  control={form.control}
                  name="talentPoolNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Talent Pool Notes</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          rows={3}
                          placeholder="Notes about why this candidate is in the talent pool..."
                          className="rounded-xl resize-none"
                          data-testid="textarea-talent-pool-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Link href="/candidates">
                <Button type="button" variant="outline" className="rounded-xl" data-testid="button-cancel">
                  Cancel
                </Button>
              </Link>
              <Button 
                type="submit" 
                disabled={mutation.isPending}
                className="rounded-xl gap-2"
                data-testid="button-submit"
              >
                {mutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" strokeWidth={1.5} />
                )}
                {isEditing ? "Update Candidate" : "Add Candidate"}
              </Button>
            </div>
          </form>
        </Form>
      </GlassCard>
    </div>
  );
}
