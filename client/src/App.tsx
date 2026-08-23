import { Switch, Route, useLocation } from "wouter";
import { useState } from "react";
import { apiRequest, queryClient } from "./lib/queryClient";
import { QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationsDropdown } from "@/components/notifications-dropdown";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Candidates from "@/pages/candidates";
import CandidateForm from "@/pages/candidate-form";
import Passes from "@/pages/passes";
import PassForm from "@/pages/pass-form";
import PassDetail from "@/pages/pass-detail";
import Interviews from "@/pages/interviews";
import InterviewForm from "@/pages/interview-form";
import Managers from "@/pages/managers";
import ManagerForm from "@/pages/manager-form";
import Settings from "@/pages/settings";
import Analytics from "@/pages/analytics";
import AiAssistant from "@/pages/ai-assistant";
import HrPassControl from "@/pages/hr-pass-control";
import PublicApply from "@/pages/public-apply";
import PassCandidates from "@/pages/pass-candidates";
import RecruitmentPass from "@/pages/recruitment-pass";
import CandidatePass from "@/pages/candidate-pass";
import OnboardingPass from "@/pages/onboarding-pass";
import ManagerRecruitmentPass from "@/pages/manager-recruitment-pass";
import CandidatePortalPass from "@/pages/candidate-portal-pass";
import OnboardingPortalPass from "@/pages/onboarding-portal-pass";

function InternalLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const loginMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/login", { username, password }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <form
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-100"
        onSubmit={(event) => {
          event.preventDefault();
          loginMutation.mutate();
        }}
      >
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">HirePass</p>
          <h1 className="mt-1 text-xl font-semibold text-white">Internal sign in</h1>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-300">Username</span>
          <input
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-blue-400"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            data-testid="input-internal-username"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-300">Password</span>
          <input
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-blue-400"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            data-testid="input-internal-password"
          />
        </label>
        {loginMutation.isError && <p className="text-sm text-red-300">Sign in failed. Check the configured owner/admin credentials.</p>}
        <button
          className="h-10 w-full rounded-md bg-blue-500 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60"
          type="submit"
          disabled={loginMutation.isPending}
          data-testid="button-internal-login"
        >
          {loginMutation.isPending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function InternalAuthGate() {
  const { data, isLoading } = useQuery<{ user?: { username: string; role: string } } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error("Could not verify internal access");
      return response.json();
    },
    retry: false,
  });

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">Checking access...</div>;
  }
  if (!data?.user) return <InternalLogin />;
  return <MainLayout />;
}

function MainRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/passes" component={Passes} />
      <Route path="/pass-control" component={HrPassControl} />
      <Route path="/passes/new" component={PassForm} />
      <Route path="/passes/:id" component={PassDetail} />
      <Route path="/passes/:id/edit" component={PassForm} />
      <Route path="/passes/:id/pass" component={RecruitmentPass} />
      <Route path="/passes/:passId/candidates" component={PassCandidates} />
      <Route path="/candidates" component={Candidates} />
      <Route path="/candidates/new" component={CandidateForm} />
      <Route path="/candidates/:id" component={CandidateForm} />
      <Route path="/candidates/:id/edit" component={CandidateForm} />
      <Route path="/candidates/:id/pass" component={CandidatePass} />
      <Route path="/candidates/:id/onboarding-pass" component={OnboardingPass} />
      <Route path="/interviews" component={Interviews} />
      <Route path="/interviews/new" component={InterviewForm} />
      <Route path="/managers" component={Managers} />
      <Route path="/managers/new" component={ManagerForm} />
      <Route path="/managers/:id/edit" component={ManagerForm} />
      <Route path="/settings" component={Settings} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/ai-assistant" component={AiAssistant} />
      <Route component={NotFound} />
    </Switch>
  );
}

function MainLayout() {
  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  });
  const sidebarStyle = {
    "--sidebar-width": "12rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full ios-gradient-bg">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="glass-nav flex h-10 items-center justify-between gap-3 px-3 sticky top-0 z-50">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="rounded-lg h-7 w-7" data-testid="button-sidebar-toggle" />
            </div>
            <div className="flex items-center gap-2">
              <NotificationsDropdown />
              <ThemeToggle />
              <button
                className="h-7 rounded-md border border-slate-300 px-2 text-xs text-slate-700 hover:bg-slate-100"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                data-testid="button-internal-logout"
              >
                Sign out
              </button>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto">
            <div className="p-4">
              <MainRouter />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  const [location] = useLocation();
  
  const isApplyRoute = location === "/apply";
  // Clean pass URLs: /pass/BAYN-RP-2025-001 (recruitment passes only for now)
  const isRecruitmentPassRoute = location.startsWith("/pass/BAYN-RP-");
  // Token-based manager pass: /manager-pass/mgr_xxxxx
  const isManagerPassRoute = location.startsWith("/manager-pass/");
  // Token-based candidate portal: /candidate-pass/cand_xxxxx
  const isCandidatePortalRoute = location.startsWith("/candidate-pass/");
  // Token-based onboarding portal: /onboarding-portal/onb_xxxxx
  const isOnboardingPortalRoute = location.startsWith("/onboarding-portal/");

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="hirepass-theme">
        <TooltipProvider>
          {isApplyRoute ? (
            <PublicApply />
          ) : isRecruitmentPassRoute ? (
            <Switch>
              <Route path="/pass/:passId">{(params) => {
                const passId = params.passId || "";
                if (passId.startsWith("BAYN-RP-")) {
                  return <RecruitmentPass passIdParam={passId} />;
                }
                return <NotFound />;
              }}</Route>
            </Switch>
          ) : isManagerPassRoute ? (
            <Switch>
              <Route path="/manager-pass/:token">{(params) => {
                const token = params.token || "";
                return <ManagerRecruitmentPass token={token} />;
              }}</Route>
            </Switch>
          ) : isCandidatePortalRoute ? (
            <Switch>
              <Route path="/candidate-pass/:token">{(params) => {
                const token = params.token || "";
                return <CandidatePortalPass token={token} />;
              }}</Route>
            </Switch>
          ) : isOnboardingPortalRoute ? (
            <Switch>
              <Route path="/onboarding-portal/:token">{(params) => {
                const token = params.token || "";
                return <OnboardingPortalPass token={token} />;
              }}</Route>
            </Switch>
          ) : (
            <InternalAuthGate />
          )}
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
