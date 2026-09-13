import { Switch, Route, useLocation } from "wouter";
import { lazy, Suspense, useEffect, useState } from "react";
import { apiRequest, queryClient } from "./lib/queryClient";
import { QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { NotificationsDropdown } from "@/components/notifications-dropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

const NotFound = lazy(() => import("@/pages/not-found"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Candidates = lazy(() => import("@/pages/candidates"));
const CandidateForm = lazy(() => import("@/pages/candidate-form"));
const CandidateProfile = lazy(() => import("@/pages/candidate-profile"));
const Passes = lazy(() => import("@/pages/passes"));
const PassForm = lazy(() => import("@/pages/pass-form"));
const PassDetail = lazy(() => import("@/pages/pass-detail"));
const Interviews = lazy(() => import("@/pages/interviews"));
const InterviewForm = lazy(() => import("@/pages/interview-form"));
const Managers = lazy(() => import("@/pages/managers"));
const ManagerForm = lazy(() => import("@/pages/manager-form"));
const Settings = lazy(() => import("@/pages/settings"));
const Analytics = lazy(() => import("@/pages/analytics"));
const HrPassControl = lazy(() => import("@/pages/hr-pass-control"));
const PublicApply = lazy(() => import("@/pages/public-apply"));
const PublicCareers = lazy(() => import("@/pages/public-careers"));
const PublicTalentPool = lazy(() => import("@/pages/public-talent-pool"));
const PublicPrivacy = lazy(() => import("@/pages/public-privacy"));
const PassCandidates = lazy(() => import("@/pages/pass-candidates"));
const ManagerRecruitmentPass = lazy(() => import("@/pages/manager-recruitment-pass"));
const CandidatePortalPass = lazy(() => import("@/pages/candidate-portal-pass"));

function InternalLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const loginMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/login", { username, password }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F6F8] px-4">
      <form
        className="w-full max-w-sm space-y-5 rounded-2xl border border-[#DCE1E7] bg-white p-6 text-[#20242B] shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          loginMutation.mutate();
        }}
      >
        <div>
          <img
            src="/brand/hirepass-endorsed-light.svg"
            alt="HirePass by TAKAVEN"
            className="h-auto w-40"
          />
          <h1 className="mt-3 text-xl font-semibold">Internal sign in</h1>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-[#42494D]">Username</span>
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            data-testid="input-internal-username"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-[#42494D]">Password</span>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            data-testid="input-internal-password"
          />
        </label>
        {loginMutation.isError && <p className="text-sm text-red-700">Sign in failed. Check the configured owner/admin credentials.</p>}
        <Button
          className="w-full"
          type="submit"
          disabled={loginMutation.isPending}
          data-testid="button-internal-login"
        >
          {loginMutation.isPending ? "Signing in..." : "Sign in"}
        </Button>
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
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6F8] text-[#42494D]">
        <div className="flex flex-col items-center gap-3">
          <img src="/brand/hirepass-endorsed-light.svg" alt="HirePass by TAKAVEN" className="h-auto w-40" />
          <p className="text-sm text-[#68707D]">Checking access...</p>
        </div>
      </div>
    );
  }
  if (!data?.user) return <InternalLogin />;
  return <MainLayout />;
}

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F6F8] text-[#42494D]">
      <div className="flex flex-col items-center gap-3">
        <img src="/brand/hirepass-endorsed-light.svg" alt="HirePass by TAKAVEN" className="h-auto w-40" />
        <p className="text-sm text-[#68707D]">Loading HirePass...</p>
      </div>
    </div>
  );
}

function MainRouter() {
  function RedirectTo({ to }: { to: string }) {
    const [, setLocation] = useLocation();
    useEffect(() => {
      setLocation(to, { replace: true });
    }, [setLocation, to]);
    return null;
  }

  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/home">{() => <RedirectTo to="/" />}</Route>
      <Route path="/vacancies/new" component={PassForm} />
      <Route path="/vacancies/:id/edit" component={PassForm} />
      <Route path="/vacancies/:passId/candidates" component={PassCandidates} />
      <Route path="/vacancies/:id" component={PassDetail} />
      <Route path="/vacancies" component={Passes} />
      <Route path="/passes/new">{() => <RedirectTo to="/vacancies/new" />}</Route>
      <Route path="/passes/:id/edit">{(params) => <RedirectTo to={`/vacancies/${params.id}/edit`} />}</Route>
      <Route path="/passes/:passId/candidates">{(params) => <RedirectTo to={`/vacancies/${params.passId}/candidates`} />}</Route>
      <Route path="/passes/:id">{(params) => <RedirectTo to={`/vacancies/${params.id}`} />}</Route>
      <Route path="/passes">{() => <RedirectTo to="/vacancies" />}</Route>
      <Route path="/hiring-control" component={HrPassControl} />
      <Route path="/pass-control">{() => <RedirectTo to="/hiring-control" />}</Route>
      <Route path="/candidates" component={Candidates} />
      <Route path="/candidates/new" component={CandidateForm} />
      <Route path="/candidates/:id/edit" component={CandidateForm} />
      <Route path="/candidates/:id" component={CandidateProfile} />
      <Route path="/interviews" component={Interviews} />
      <Route path="/interviews/new" component={InterviewForm} />
      <Route path="/interviews/:id/edit" component={InterviewForm} />
      <Route path="/hiring-team" component={Managers} />
      <Route path="/hiring-team/new" component={ManagerForm} />
      <Route path="/hiring-team/:id/edit" component={ManagerForm} />
      <Route path="/managers">{() => <RedirectTo to="/hiring-team" />}</Route>
      <Route path="/managers/new">{() => <RedirectTo to="/hiring-team/new" />}</Route>
      <Route path="/managers/:id/edit">{(params) => <RedirectTo to={`/hiring-team/${params.id}/edit`} />}</Route>
      <Route path="/settings" component={Settings} />
      <Route path="/analytics" component={Analytics} />
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
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-sm"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                data-testid="button-internal-logout"
              >
                Sign out
              </Button>
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
  
  const isApplyRoute = location === "/apply" || /^\/apply\/\d+$/.test(location);
  const isCareersRoute = location === "/careers";
  const isPrivacyRoute = location === "/privacy";
  const isTalentPoolRoute = location === "/talent-pool" || location === "/submit-cv";
  const isRetiredPublicPassRoute = location.startsWith("/pass/");
  const isRetiredBearerPathRoute = location.startsWith("/candidate-pass/") || location.startsWith("/manager-pass/");
  const isManagerPassRoute = location === "/manager-pass";
  const isCandidatePortalRoute = location === "/candidate-pass";

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" forcedTheme="light" storageKey="hirepass-theme">
        <TooltipProvider>
          <Suspense fallback={<RouteFallback />}>
          {isCareersRoute ? (
            <PublicCareers />
          ) : isPrivacyRoute ? (
            <PublicPrivacy />
          ) : isTalentPoolRoute ? (
            <PublicTalentPool />
          ) : isApplyRoute ? (
            <PublicApply passIdParam={location.split("/")[2]} />
          ) : isRetiredPublicPassRoute || isRetiredBearerPathRoute ? (
            <NotFound />
          ) : isManagerPassRoute ? (
            <ManagerRecruitmentPass />
          ) : isCandidatePortalRoute ? (
            <CandidatePortalPass />
          ) : (
            <InternalAuthGate />
          )}
          </Suspense>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
