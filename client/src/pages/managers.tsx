import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Search,
  Plus,
  MoreVertical,
  Mail,
  Phone,
  Building2,
  Trash2,
  Edit,
  UserCircle,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Manager } from "@shared/schema";

export default function Managers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [managerToDelete, setManagerToDelete] = useState<Manager | null>(null);
  const { toast } = useToast();

  const { data: managers, isLoading } = useQuery<Manager[]>({
    queryKey: ["/api/managers"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/managers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/managers"] });
      toast({
        title: "Manager removed",
        description: "The manager has been removed from the directory.",
      });
      setDeleteDialogOpen(false);
      setManagerToDelete(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove manager. Please try again.",
        variant: "destructive",
      });
    },
  });

  const filteredManagers = managers?.filter((manager) => {
    const matchesSearch = 
      manager.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      manager.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (manager.department || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const handleDelete = (manager: Manager) => {
    setManagerToDelete(manager);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Managers</h1>
          <p className="text-muted-foreground mt-1">
            Hiring managers and interviewers directory
          </p>
        </div>
        <Link href="/managers/new">
          <Button className="rounded-xl gap-2" data-testid="button-add-manager">
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            Add Manager
          </Button>
        </Link>
      </div>

      <GlassCard className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
          <Input
            placeholder="Search managers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 rounded-xl glass-input border-0"
            data-testid="input-search-managers"
          />
        </div>
      </GlassCard>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : filteredManagers?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredManagers.map((manager) => (
            <GlassCard 
              key={manager.id} 
              variant="elevated"
              className="p-5"
              data-testid={`card-manager-${manager.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 border-2 border-primary/30">
                    <AvatarFallback className="bg-white text-primary font-semibold border border-primary/20">
                      {manager.name.split(" ").map(n => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold">{manager.name}</h3>
                    <p className="text-sm text-muted-foreground">{manager.jobTitle}</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-xl" data-testid={`button-menu-${manager.id}`}>
                      <MoreVertical className="w-4 h-4" strokeWidth={1.5} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl">
                    <DropdownMenuItem asChild>
                      <Link href={`/managers/${manager.id}/edit`}>
                        <Edit className="w-4 h-4 mr-2" strokeWidth={1.5} />
                        Edit
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-destructive"
                      onClick={() => handleDelete(manager)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="w-4 h-4" strokeWidth={1.5} />
                  <span>{manager.department}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="w-4 h-4" strokeWidth={1.5} />
                  <span className="truncate">{manager.email}</span>
                </div>
                {manager.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="w-4 h-4" strokeWidth={1.5} />
                    <span>{manager.phone}</span>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <Badge 
                  variant="outline" 
                  className={`rounded-full ${manager.isActive ? "border-primary text-primary" : "border-muted-foreground text-muted-foreground"}`}
                >
                  {manager.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </GlassCard>
          ))}
        </div>
      ) : (
        <GlassCard className="py-16">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="p-4 rounded-3xl bg-primary/10 mb-4">
              <UserCircle className="w-12 h-12 text-primary" strokeWidth={1} />
            </div>
            <h3 className="text-lg font-semibold">No managers found</h3>
            <p className="text-muted-foreground mt-1 max-w-sm">
              {searchQuery 
                ? "Try adjusting your search"
                : "Add hiring managers to assign interviews"
              }
            </p>
            {!searchQuery && (
              <Link href="/managers/new">
                <Button className="mt-6 rounded-xl gap-2" data-testid="button-add-first-manager">
                  <Plus className="w-4 h-4" strokeWidth={1.5} />
                  Add First Manager
                </Button>
              </Link>
            )}
          </div>
        </GlassCard>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="glass-card border-0 rounded-3xl">
          <DialogHeader>
            <DialogTitle>Remove Manager</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {managerToDelete?.name} from the directory?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setDeleteDialogOpen(false)}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => managerToDelete && deleteMutation.mutate(managerToDelete.id)}
              disabled={deleteMutation.isPending}
              className="rounded-xl"
            >
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
