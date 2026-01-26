import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Search, Users, LogOut, AlertTriangle } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationMembers, useUpdateMemberRole, useRemoveMember, useLeaveOrganization } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </td>
      <td className="p-4">
        <Skeleton className="h-8 w-24" />
      </td>
      <td className="p-4">
        <Skeleton className="h-5 w-16" />
      </td>
      <td className="p-4">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="p-4">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="p-4">
        <Skeleton className="h-4 w-16" />
      </td>
      <td className="p-4" />
    </TableRow>
  );
}

export function Team() {
  const navigate = useNavigate();
  const { currentOrg, currentMembership, organizations, setCurrentOrg, refreshOrganizations } = useOrg();
  const { profile } = useAuth();
  const [search, setSearch] = useState('');

  const { data: membersData, isLoading } = useOrganizationMembers(currentOrg?.id || '');
  const updateMemberRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const leaveOrganization = useLeaveOrganization();

  // Transform API response to component format
  const members: MemberData[] = useMemo(() => {
    return membersData?.map((m) => ({
      id: m.id,
      email: m.user.email,
      name: m.user.name || undefined,
      avatar_url: m.user.avatar_url || undefined,
      role: m.role as MemberRole,
      status: 'active' as const, // API doesn't have pending status
      joined_at: m.created_at,
      last_active_at: undefined, // Would need separate query
      event_count: undefined, // Would need separate query
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

  const filteredMembers = useMemo(() => {
    return members.filter(
      (member) =>
        member.email.toLowerCase().includes(search.toLowerCase()) ||
        member.name?.toLowerCase().includes(search.toLowerCase())
    );
  }, [members, search]);

  const activeCount = members.filter((m) => m.status === 'active').length;
  const pendingCount = members.filter((m) => m.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">Member</TableHead>
              <TableHead className="w-[120px]">Role</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[120px]">Joined</TableHead>
              <TableHead className="w-[120px]">Last Active</TableHead>
              <TableHead className="w-[100px]">Events</TableHead>
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
