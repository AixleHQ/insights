import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { OrgProvider } from "./contexts/OrgContext";
import { NotificationsProvider } from "./contexts/NotificationsContext";
import { ImpersonationProvider } from "./contexts/ImpersonationContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ImpersonationBar } from "./components/ImpersonationBar";
import { AppLayout } from "./components/layout";
import { Login } from "./pages/Login";
import { AuthCallback } from "./pages/AuthCallback";
import { AuthIframeCallback } from "./pages/AuthIframeCallback";
import { AuthPopupCallback } from "./pages/AuthPopupCallback";
import { AuthSilentCallback } from "./pages/AuthSilentCallback";
import { Dashboard } from "./pages/Dashboard";
import { Events } from "./pages/Events";
import { EventDetailPage } from "./pages/EventDetailPage";
import { Projects } from "./pages/Projects";
import { NewProject } from "./pages/NewProject";
import { ProjectDetail } from "./pages/ProjectDetail";
import { ProjectSettings } from "./pages/ProjectSettings";
import { Integrations } from "./pages/Integrations";
import { IntegrationsManage } from "./pages/IntegrationsManage";
import { IntegrationSetup } from "./pages/IntegrationSetup";
import { IntegrationOAuthCallback } from "./pages/IntegrationOAuthCallback";
import { Members } from "./pages/Members";
import { TeamInvite } from "./pages/TeamInvite";
import { MemberProfile } from "./pages/MemberProfile";
import { UserSettings } from "./pages/UserSettings";
import { Settings } from "./pages/Settings";
import { OrgAlerts } from "./pages/OrgAlerts";
import { UnattributedEvents } from "./pages/UnattributedEvents";
import { Notifications } from "./pages/Notifications";
import { Onboarding } from "./pages/Onboarding";
import { InvitationAccept } from "./pages/InvitationAccept";
import { InvitationsManagement } from "./pages/InvitationsManagement";
import {
  AdminLayout,
  AdminOverview,
  AdminUsers,
  AdminOrganizations,
  WebhookDeliveriesPage,
} from "./pages/admin";
import { ComingSoon } from "./components/ui/ComingSoon";
import { NotFound } from "./pages/NotFound";
import { TermsOfService } from "./pages/TermsOfService";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";

function TeamIdRedirect() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");
  const to = projectId ? `/members/${id}?projectId=${projectId}` : `/members/${id}`;
  return <Navigate to={to} replace />;
}

function SettingsMembersIdRedirect() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");
  const to = projectId ? `/members/${id}?projectId=${projectId}` : `/members/${id}`;
  return <Navigate to={to} replace />;
}

function EditProjectRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/projects/${id}/settings`} replace />;
}

function App() {
  return (
    <>
    <BrowserRouter>
      <ImpersonationProvider>
        <AuthProvider>
          <ThemeProvider>
          <OrgProvider apiBaseUrl={import.meta.env.VITE_API_URL || "/api/v1"}>
            <NotificationsProvider>
              <ImpersonationBar />
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/auth/silent-callback" element={<AuthSilentCallback />} />
                <Route path="/auth/iframe-callback" element={<AuthIframeCallback />} />
                <Route path="/auth/popup-callback" element={<AuthPopupCallback />} />

                {/* Legal pages - public, no auth required */}
                <Route path="/legal/terms" element={<TermsOfService />} />
                <Route path="/legal/privacy" element={<PrivacyPolicy />} />

                {/* OAuth callback for integrations (outside protected routes for popup) */}
                <Route path="/integrations/callback" element={<IntegrationOAuthCallback />} />

                {/* Invitation accept page - requires auth but not org */}
                <Route
                  path="/invitations/:token"
                  element={
                    <ProtectedRoute allowNoOrg>
                      <InvitationAccept />
                    </ProtectedRoute>
                  }
                />

                {/* Onboarding page - for users without organizations */}
                <Route
                  path="/onboarding"
                  element={
                    <ProtectedRoute allowNoOrg>
                      <Onboarding />
                    </ProtectedRoute>
                  }
                />

                {/* Protected routes with AppLayout */}
                <Route
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/profile/*" element={<UserSettings />} />
                  <Route path="/events" element={<Events />} />
                  <Route path="/events/:id" element={<EventDetailPage />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route
                    path="/projects/new"
                    element={
                      <ProtectedRoute requireRoles={["owner"]}>
                        <NewProject />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/projects/:id" element={<ProjectDetail />} />
                  <Route path="/projects/:id/settings/*" element={<ProjectSettings />} />
                  <Route path="/projects/:id/edit" element={<EditProjectRedirect />} />
                  <Route path="/integrations" element={<Navigate to="/integrations/connected" replace />} />
                  <Route path="/integrations/new/:provider" element={<IntegrationSetup />} />
                  <Route
                    path="/integrations/manage"
                    element={
                      <ProtectedRoute requireRoles={["owner"]}>
                        <IntegrationsManage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/integrations/:status" element={<Integrations />} />
                  {/* /members — top-level members routes */}
                  <Route path="/members" element={<Members />} />
                  <Route path="/members/invite" element={<TeamInvite />} />
                  <Route path="/members/invitations" element={<InvitationsManagement />} />
                  <Route path="/members/:id" element={<MemberProfile />} />
                  {/* /team/* redirects to /members/* for backwards compatibility */}
                  <Route path="/team" element={<Navigate to="/members" replace />} />
                  <Route path="/team/invite" element={<Navigate to="/members/invite" replace />} />
                  <Route path="/team/invitations" element={<Navigate to="/members/invitations" replace />} />
                  <Route path="/team/:id" element={<TeamIdRedirect />} />
                  {/* /settings/members/* redirects to /members/* for backwards compatibility */}
                  <Route path="/settings/members" element={<Navigate to="/members" replace />} />
                  <Route path="/settings/members/invite" element={<Navigate to="/members/invite" replace />} />
                  <Route path="/settings/members/invitations" element={<Navigate to="/members/invitations" replace />} />
                  <Route path="/settings/members/:id" element={<SettingsMembersIdRedirect />} />
                  <Route
                    path="/alerts"
                    element={
                      <ProtectedRoute requireRoles={["owner"]}>
                        <OrgAlerts />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/settings/*" element={<Settings />} />
                  <Route path="/settings/tool-accounts" element={<Navigate to="/profile/tools" replace />} />
                  <Route path="/events/unattributed" element={<UnattributedEvents />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/library" element={<ComingSoon title="Library" />} />
                  <Route path="/feedback" element={<ComingSoon title="Feedback" />} />

                  {/* Admin routes */}
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<AdminOverview />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="organizations" element={<AdminOrganizations />} />
                    <Route
                      path="organizations/:organizationId/webhook-deliveries"
                      element={<WebhookDeliveriesPage />}
                    />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </NotificationsProvider>
          </OrgProvider>
          </ThemeProvider>
        </AuthProvider>
      </ImpersonationProvider>
    </BrowserRouter>
    <Toaster position="bottom-right" richColors />
    </>
  );
}

export default App;
