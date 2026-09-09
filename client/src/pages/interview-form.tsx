import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { z } from "zod";
import {
  ArrowLeft,
  Loader2,
  Calendar,
  Clock,
  Video,
  MapPin,
  User,
  FileText,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
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
import type { Pass, Candidate, Manager, Interview } from "@shared/schema";

interface PassCandidate {
  id: number;
  passId: number;
  candidateId: number;
  status: string;
  candidate?: Candidate;
}

const interviewFormSchema = z.object({
  passId: z.string().min(1, "Recruitment pass is required"),
  passCandidateId: z.string().min(1, "Candidate is required"),
  interviewerId: z.string().min(1, "Interviewer is required"),
  interviewDate: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  duration: z.coerce.number().min(15, "Duration must be at least 15 minutes"),
  format: z.string().min(1, "Format is required"),
  roundNumber: z.coerce.number().min(1).default(1),
  roundName: z.string().optional(),
  location: z.string().optional(),
  meetingLink: z.string().url().optional().or(z.literal("")),
  interviewNotes: z.string().optional(),
});

type InterviewFormValues = z.infer<typeof interviewFormSchema>;

export default function InterviewForm() {
  const [, setLocation] = useLocation();
  const [, editParams] = useRoute("/interviews/:id/edit");
  const interviewId = editParams?.id;
  const { toast } = useToast();
  const [selectedPassId, setSelectedPassId] = useState<string>("");

  const { data: passes } = useQuery<Pass[]>({
    queryKey: ["/api/passes"],
  });

  const { data: passCandidates } = useQuery<PassCandidate[]>({
    queryKey: ["/api/passes", selectedPassId, "candidates"],
    enabled: !!selectedPassId,
  });

  const { data: managers } = useQuery<Manager[]>({
    queryKey: ["/api/managers"],
  });
  const { data: existingInterview } = useQuery<Interview>({ queryKey: ["/api/interviews", interviewId], enabled: !!interviewId });

  const form = useForm<InterviewFormValues>({
    resolver: zodResolver(interviewFormSchema),
    defaultValues: {
      passId: "",
      passCandidateId: "",
      interviewerId: "",
      interviewDate: "",
      startTime: "09:00",
      duration: 60,
      format: "video",
      roundNumber: 1,
      roundName: "Screening",
      location: "",
      meetingLink: "",
      interviewNotes: "",
    },
  });

  useEffect(() => {
    if (!existingInterview) return;
    setSelectedPassId(String(existingInterview.passId));
    form.reset({
      passId: String(existingInterview.passId), passCandidateId: String(existingInterview.passCandidateId),
      interviewerId: existingInterview.interviewerId ? String(existingInterview.interviewerId) : "",
      interviewDate: existingInterview.interviewDate, startTime: existingInterview.startTime,
      duration: existingInterview.duration, format: existingInterview.format,
      roundNumber: existingInterview.roundNumber ?? 1, roundName: existingInterview.roundName ?? "Screening",
      location: existingInterview.location ?? "", meetingLink: existingInterview.meetingLink ?? "",
      interviewNotes: existingInterview.interviewNotes ?? "",
    });
  }, [existingInterview, form]);

  const mutation = useMutation({
    mutationFn: async (data: InterviewFormValues) => {
      const payload = {
        passId: parseInt(data.passId),
        passCandidateId: parseInt(data.passCandidateId),
        interviewDate: data.interviewDate,
        startTime: data.startTime,
        endTime: data.startTime,
        duration: data.duration,
        interviewerId: parseInt(data.interviewerId),
        format: data.format,
        roundNumber: data.roundNumber,
        roundName: data.roundName || null,
        location: data.location || null,
        meetingLink: data.meetingLink || null,
        interviewNotes: data.interviewNotes || null,
        status: "scheduled",
      };

      await apiRequest(interviewId ? "PATCH" : "POST", interviewId ? `/api/interviews/${interviewId}` : "/api/interviews", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      toast({
        title: interviewId ? "Interview rescheduled" : "Interview scheduled",
        description: interviewId ? "The updated schedule is now visible on the Pass." : "The interview has been scheduled successfully.",
      });
      setLocation("/interviews");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to schedule interview. Please try again.",
        variant: "destructive",
      });
    },
  });

  const activePasses = passes?.filter(p => p.status === "active" || p.status === "draft");

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/interviews">
          <Button variant="ghost" size="icon" className="rounded-xl" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Schedule Interview</h1>
          <p className="text-muted-foreground mt-1">
            Set up a new interview with a candidate
          </p>
        </div>
      </div>

      <GlassCard>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
            <FormField
              control={form.control}
              name="passId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    Recruitment Pass
                  </FormLabel>
                  <Select 
                    onValueChange={(value) => {
                      field.onChange(value);
                      setSelectedPassId(value);
                      form.setValue("passCandidateId", "");
                    }} 
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="rounded-xl" data-testid="select-pass">
                        <SelectValue placeholder="Select recruitment pass" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activePasses?.map((pass) => (
                        <SelectItem key={pass.id} value={String(pass.id)}>
                          {pass.passId} - {pass.positionTitle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="passCandidateId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    Candidate
                  </FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value}
                    disabled={!selectedPassId}
                  >
                    <FormControl>
                      <SelectTrigger className="rounded-xl" data-testid="select-candidate">
                        <SelectValue placeholder={selectedPassId ? "Select candidate" : "Select a pass first"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {passCandidates?.map((pc) => (
                        <SelectItem key={pc.id} value={String(pc.id)}>
                          {pc.candidate?.name || `Candidate #${pc.candidateId}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="roundNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Round Number</FormLabel>
                    <Select onValueChange={(v) => field.onChange(parseInt(v))} value={String(field.value)}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl" data-testid="select-round">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">Round 1</SelectItem>
                        <SelectItem value="2">Round 2</SelectItem>
                        <SelectItem value="3">Round 3</SelectItem>
                        <SelectItem value="4">Round 4</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="roundName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Round Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl" data-testid="select-round-name">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Screening">Screening</SelectItem>
                        <SelectItem value="Hiring Manager">Hiring Manager</SelectItem>
                        <SelectItem value="Technical">Technical</SelectItem>
                        <SelectItem value="Panel">Panel</SelectItem>
                        <SelectItem value="Final">Final</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField control={form.control} name="interviewerId" render={({ field }) => (
              <FormItem>
                <FormLabel>Primary interviewer</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger className="rounded-xl" data-testid="select-interviewer"><SelectValue placeholder="Select interviewer" /></SelectTrigger></FormControl>
                  <SelectContent>{managers?.filter((manager) => manager.canBeInterviewer).map((manager) => <SelectItem key={manager.id} value={String(manager.id)}>{manager.name} — {manager.jobTitle}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="interviewDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" strokeWidth={1.5} />
                      Date
                    </FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="date" 
                        className="rounded-xl" 
                        data-testid="input-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" strokeWidth={1.5} />
                      Start Time
                    </FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="time" 
                        className="rounded-xl" 
                        data-testid="input-time"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (minutes)</FormLabel>
                    <Select onValueChange={(v) => field.onChange(parseInt(v))} value={String(field.value)}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl" data-testid="select-duration">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="45">45 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="90">1.5 hours</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="format"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Format</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl" data-testid="select-format">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="video">Video Call</SelectItem>
                        <SelectItem value="phone">Phone Call</SelectItem>
                        <SelectItem value="in-person">In-Person</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="meetingLink"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    Meeting Link (optional)
                  </FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="https://meet.google.com/..." 
                      className="rounded-xl" 
                      data-testid="input-meeting-link"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    Location (optional)
                  </FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="Conference Room A, Floor 3" 
                      className="rounded-xl" 
                      data-testid="input-location"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="interviewNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      rows={3}
                      placeholder="Interview preparation notes..."
                      className="rounded-xl resize-none"
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Link href="/interviews">
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
                {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Schedule Interview
              </Button>
            </div>
          </form>
        </Form>
      </GlassCard>
    </div>
  );
}
