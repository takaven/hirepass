import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { z } from "zod";
import {
  ArrowLeft,
  Loader2,
  User,
  Mail,
  Phone,
  Building2,
  Briefcase,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { Manager } from "@shared/schema";

const managerFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  department: z.string().min(1, "Department is required"),
  title: z.string().min(1, "Title is required"),
  phone: z.string().optional(),
  isActive: z.boolean().default(true),
});

type ManagerFormValues = z.infer<typeof managerFormSchema>;

export default function ManagerForm() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isEditing = Boolean(id) && id !== "new";

  const { data: manager, isLoading: managerLoading } = useQuery<Manager>({
    queryKey: ["/api/managers", id],
    enabled: isEditing,
  });

  const form = useForm<ManagerFormValues>({
    resolver: zodResolver(managerFormSchema),
    defaultValues: {
      name: "",
      email: "",
      department: "",
      title: "",
      phone: "",
      isActive: true,
    },
    values: manager ? {
      name: manager.name,
      email: manager.email,
      department: manager.department,
      title: manager.title,
      phone: manager.phone || "",
      isActive: manager.isActive ?? true,
    } : undefined,
  });

  const mutation = useMutation({
    mutationFn: async (data: ManagerFormValues) => {
      const payload = {
        ...data,
        phone: data.phone || null,
      };

      if (isEditing) {
        await apiRequest("PATCH", `/api/managers/${id}`, payload);
      } else {
        await apiRequest("POST", "/api/managers", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/managers"] });
      toast({
        title: isEditing ? "Manager updated" : "Manager added",
        description: isEditing 
          ? "The manager profile has been updated."
          : "The manager has been added to the directory.",
      });
      setLocation("/managers");
    },
    onError: () => {
      toast({
        title: "Error",
        description: `Failed to ${isEditing ? "update" : "add"} manager. Please try again.`,
        variant: "destructive",
      });
    },
  });

  if (managerLoading && isEditing) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/managers">
          <Button variant="ghost" size="icon" className="rounded-xl" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {isEditing ? "Edit Manager" : "Add Manager"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditing ? "Update manager information" : "Add a hiring manager or interviewer"}
          </p>
        </div>
      </div>

      <GlassCard>
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
                    <Input {...field} placeholder="John Smith" className="rounded-xl" data-testid="input-name" />
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
                    <Mail className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    Email
                  </FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="manager@hirepass.example" className="rounded-xl" data-testid="input-email" />
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
                    Phone (optional)
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="+971 50 123 4567" className="rounded-xl" data-testid="input-phone" />
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
                  <FormLabel className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    Department
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl" data-testid="select-department">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Engineering">Engineering</SelectItem>
                      <SelectItem value="Operations">Operations</SelectItem>
                      <SelectItem value="Finance">Finance</SelectItem>
                      <SelectItem value="HR">Human Resources</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="Sales">Sales</SelectItem>
                      <SelectItem value="Research">Research & Development</SelectItem>
                      <SelectItem value="Administration">Administration</SelectItem>
                      <SelectItem value="Executive">Executive</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    Job Title
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Engineering Manager" className="rounded-xl" data-testid="input-title" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl bg-muted/30 p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Active Status</FormLabel>
                    <FormDescription>
                      Active managers can be assigned to interviews and job requisitions
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-active"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Link href="/managers">
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
                {isEditing ? "Update Manager" : "Add Manager"}
              </Button>
            </div>
          </form>
        </Form>
      </GlassCard>
    </div>
  );
}

