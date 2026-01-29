import { useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationMembers } from '@/hooks/useApi';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * MyProfile page - redirects to the current user's member profile page.
 *
 * This page finds the current user's membership ID in the current organization
 * and redirects to /team/:id to show the full profile view.
 */
export function MyProfile() {
  const { currentOrg } = useOrg();
  const { profile } = useAuth();
  const { data: members, isLoading } = useOrganizationMembers(currentOrg?.id || '');

  // Find the current user's membership in this organization
  const currentUserMembership = useMemo(() => {
    if (!members || !profile?.email) return null;
    return members.find((member) => member.user?.email === profile.email);
  }, [members, profile?.email]);

  // If we found the membership, redirect to the member profile page
  if (currentUserMembership) {
    return <Navigate to={`/team/${currentUserMembership.id}`} replace />;
  }

  // Show loading state while fetching members
  if (isLoading || !currentOrg) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-9 rounded-md" />
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px]" />
          ))}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  // If members loaded but current user not found, show error
  if (members && !currentUserMembership) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">
          Unable to find your membership in this organization.
        </p>
      </div>
    );
  }

  return null;
}
