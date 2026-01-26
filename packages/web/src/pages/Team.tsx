import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Search, Users } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useOrganizationMembers, useUpdateMemberRole, useRemoveMember } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  const { currentOrg, currentMembership } = useOrg();
  const [search, setSearch] = useState('');

  const { data: membersData, isLoading } = useOrganizationMembers(currentOrg?.id || '');
  const updateMemberRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

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
    </div>
  );
}
