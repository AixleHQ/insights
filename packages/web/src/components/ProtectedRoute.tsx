import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useOrg } from "../contexts/OrgContext";
import { AppRoutes } from "@/lib/routes";

interface ProtectedRouteProps {
  children: ReactNode;
  requireOrg?: boolean;
  requireRoles?: string[];
  fallback?: ReactNode;
  /** If true, skip the org check and onboarding redirect */
  allowNoOrg?: boolean;
}

export function ProtectedRoute({
  children,
  requireOrg = false,
  requireRoles,
  fallback,
  allowNoOrg = false,
}: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currentOrg, organizations, hasInactiveOrganizations, hasRole, isLoading: orgLoading, isInitialized: orgInitialized } = useOrg();

  // Show loading state - wait for auth AND org context to be initialized
  if (authLoading || (isAuthenticated && (!orgInitialized || orgLoading))) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to={AppRoutes.login} state={{ from: location }} replace />;
  }

  // Redirect inactive-org users to the dedicated page regardless of allowNoOrg.
  // This must run before the onboarding redirect so that /onboarding with inactive
  // orgs is caught here rather than allowed through.
  if (orgInitialized && organizations.length === 0 && hasInactiveOrganizations &&
      location.pathname !== AppRoutes.noActiveOrganization) {
    return <Navigate to={AppRoutes.noActiveOrganization} replace />;
  }

  // Redirect truly new users (no memberships at all) when org is required.
  if (!allowNoOrg && orgInitialized && organizations.length === 0 &&
      location.pathname !== AppRoutes.onboarding) {
    return <Navigate to={AppRoutes.onboarding} state={{ from: location }} replace />;
  }

  // Check if organization is required
  if (requireOrg && !currentOrg) {
    return <Navigate to={AppRoutes.onboarding} state={{ from: location }} replace />;
  }

  // Check role requirements
  if (requireRoles && requireRoles.length > 0) {
    if (!hasRole(requireRoles)) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <h1 className="type-h2 text-foreground mb-2">Access Denied</h1>
          <p className="text-muted-foreground">
            You don't have permission to access this page.
          </p>
        </div>
      );
    }
  }

  return <>{children}</>;
}

// Convenience wrapper for routes that require organization context
export function OrgRoute({ children, ...props }: Omit<ProtectedRouteProps, "requireOrg">) {
  return (
    <ProtectedRoute requireOrg {...props}>
      {children}
    </ProtectedRoute>
  );
}

