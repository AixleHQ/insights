import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { OrgProvider } from './contexts/OrgContext';
import { NotificationsProvider } from './contexts/NotificationsContext';
import { ImpersonationProvider } from './contexts/ImpersonationContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ImpersonationBar } from './components/ImpersonationBar';
import { AppLayout } from './components/layout';
import { Login } from './pages/Login';
import { AuthCallback } from './pages/AuthCallback';
import { AuthIframeCallback } from './pages/AuthIframeCallback';
import { AuthPopupCallback } from './pages/AuthPopupCallback';
import { Dashboard } from './pages/Dashboard';
import { Events } from './pages/Events';
import { EventDetailPage } from './pages/EventDetailPage';
import { Projects } from './pages/Projects';
import { NewProject } from './pages/NewProject';
import { EditProject } from './pages/EditProject';
import { ProjectDetail } from './pages/ProjectDetail';
import { Integrations } from './pages/Integrations';
import { IntegrationSetup } from './pages/IntegrationSetup';
import { IntegrationOAuthCallback } from './pages/IntegrationOAuthCallback';
import { Team } from './pages/Team';
import { TeamInvite } from './pages/TeamInvite';
import { MemberProfile } from './pages/MemberProfile';
import { Settings } from './pages/Settings';
import { ToolAccounts } from './pages/ToolAccounts';
import { UnattributedEvents } from './pages/UnattributedEvents';
import { Notifications } from './pages/Notifications';
import {
  AdminLayout,
  AdminOverview,
  AdminUsers,
  AdminOrganizations,
} from './pages/admin';

function App() {
  return (
    <BrowserRouter>
      <ImpersonationProvider>
        <AuthProvider>
          <OrgProvider apiBaseUrl={import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1'}>
            <NotificationsProvider>
              <ImpersonationBar />
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/auth/iframe-callback" element={<AuthIframeCallback />} />
                <Route path="/auth/popup-callback" element={<AuthPopupCallback />} />

                {/* OAuth callback for integrations (outside protected routes for popup) */}
                <Route path="/integrations/callback" element={<IntegrationOAuthCallback />} />

                {/* Protected routes with AppLayout */}
                <Route
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/events" element={<Events />} />
                  <Route path="/events/:id" element={<EventDetailPage />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/projects/new" element={<NewProject />} />
                  <Route path="/projects/:id" element={<ProjectDetail />} />
                  <Route path="/projects/:id/edit" element={<EditProject />} />
                  <Route path="/integrations" element={<Integrations />} />
                  <Route path="/integrations/new/:provider" element={<IntegrationSetup />} />
                  <Route path="/team" element={<Team />} />
                  <Route path="/team/invite" element={<TeamInvite />} />
                  <Route path="/team/:id" element={<MemberProfile />} />
                  <Route path="/settings/*" element={<Settings />} />
                  <Route path="/settings/tool-accounts" element={<ToolAccounts />} />
                  <Route path="/events/unattributed" element={<UnattributedEvents />} />
                  <Route path="/notifications" element={<Notifications />} />

                  {/* Admin routes */}
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<AdminOverview />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="organizations" element={<AdminOrganizations />} />
                  </Route>
                </Route>
              </Routes>
            </NotificationsProvider>
          </OrgProvider>
        </AuthProvider>
      </ImpersonationProvider>
    </BrowserRouter>
  );
}

export default App;
