import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Users,
  FileText,
  Calendar,
  Settings,
  Building2,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const navItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Passes",
    url: "/passes",
    icon: FileText,
  },
  {
    title: "Pass Control",
    url: "/pass-control",
    icon: ShieldCheck,
  },
  {
    title: "Candidates",
    url: "/candidates",
    icon: Users,
  },
  {
    title: "Interviews",
    url: "/interviews",
    icon: Calendar,
  },
  {
    title: "Managers",
    url: "/managers",
    icon: Building2,
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: BarChart3,
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border-r border-black/5 dark:border-white/10">
      <SidebarHeader className="p-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-sm">
            <FileText className="w-4 h-4 text-white" strokeWidth={2} />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-[11px] tracking-tight leading-none">HirePass</span>
            <span className="text-[10px] text-muted-foreground leading-tight">Recruitment Pass</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {navItems.map((item) => {
                const isActive = location === item.url || 
                  (item.url !== "/" && location.startsWith(item.url));
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        "rounded-xl h-9 px-2.5 transition-all duration-150",
                        isActive 
                          ? "bg-primary/10 shadow-sm" 
                          : "hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                      )}
                    >
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase()}`}>
                        <item.icon 
                          className={cn(
                            "w-[18px] h-[18px]",
                            isActive ? "text-primary" : "text-primary/70"
                          )}
                          strokeWidth={2} 
                        />
                        <span className={cn(
                          "text-[12px]",
                          isActive ? "text-foreground font-medium" : "text-muted-foreground"
                        )}>
                          {item.title}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className={cn(
                "rounded-xl h-9 px-2.5 transition-all duration-150",
                location === "/settings" 
                  ? "bg-primary/10 shadow-sm" 
                  : "hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
              )}
            >
              <Link href="/settings" data-testid="nav-settings">
                <Settings 
                  className={cn(
                    "w-[18px] h-[18px]",
                    location === "/settings" ? "text-primary" : "text-primary/70"
                  )}
                  strokeWidth={2} 
                />
                <span className={cn(
                  "text-[12px]",
                  location === "/settings" ? "text-foreground font-medium" : "text-muted-foreground"
                )}>
                  Settings
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="mt-2 mx-1 px-2.5 py-1.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.05]">
          <p className="text-[10px] text-muted-foreground text-center">
            Controlled hiring passes
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
