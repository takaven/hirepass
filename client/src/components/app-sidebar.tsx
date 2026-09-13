import { useLocation, Link } from "wouter";
import { LayoutDashboard, Users, FileText, Calendar, Settings, Building2, BarChart3, ShieldCheck } from "lucide-react";
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
    title: "Home",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Vacancies",
    url: "/vacancies",
    icon: FileText,
  },
  {
    title: "Candidates",
    url: "/candidates",
    icon: Users,
  },
  {
    title: "Hiring Team",
    url: "/hiring-team",
    icon: Building2,
  },
];

const secondaryNavItems = [
  {
    title: "Interviews",
    url: "/interviews",
    icon: Calendar,
  },
  {
    title: "Hiring Control",
    url: "/hiring-control",
    icon: ShieldCheck,
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
    <Sidebar className="border-r border-[#DCE1E7] bg-white">
      <SidebarHeader className="p-3">
        <Link href="/" className="flex items-center gap-2">
          <img
            src="/brand/hirepass-endorsed-light.svg"
            alt="HirePass by TAKAVEN"
            className="h-auto w-32"
          />
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
                        "h-10 rounded-xl px-2.5 transition-all duration-150",
                        isActive 
                          ? "bg-[#F4F6F8] shadow-sm before:h-4 before:w-1 before:rounded-full before:bg-[#01FF22] before:content-['']"
                          : "hover:bg-[#F4F6F8]"
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
                          "text-[13px]",
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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {secondaryNavItems.map((item) => {
                const isActive = location === item.url || 
                  (item.url !== "/" && location.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className={cn("h-10 rounded-xl px-2.5 transition-all duration-150", isActive ? "bg-[#F4F6F8] shadow-sm before:h-4 before:w-1 before:rounded-full before:bg-[#01FF22] before:content-['']" : "hover:bg-[#F4F6F8]")}>
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        <item.icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-primary/60")} strokeWidth={2} />
                        <span className={cn("text-[13px]", isActive ? "text-foreground font-medium" : "text-muted-foreground")}>{item.title}</span>
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
                "h-10 rounded-xl px-2.5 transition-all duration-150",
                location === "/settings" 
                  ? "bg-[#F4F6F8] shadow-sm before:h-4 before:w-1 before:rounded-full before:bg-[#01FF22] before:content-['']"
                  : "hover:bg-[#F4F6F8]"
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
                  "text-[13px]",
                  location === "/settings" ? "text-foreground font-medium" : "text-muted-foreground"
                )}>
                  Settings
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="mx-1 mt-2 rounded-xl bg-[#F4F6F8] px-2.5 py-2">
          <p className="text-center text-xs text-muted-foreground">
            Hiring without the chasing.
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
