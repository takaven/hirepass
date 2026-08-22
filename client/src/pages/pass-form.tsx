import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Save, Sparkles, Loader2, Plus, Trash2, ChevronDown, ChevronUp, Briefcase } from "lucide-react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import type { Pass, Manager, PassPosition } from "@shared/schema";
import { insertPassSchema } from "@shared/schema";
import { useState, useEffect } from "react";

const positionSchema = z.object({
  id: z.number().optional(),
  positionTitle: z.string().min(2, "Position title must be at least 2 characters"),
  headcount: z.number().min(1, "Headcount must be at least 1"),
  experienceMin: z.number().optional(),
  experienceMax: z.number().optional(),
  salaryRangeMin: z.number().optional(),
  salaryRangeMax: z.number().optional(),
  salaryCurrency: z.string().default("AED"),
  requirements: z.string().optional(),
});

const formSchema = insertPassSchema.extend({
  positionTitle: z.string().min(2, "Request name must be at least 2 characters"),
  department: z.string().min(1, "Department is required"),
  location: z.string().min(1, "Location is required"),
  employmentType: z.string().min(1, "Employment type is required"),
  positions: z.array(positionSchema).min(1, "At least one position is required"),
});

type PositionData = z.infer<typeof positionSchema>;
type FormData = z.infer<typeof formSchema>;

export default function PassForm() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/passes/:id");
  const [, editParams] = useRoute("/passes/:id/edit");
  const { toast } = useToast();
  const [isGeneratingJD, setIsGeneratingJD] = useState(false);
  const [expandedPositions, setExpandedPositions] = useState<Set<number>>(new Set([0]));

  const passId = params?.id || editParams?.id;
  const isEditing = Boolean(passId && passId !== "new");

  const { data: pass, isLoading: passLoading } = useQuery<Pass>({
    queryKey: ["/api/passes", passId],
    enabled: isEditing,
  });

  const { data: existingPositions, isLoading: positionsLoading } = useQuery<PassPosition[]>({
    queryKey: ["/api/passes", passId, "positions"],
    enabled: isEditing,
  });

  const { data: managers } = useQuery<Manager[]>({
    queryKey: ["/api/managers"],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      positionTitle: "",
      headcount: 1,
      department: "",
      location: "Abu Dhabi, UAE",
      employmentType: "Full-time",
      experienceMin: undefined,
      experienceMax: undefined,
      salaryRangeMin: undefined,
      salaryRangeMax: undefined,
      salaryCurrency: "AED",
      priority: "medium",
      hiringManagerId: undefined,
      notes: "",
      jobDescriptionDraft: "",
      positions: [{
        positionTitle: "",
        headcount: 1,
        experienceMin: undefined,
        experienceMax: undefined,
        salaryRangeMin: undefined,
        salaryRangeMax: undefined,
        salaryCurrency: "AED",
        requirements: "",
      }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "positions",
  });

  useEffect(() => {
    if (pass && form.getValues("positionTitle") === "") {
      form.reset({
        positionTitle: pass.positionTitle,
        headcount: pass.headcount,
        department: pass.department,
        location: pass.location,
        employmentType: pass.employmentType,
        experienceMin: pass.experienceMin ?? undefined,
        experienceMax: pass.experienceMax ?? undefined,
        salaryRangeMin: pass.salaryRangeMin ?? undefined,
        salaryRangeMax: pass.salaryRangeMax ?? undefined,
        salaryCurrency: pass.salaryCurrency ?? "AED",
        priority: pass.priority ?? "medium",
        hiringManagerId: pass.hiringManagerId ?? undefined,
        notes: pass.notes ?? "",
        jobDescriptionDraft: pass.jobDescriptionDraft ?? "",
        positions: existingPositions && existingPositions.length > 0 
          ? existingPositions.map(p => ({
              id: p.id,
              positionTitle: p.positionTitle,
              headcount: p.headcount,
              experienceMin: p.experienceMin ?? undefined,
              experienceMax: p.experienceMax ?? undefined,
              salaryRangeMin: p.salaryRangeMin ?? undefined,
              salaryRangeMax: p.salaryRangeMax ?? undefined,
              salaryCurrency: p.salaryCurrency ?? "AED",
              requirements: p.requirements ?? "",
            }))
          : [{
              positionTitle: "",
              headcount: 1,
              experienceMin: undefined,
              experienceMax: undefined,
              salaryRangeMin: undefined,
              salaryRangeMax: undefined,
              salaryCurrency: "AED",
              requirements: "",
            }],
      });
    }
  }, [pass, existingPositions, form]);

  const togglePosition = (index: number) => {
    setExpandedPositions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const addPosition = () => {
    const newIndex = fields.length;
    append({
      positionTitle: "",
      headcount: 1,
      experienceMin: undefined,
      experienceMax: undefined,
      salaryRangeMin: undefined,
      salaryRangeMax: undefined,
      salaryCurrency: "AED",
      requirements: "",
    });
    setExpandedPositions(prev => new Set(Array.from(prev).concat(newIndex)));
  };

  const removePosition = (index: number) => {
    if (fields.length > 1) {
      remove(index);
      setExpandedPositions(prev => {
        const newSet = new Set<number>();
        prev.forEach(i => {
          if (i < index) newSet.add(i);
          else if (i > index) newSet.add(i - 1);
        });
        return newSet;
      });
    }
  };

  const createPositionMutation = useMutation({
    mutationFn: async ({ passId, position }: { passId: number; position: PositionData }) => {
      const res = await apiRequest("POST", `/api/passes/${passId}/positions`, position);
      return res.json();
    },
  });

  const updatePositionMutation = useMutation({
    mutationFn: async ({ positionId, position }: { positionId: number; position: Partial<PositionData> }) => {
      const res = await apiRequest("PATCH", `/api/pass-positions/${positionId}`, position);
      return res.json();
    },
  });

  const deletePositionMutation = useMutation({
    mutationFn: async (positionId: number) => {
      await apiRequest("DELETE", `/api/pass-positions/${positionId}`);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { positions, ...passData } = data;
      const res = await apiRequest("POST", "/api/passes", passData);
      return res.json();
    },
    onSuccess: async (createdPass, data) => {
      const { positions } = data;
      
      try {
        await Promise.all(
          positions.map(position => 
            createPositionMutation.mutateAsync({ passId: createdPass.id, position })
          )
        );
      } catch (error) {
        console.error("Error creating positions:", error);
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/passes"] });
      toast({ title: "Recruitment pass created successfully" });
      setLocation(`/passes/${createdPass.id}`);
    },
    onError: () => {
      toast({ title: "Failed to create pass", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { positions, ...passData } = data;
      const res = await apiRequest("PATCH", `/api/passes/${passId}`, passData);
      return res.json();
    },
    onSuccess: async (_, data) => {
      const { positions } = data;
      
      try {
        const existingIds = new Set(existingPositions?.map(p => p.id) || []);
        const updatedIds = new Set(positions.filter(p => p.id).map(p => p.id));
        
        const toDelete = Array.from(existingIds).filter(id => !updatedIds.has(id));
        await Promise.all(toDelete.map(id => deletePositionMutation.mutateAsync(id)));
        
        await Promise.all(
          positions.map(position => {
            if (position.id) {
              return updatePositionMutation.mutateAsync({ positionId: position.id, position });
            } else {
              return createPositionMutation.mutateAsync({ passId: parseInt(passId!), position });
            }
          })
        );
      } catch (error) {
        console.error("Error updating positions:", error);
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/passes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/passes", passId] });
      queryClient.invalidateQueries({ queryKey: ["/api/passes", passId, "positions"] });
      toast({ title: "Pass updated successfully" });
      setLocation(`/passes/${passId}`);
    },
    onError: () => {
      toast({ title: "Failed to update pass", variant: "destructive" });
    },
  });

  const generateJD = async () => {
    if (!passId || passId === "new") {
      toast({ title: "Please save the pass first before generating JD", variant: "destructive" });
      return;
    }

    setIsGeneratingJD(true);
    try {
      const res = await apiRequest("POST", "/api/ai/generate-jd", { passId: parseInt(passId) });
      const data = await res.json();
      if (data.jobDescription) {
        form.setValue("jobDescriptionDraft", data.jobDescription);
        toast({ title: "Job description generated successfully" });
      }
    } catch (error) {
      toast({ title: "Failed to generate job description", variant: "destructive" });
    } finally {
      setIsGeneratingJD(false);
    }
  };

  const onSubmit = (data: FormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const totalHeadcount = form.watch("positions")?.reduce((sum, p) => sum + (p.headcount || 0), 0) || 0;

  if (isEditing && (passLoading || positionsLoading)) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[600px] rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/passes">
          <Button variant="ghost" size="icon" className="rounded-xl" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {isEditing ? "Edit Pass" : "New Recruitment Pass"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditing ? `Editing ${pass?.passId}` : "Create a new recruitment requisition"}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold mb-6">Request Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="positionTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Request Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Q1 2025 Sales Hiring" 
                        className="rounded-xl" 
                        data-testid="input-request-name"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl" data-testid="select-department">
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Executive">Executive</SelectItem>
                        <SelectItem value="Sales">Sales</SelectItem>
                        <SelectItem value="Marketing">Marketing</SelectItem>
                        <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                        <SelectItem value="Finance">Finance</SelectItem>
                        <SelectItem value="Human Resources">Human Resources</SelectItem>
                        <SelectItem value="Operations">Operations</SelectItem>
                        <SelectItem value="Engineering">Engineering</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Abu Dhabi, UAE" 
                        className="rounded-xl" 
                        data-testid="input-location"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="employmentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employment Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl" data-testid="select-employment-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Full-time">Full-time</SelectItem>
                        <SelectItem value="Part-time">Part-time</SelectItem>
                        <SelectItem value="Contract">Contract</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? "medium"}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl" data-testid="select-priority">
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hiringManagerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hiring Manager</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))} 
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger className="rounded-xl" data-testid="select-hiring-manager">
                          <SelectValue placeholder="Select manager" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {managers?.filter(m => m.canBeHiringManager).map((manager) => (
                          <SelectItem key={manager.id} value={manager.id.toString()}>
                            {manager.name} - {manager.jobTitle}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Positions</h2>
                <Badge variant="secondary" className="text-xs">
                  {fields.length} {fields.length === 1 ? "position" : "positions"} | {totalHeadcount} total headcount
                </Badge>
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl gap-2 border-[#00C853] text-[#00C853]"
                onClick={addPosition}
                data-testid="button-add-position"
              >
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                Add Position
              </Button>
            </div>

            <div className="space-y-4">
              {fields.map((field, index) => (
                <Collapsible
                  key={field.id}
                  open={expandedPositions.has(index)}
                  onOpenChange={() => togglePosition(index)}
                >
                  <GlassCard variant="subtle" className="overflow-visible">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-4 cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-primary/10">
                            <Briefcase className="w-4 h-4 text-primary" strokeWidth={1.5} />
                          </div>
                          <div>
                            <p className="font-medium">
                              {form.watch(`positions.${index}.positionTitle`) || `Position ${index + 1}`}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Headcount: {form.watch(`positions.${index}.headcount`) || 1}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="rounded-xl text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                removePosition(index);
                              }}
                              data-testid={`button-remove-position-${index}`}
                            >
                              <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                            </Button>
                          )}
                          {expandedPositions.has(index) ? (
                            <ChevronUp className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="px-4 pb-4 pt-2 border-t border-border/50">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                          <FormField
                            control={form.control}
                            name={`positions.${index}.positionTitle`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Position Title</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="e.g., Sales Manager" 
                                    className="rounded-xl" 
                                    data-testid={`input-position-title-${index}`}
                                    {...field} 
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`positions.${index}.headcount`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Headcount</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    min={1}
                                    className="rounded-xl" 
                                    data-testid={`input-position-headcount-${index}`}
                                    {...field}
                                    value={field.value || 1}
                                    onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`positions.${index}.salaryCurrency`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Currency</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || "AED"}>
                                  <FormControl>
                                    <SelectTrigger className="rounded-xl">
                                      <SelectValue placeholder="Currency" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="AED">AED</SelectItem>
                                    <SelectItem value="USD">USD</SelectItem>
                                    <SelectItem value="EUR">EUR</SelectItem>
                                    <SelectItem value="GBP">GBP</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`positions.${index}.experienceMin`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Min Experience (years)</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    min={0}
                                    className="rounded-xl" 
                                    {...field}
                                    value={field.value ?? ""}
                                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`positions.${index}.experienceMax`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Max Experience (years)</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    min={0}
                                    className="rounded-xl" 
                                    {...field}
                                    value={field.value ?? ""}
                                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div></div>

                          <FormField
                            control={form.control}
                            name={`positions.${index}.salaryRangeMin`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Min Salary</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    min={0}
                                    className="rounded-xl" 
                                    {...field}
                                    value={field.value ?? ""}
                                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`positions.${index}.salaryRangeMax`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Max Salary</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    min={0}
                                    className="rounded-xl" 
                                    {...field}
                                    value={field.value ?? ""}
                                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="md:col-span-2 lg:col-span-3">
                            <FormField
                              control={form.control}
                              name={`positions.${index}.requirements`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Requirements</FormLabel>
                                  <FormControl>
                                    <Textarea 
                                      placeholder="Key requirements for this position..."
                                      className="min-h-[80px] rounded-xl"
                                      {...field}
                                      value={field.value ?? ""}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </GlassCard>
                </Collapsible>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Job Description</h2>
              {isEditing && (
                <Button 
                  type="button"
                  variant="outline"
                  className="rounded-xl gap-2"
                  onClick={generateJD}
                  disabled={isGeneratingJD}
                  data-testid="button-generate-jd"
                >
                  {isGeneratingJD ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                  )}
                  Auto-Generate
                </Button>
              )}
            </div>
            
            <FormField
              control={form.control}
              name="jobDescriptionDraft"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea 
                      placeholder="Enter or generate the job description..."
                      className="min-h-[300px] rounded-xl"
                      data-testid="textarea-job-description"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold mb-6">Notes</h2>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea 
                      placeholder="Additional notes about this recruitment request..."
                      className="min-h-[100px] rounded-xl"
                      data-testid="textarea-notes"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </GlassCard>

          <div className="flex justify-end gap-4">
            <Link href="/passes">
              <Button type="button" variant="outline" className="rounded-xl">
                Cancel
              </Button>
            </Link>
            <Button 
              type="submit" 
              className="rounded-xl gap-2"
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-pass"
            >
              {(createMutation.isPending || updateMutation.isPending) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" strokeWidth={1.5} />
              )}
              {isEditing ? "Update Pass" : "Create Pass"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
