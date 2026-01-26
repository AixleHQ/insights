import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';

interface ProtectedRouteProps {
  children: ReactNode;
  requireOrg?: boolean;
  requireRoles?: string[];
  fallback?: ReactNode;
}

export function ProtectedRoute({
  children,
  requireOrg = false,
  requireRoles,
  fallback,
}: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currentOrg, hasRole, isLoading: orgLoading } = useOrg();

  // Show loading state
  if (authLoading || (isAuthenticated && orgLoading)) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check if organization is required
  if (requireOrg && !currentOrg) {
    return <Navigate to="/select-org" state={{ from: location }} replace />;
  }

  // Check role requirements
  if (requireRoles && requireRoles.length > 0) {
    if (!hasRole(requireRoles)) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">
            You don't have permission to access this page.
          </p>
        </div>
      );
    }
  }

  return <>{children}</>;
}

// Convenience wrapper for routes that require organization context
export function OrgRoute({ children, ...props }: Omit<ProtectedRouteProps, 'requireOrg'>) {
  return (
    <ProtectedRoute requireOrg {...props}>
      {children}
    </ProtectedRoute>
  );
}

// Convenience wrapper for admin-only routes
export function AdminRoute({ children, ...props }: Omit<ProtectedRouteProps, 'requireRoles'>) {
  return (
    <ProtectedRoute requireOrg requireRoles={['owner', 'admin']} {...props}>
      {children}
    </ProtectedRoute>
  );
}
