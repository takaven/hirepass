import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
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
import PublicApply from "@/pages/public-apply";
import PassCandidates from "@/pages/pass-candidates";
import RecruitmentPass from "@/pages/recruitment-pass";
import CandidatePass from "@/pages/candidate-pass";
import OnboardingPass from "@/pages/onboarding-pass";
import ManagerRecruitmentPass from "@/pages/manager-recruitment-pass";
import CandidatePortalPass from "@/pages/candidate-portal-pass";
import OnboardingPortalPass from "@/pages/onboarding-portal-pass";

function MainRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/passes" component={Passes} />
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
            <MainLayout />
          )}
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

