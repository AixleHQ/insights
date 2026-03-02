import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Search, Users, LogOut, AlertTriangle, Mail, Clock, X } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationMembers, useUpdateMemberRole, useRemoveMember, useLeaveOrganization, useInvitations, useRevokeInvitation } from '@/hooks/useApi';
import type { Invitation } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SortButton, type SortDirection } from '@/components/ui/sort-button';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { MemberRow, type MemberData, type MemberRole } from '@/components/team';

function MemberSkeleton() {
  return (
    <TableRow>
      <td className="p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24 sm:w-32" />
            <Skeleton className="h-3 w-32 sm:w-48" />
          </div>
        </div>
      </td>
      <td className="p-4">
        <Skeleton className="h-8 w-20 sm:w-24" />
      </td>
      <td className="hidden sm:table-cell p-4">
        <Skeleton className="h-5 w-16" />
      </td>
      <td className="hidden md:table-cell p-4">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="hidden lg:table-cell p-4">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="hidden sm:table-cell p-4">
        <Skeleton className="h-4 w-16" />
      </td>
      <td className="p-4" />
    </TableRow>
  );
}

type MemberSortField = 'name' | 'role' | 'status' | 'joined_at' | 'total_tokens';

const roleOrder: Record<MemberRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

export function Team() {
  const navigate = useNavigate();
  const { currentOrg, currentMembership, organizations, setCurrentOrg, refreshOrganizations } = useOrg();
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<MemberSortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const { data: membersData, isLoading } = useOrganizationMembers(currentOrg?.id || '');
  const { data: invitationsData } = useInvitations(currentOrg?.id || '', 'pending');
  const updateMemberRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const leaveOrganization = useLeaveOrganization();
  const revokeInvitation = useRevokeInvitation();

  // Transform API response to component format
  const members: MemberData[] = useMemo(() => {
    return membersData?.map((m) => ({
      id: m.id,
      email: m.user.email,
      name: m.user.name || undefined,
      role: m.role as MemberRole,
      status: 'active' as const,
      joined_at: m.created_at,
      last_active_at: m.last_active_at || undefined,
      total_tokens: m.total_tokens,
    })) || [];
  }, [membersData]);

  const handleRoleChange = async (id: string, newRole: MemberRole) => {
    if (!currentOrg) return;
    try {
      await updateMemberRole.mutateAsync({
        orgId: currentOrg.id,
        memberId: id,
        role: newRole,
      });
    } catch (error) {
      console.error('Failed to change role:', error);
    }
  };

  const handleRemove = async (id: string) => {
    if (!currentOrg) return;
    if (window.confirm('Are you sure you want to remove this member?')) {
      try {
        await removeMember.mutateAsync({ orgId: currentOrg.id, memberId: id });
      } catch (error) {
        console.error('Failed to remove member:', error);
      }
    }
  };

  const handleSort = (field: MemberSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredMembers = useMemo(() => {
    const result = members.filter(
      (member) =>
        member.email.toLowerCase().includes(search.toLowerCase()) ||
        member.name?.toLowerCase().includes(search.toLowerCase())
    );

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = (a.name || a.email).localeCompare(b.name || b.email);
          break;
        case 'role':
          comparison = (roleOrder[a.role] || 0) - (roleOrder[b.role] || 0);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'joined_at':
          comparison = new Date(a.joined_at || 0).getTime() - new Date(b.joined_at || 0).getTime();
          break;
        case 'total_tokens':
          comparison = (a.total_tokens || 0) - (b.total_tokens || 0);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [members, search, sortField, sortDirection]);

  const activeCount = members.filter((m) => m.status === 'active').length;
  const pendingInvitations = invitationsData || [];
  const pendingCount = pendingInvitations.length;

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!currentOrg) return;
    try {
      await revokeInvitation.mutateAsync({ orgId: currentOrg.id, invitationId });
    } catch (error) {
      console.error('Failed to revoke invitation:', error);
    }
  };

  const canManageInvitations = currentMembership?.role === 'owner' || currentMembership?.role === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">
            {activeCount} active member{activeCount !== 1 && 's'}
            {pendingCount > 0 && `, ${pendingCount} pending`}
          </p>
        </div>
        <Button asChild>
          <Link to="/team/invite">
            <UserPlus className="mr-2 size-4" />
            Invite
          </Link>
        </Button>
      </div>

      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Pending Invitations Section */}
      {pendingCount > 0 && (
        <div className="rounded-lg border border-dashed border-warning/50 bg-warning/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="size-4 text-warning" />
            <h3 className="font-medium text-sm">
              Pending Invitations ({pendingCount})
            </h3>
          </div>
          <div className="grid gap-2">
            {pendingInvitations.map((invitation) => (
              <PendingInvitationRow
                key={invitation.id}
                invitation={invitation}
                canRevoke={canManageInvitations}
                onRevoke={handleRevokeInvitation}
                isRevoking={revokeInvitation.isPending}
              />
            ))}
          </div>
        </div>
      )}

      <div className="rounded-md border overflow-x-auto">
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px] sm:w-[250px]">
                <SortButton
                  field="name"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Member
                </SortButton>
              </TableHead>
              <TableHead className="w-[100px] sm:w-[120px]">
                <SortButton
                  field="role"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Role
                </SortButton>
              </TableHead>
              <TableHead className="hidden sm:table-cell w-[100px]">
                <SortButton
                  field="status"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Status
                </SortButton>
              </TableHead>
              <TableHead className="hidden md:table-cell w-[120px]">
                <SortButton
                  field="joined_at"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Joined
                </SortButton>
              </TableHead>
              <TableHead className="hidden lg:table-cell w-[120px]">Last Active</TableHead>
              <TableHead className="hidden sm:table-cell w-[100px]">
                <SortButton
                  field="total_tokens"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Tokens
                </SortButton>
              </TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <MemberSkeleton key={i} />)
            ) : filteredMembers.length === 0 ? (
              <TableRow>
                <td colSpan={7} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-8 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {search ? 'No members found' : 'No team members yet'}
                    </p>
                  </div>
                </td>
              </TableRow>
            ) : (
              filteredMembers.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  currentUserRole={currentMembership?.role}
                  onRoleChange={handleRoleChange}
                  onRemove={handleRemove}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <LeaveOrganizationSection
        currentOrg={currentOrg}
        currentMembership={currentMembership}
        members={members}
        organizations={organizations}
        currentUserEmail={profile?.email}
        onLeave={async (membershipId: string) => {
          if (!currentOrg) return;
          await leaveOrganization.mutateAsync({
            orgId: currentOrg.id,
            memberId: membershipId,
          });
          await refreshOrganizations();
          // Switch to another org or redirect
          const remainingOrgs = organizations.filter((o) => o.id !== currentOrg.id);
          if (remainingOrgs.length > 0) {
            setCurrentOrg(remainingOrgs[0]);
          } else {
            navigate('/');
          }
        }}
        isLeaving={leaveOrganization.isPending}
      />
    </div>
  );
}

interface LeaveOrganizationSectionProps {
  currentOrg: { id: string; name: string } | null;
  currentMembership: { role: MemberRole; organization: { id: string } } | null;
  members: MemberData[];
  organizations: { id: string }[];
  currentUserEmail?: string;
  onLeave: (membershipId: string) => Promise<void>;
  isLeaving: boolean;
}

function LeaveOrganizationSection({
  currentOrg,
  currentMembership,
  members,
  organizations,
  currentUserEmail,
  onLeave,
  isLeaving,
}: LeaveOrganizationSectionProps) {
  if (!currentOrg || !currentMembership) return null;

  // Find current user's membership ID from members list
  const currentUserMember = members.find((m) => m.email === currentUserEmail);

  // Check if user is the sole owner
  const owners = members.filter((m) => m.role === 'owner');
  const isSoleOwner = currentMembership.role === 'owner' && owners.length === 1;

  // Don't show if user is sole owner
  if (isSoleOwner) {
    return (
      <Alert variant="default" className="mt-8">
        <AlertTriangle className="size-4" />
        <AlertTitle>You are the sole owner</AlertTitle>
        <AlertDescription>
          You cannot leave this organization because you are the only owner.
          Transfer ownership to another member first, or delete the organization in Settings.
        </AlertDescription>
      </Alert>
    );
  }

  const handleLeave = async () => {
    if (!currentUserMember) return;
    await onLeave(currentUserMember.id);
  };

  return (
    <div className="mt-8 rounded-lg border border-destructive/20 bg-destructive/5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-destructive">Leave Organization</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Remove yourself from <span className="font-medium">{currentOrg.name}</span>.
            {organizations.length > 1
              ? ' You will be switched to another organization.'
              : ' You will need to create or join another organization.'}
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={isLeaving || !currentUserMember}>
              <LogOut className="mr-2 size-4" />
              {isLeaving ? 'Leaving...' : 'Leave'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave {currentOrg.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                You will lose access to all projects, events, and data in this organization.
                This action cannot be undone. You will need to be invited again to rejoin.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleLeave}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Leave Organization
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

interface PendingInvitationRowProps {
  invitation: Invitation;
  canRevoke: boolean;
  onRevoke: (id: string) => void;
  isRevoking: boolean;
}

function PendingInvitationRow({ invitation, canRevoke, onRevoke, isRevoking }: PendingInvitationRowProps) {
  const now = new Date();
  const expiresAt = new Date(invitation.expiresAt);
  const isExpired = expiresAt < now;
  const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="flex items-center justify-between gap-4 rounded-md bg-background p-3 border">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex size-8 items-center justify-center rounded-full bg-muted">
          <Mail className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium text-sm">{invitation.email}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="capitalize">{invitation.role}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {isExpired ? (
                <span className="text-destructive">Expired</span>
              ) : (
                <span>Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}</span>
              )}
            </span>
          </div>
        </div>
      </div>
      {canRevoke && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRevoke(invitation.id)}
          disabled={isRevoking}
          className="text-muted-foreground hover:text-destructive"
        >
          <X className="size-4" />
          <span className="sr-only">Revoke invitation</span>
        </Button>
      )}
    </div>
  );
}
