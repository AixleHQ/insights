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
import { LoginEmail } from "./pages/LoginEmail";
import { SignUp } from "./pages/SignUp";
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
import NoActiveOrganization from "./pages/NoActiveOrganization";
import { InvitationAccept } from "./pages/InvitationAccept";
import { InvitationsManagement } from "./pages/InvitationsManagement";
import {
  AdminLayout,
  AdminOverview,
  AdminUsers,
  AdminOrganizations,
  WebhookDeliveriesPage,
} from "./pages/admin";
import { NotFound } from "./pages/NotFound";
import { Exports } from "./pages/Exports";
import { AppRoutes } from "./lib/routes";
import { SHOW_INTEGRATION_CATALOG } from "./lib/featureFlags";

function TeamIdRedirect() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");
  const to = projectId ? `${AppRoutes.members.detail(id!)}?projectId=${projectId}` : AppRoutes.members.detail(id!);
  return <Navigate to={to} replace />;
}

function SettingsMembersIdRedirect() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");
  const to = projectId ? `${AppRoutes.members.detail(id!)}?projectId=${projectId}` : AppRoutes.members.detail(id!);
  return <Navigate to={to} replace />;
}

function EditProjectRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={AppRoutes.projects.settings(id!)} replace />;
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
                <Route path={AppRoutes.login} element={<Login />} />
                <Route path={AppRoutes.loginEmail} element={<LoginEmail />} />
                <Route path={AppRoutes.signup} element={<SignUp />} />
                <Route path={AppRoutes.authCallback} element={<AuthCallback />} />
                <Route path={AppRoutes.authSilentCallback} element={<AuthSilentCallback />} />
                <Route path={AppRoutes.authIframeCallback} element={<AuthIframeCallback />} />
                <Route path={AppRoutes.authPopupCallback} element={<AuthPopupCallback />} />

                {/* OAuth callback for integrations (outside protected routes for popup) */}
                <Route path={AppRoutes.integrations.callback} element={<IntegrationOAuthCallback />} />

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
                  path={AppRoutes.onboarding}
                  element={
                    <ProtectedRoute allowNoOrg>
                      <Onboarding />
                    </ProtectedRoute>
                  }
                />

                {/* No active organization page - for users with only inactive orgs */}
                <Route
                  path={AppRoutes.noActiveOrganization}
                  element={
                    <ProtectedRoute allowNoOrg>
                      <NoActiveOrganization />
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
                  <Route path={AppRoutes.dashboard} element={<Dashboard />} />
                  <Route path={`${AppRoutes.profile.root}/*`} element={<UserSettings />} />
                  <Route path={AppRoutes.events.root} element={<Events />} />
                  <Route path="/events/:id" element={<EventDetailPage />} />
                  <Route path={AppRoutes.projects.root} element={<Projects />} />
                  <Route
                    path={AppRoutes.projects.new}
                    element={
                      <ProtectedRoute requireRoles={["owner"]}>
                        <NewProject />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/projects/:id" element={<ProjectDetail />} />
                  <Route path="/projects/:id/settings/*" element={<ProjectSettings />} />
                  <Route path="/projects/:id/edit" element={<EditProjectRedirect />} />
                  <Route path={AppRoutes.integrations.root} element={<Navigate to={AppRoutes.integrations.connected} replace />} />
                  <Route path="/integrations/new/:provider" element={<IntegrationSetup />} />
                  <Route
                    path={AppRoutes.integrations.manage}
                    element={
                      SHOW_INTEGRATION_CATALOG ? (
                        <ProtectedRoute requireRoles={["owner"]}>
                          <IntegrationsManage />
                        </ProtectedRoute>
                      ) : (
                        <Navigate to={AppRoutes.integrations.connected} replace />
                      )
                    }
                  />
                  <Route path="/integrations/:status" element={<Integrations />} />
                  {/* /members — top-level members routes */}
                  <Route path={AppRoutes.members.root} element={<Members />} />
                  <Route path={AppRoutes.members.invite} element={<TeamInvite />} />
                  <Route path={AppRoutes.members.invitations} element={<InvitationsManagement />} />
                  <Route path="/members/:id" element={<MemberProfile />} />
                  {/* /team/* redirects to /members/* for backwards compatibility */}
                  <Route path="/team" element={<Navigate to={AppRoutes.members.root} replace />} />
                  <Route path="/team/invite" element={<Navigate to={AppRoutes.members.invite} replace />} />
                  <Route path="/team/invitations" element={<Navigate to={AppRoutes.members.invitations} replace />} />
                  <Route path="/team/:id" element={<TeamIdRedirect />} />
                  {/* /settings/members/* redirects to /members/* for backwards compatibility */}
                  <Route path="/settings/members" element={<Navigate to={AppRoutes.members.root} replace />} />
                  <Route path="/settings/members/invite" element={<Navigate to={AppRoutes.members.invite} replace />} />
                  <Route path="/settings/members/invitations" element={<Navigate to={AppRoutes.members.invitations} replace />} />
                  <Route path="/settings/members/:id" element={<SettingsMembersIdRedirect />} />
                  <Route
                    path={AppRoutes.alerts}
                    element={
                      <ProtectedRoute requireRoles={["owner"]}>
                        <OrgAlerts />
                      </ProtectedRoute>
                    }
                  />
                  <Route path={`${AppRoutes.settings.root}/*`} element={<Settings />} />
                  <Route path="/settings/tool-accounts" element={<Navigate to={AppRoutes.profile.tools} replace />} />
                  <Route path={AppRoutes.events.unattributed} element={<UnattributedEvents />} />
                  <Route path={AppRoutes.notifications} element={<Notifications />} />
                  <Route path={AppRoutes.exports} element={<Exports />} />
                  {/* Admin routes */}
                  <Route path={AppRoutes.admin.root} element={<AdminLayout />}>
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
