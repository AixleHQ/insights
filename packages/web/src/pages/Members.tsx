import { useState, useMemo } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  UserPlus,
  Search,
  Users,
  LogOut,
  AlertTriangle,
  Mail,
  Clock,
  X,
  ChevronDown,
} from "lucide-react";
import { useOrg, type MemberRole } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  useOrganizationMembers,
  useUpdateMemberRole,
  useRemoveMember,
  useLeaveOrganization,
  useInvitations,
  useRevokeInvitation,
} from "@/hooks/useApi";
import type { Invitation } from "@/lib/types";
import { formatCost } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SortButton, type SortDirection } from "@/components/ui/sort-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type MemberSortField = "name" | "role" | "last_active_at" | "total_events" | "total_cost";

type MemberData = {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  role: MemberRole;
  joined_at?: string;
  last_active_at?: string;
  total_tokens?: number;
  total_events?: number;
  total_cost?: number;
};

const roleOrder: Record<MemberRole, number> = {
  owner: 3,
  member: 2,
  viewer: 1,
};

function getInitials(name?: string | null, email?: string): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email?.slice(0, 2).toUpperCase() || "U";
}

function formatLastActive(dateStr?: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function MemberSkeleton() {
  return (
    <TableRow>
      <TableCell className="p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      </TableCell>
      <TableCell className="p-4"><Skeleton className="h-5 w-16" /></TableCell>
      <TableCell className="hidden md:table-cell p-4"><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell className="hidden sm:table-cell p-4"><Skeleton className="h-4 w-12" /></TableCell>
      <TableCell className="hidden sm:table-cell p-4"><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell className="p-4" />
    </TableRow>
  );
}

export function Members() {
  const navigate = useNavigate();
  const { currentOrg, currentMembership, currentRole, organizations, setCurrentOrg, refreshOrganizations } = useOrg();
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<MemberRole | "all">("all");
  const [sortField, setSortField] = useState<MemberSortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const { data: membersData, isLoading } = useOrganizationMembers(currentOrg?.id || "");
  const { data: invitationsData } = useInvitations(currentOrg?.id || "", "pending");
  const updateMemberRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const leaveOrganization = useLeaveOrganization();
  const revokeInvitation = useRevokeInvitation();

  const members: MemberData[] = useMemo(() => {
    return membersData?.map((m) => ({
      id: m.id,
      email: m.user.email,
      name: m.user.name || undefined,
      role: m.role as MemberRole,
      joined_at: m.created_at,
      last_active_at: m.last_active_at || undefined,
      total_tokens: m.total_tokens,
      total_events: m.total_events,
      total_cost: m.total_cost,
    })) ?? [];
  }, [membersData]);

  const filteredMembers = useMemo(() => {
    const result = members.filter((m) => {
      const matchesSearch =
        m.email.toLowerCase().includes(search.toLowerCase()) ||
        m.name?.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === "all" || m.role === roleFilter;
      return matchesSearch && matchesRole;
    });

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = (a.name || a.email).localeCompare(b.name || b.email);
          break;
        case "role":
          comparison = (roleOrder[a.role] || 0) - (roleOrder[b.role] || 0);
          break;
        case "last_active_at":
          comparison =
            new Date(a.last_active_at || 0).getTime() -
            new Date(b.last_active_at || 0).getTime();
          break;
        case "total_events":
          comparison = (a.total_events || 0) - (b.total_events || 0);
          break;
        case "total_cost":
          comparison = (a.total_cost || 0) - (b.total_cost || 0);
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [members, search, roleFilter, sortField, sortDirection]);

  const activeCount = members.length;
  const pendingInvitations = invitationsData || [];
  const pendingCount = pendingInvitations.length;

  // Owner-only guard — after all hooks
  if (currentRole !== "owner") {
    return <Navigate to="/profile" replace />;
  }

  const handleRoleChange = async (id: string, newRole: MemberRole) => {
    if (!currentOrg) return;
    try {
      await updateMemberRole.mutateAsync({ orgId: currentOrg.id, memberId: id, role: newRole });
    } catch (error) {
      console.error("Failed to change role:", error);
    }
  };

  const handleRemove = async (id: string) => {
    if (!currentOrg) return;
    if (window.confirm("Are you sure you want to remove this member?")) {
      try {
        await removeMember.mutateAsync({ orgId: currentOrg.id, memberId: id });
      } catch (error) {
        console.error("Failed to remove member:", error);
      }
    }
  };

  const handleSort = (field: MemberSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!currentOrg) return;
    try {
      await revokeInvitation.mutateAsync({ orgId: currentOrg.id, invitationId });
    } catch (error) {
      console.error("Failed to revoke invitation:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">
            {activeCount} active member{activeCount !== 1 && "s"}
            {pendingCount > 0 && `, ${pendingCount} pending`}
          </p>
        </div>
        <Button asChild>
          <Link to="/members/invite">
            <UserPlus className="mr-2 size-4" />
            Add Member
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={(v) => setRoleFilter(v as MemberRole | "all")}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Seat Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Seat Types</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Pending Invitations */}
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
                onRevoke={handleRevokeInvitation}
                isRevoking={revokeInvitation.isPending}
              />
            ))}
          </div>
        </div>
      )}

      <div className="rounded-md border overflow-x-auto">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px] sm:w-[280px]">
                <SortButton field="name" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  Name
                </SortButton>
              </TableHead>
              <TableHead className="w-[110px]">
                <SortButton field="role" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  Seat Type
                </SortButton>
              </TableHead>
              <TableHead className="hidden md:table-cell w-[120px]">
                <SortButton field="last_active_at" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  Last Active
                </SortButton>
              </TableHead>
              <TableHead className="hidden sm:table-cell w-[90px]">
                <SortButton field="total_events" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  Events
                </SortButton>
              </TableHead>
              <TableHead className="hidden sm:table-cell w-[100px]">
                <SortButton field="total_cost" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  Cost
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
                <TableCell colSpan={6} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-8 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {search || roleFilter !== "all" ? "No members found" : "No team members yet"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((member) => (
                <MemberTableRow
                  key={member.id}
                  member={member}
                  currentUserId={profile?.id}
                  currentUserRole={currentMembership?.role}
                  onRoleChange={handleRoleChange}
                  onRemove={handleRemove}
                  onRowClick={() => navigate(`/members/${member.id}`)}
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
          await leaveOrganization.mutateAsync({ orgId: currentOrg.id, memberId: membershipId });
          await refreshOrganizations();
          const remaining = organizations.filter((o) => o.id !== currentOrg.id);
          if (remaining.length > 0) {
            setCurrentOrg(remaining[0]);
          } else {
            navigate("/");
          }
        }}
        isLeaving={leaveOrganization.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemberTableRow
// ---------------------------------------------------------------------------

interface MemberTableRowProps {
  member: MemberData;
  currentUserId?: string;
  currentUserRole?: MemberRole;
  onRoleChange: (id: string, role: MemberRole) => void;
  onRemove: (id: string) => void;
  onRowClick: () => void;
}

function MemberTableRow({
  member,
  currentUserRole,
  onRoleChange,
  onRemove,
  onRowClick,
}: MemberTableRowProps) {
  const isOwner = currentUserRole === "owner";
  const canManage = isOwner && member.role !== "owner";

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={onRowClick}
    >
      <TableCell className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-8 shrink-0">
            {member.avatar_url && <AvatarImage src={member.avatar_url} alt={member.name || member.email} />}
            <AvatarFallback className="text-xs bg-muted">
              {getInitials(member.name, member.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{member.name || member.email.split("@")[0]}</p>
            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="p-4">
        <Badge variant="outline" className="capitalize text-xs">
          {member.role}
        </Badge>
      </TableCell>
      <TableCell className="hidden md:table-cell p-4 text-sm text-muted-foreground">
        {formatLastActive(member.last_active_at)}
      </TableCell>
      <TableCell className="hidden sm:table-cell p-4 text-sm">
        {(member.total_events ?? 0).toLocaleString()}
      </TableCell>
      <TableCell className="hidden sm:table-cell p-4 text-sm">
        {formatCost(member.total_cost ?? 0)}
      </TableCell>
      <TableCell className="p-4" onClick={(e) => e.stopPropagation()}>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <ChevronDown className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {member.role === "member" && (
                <DropdownMenuItem onClick={() => onRoleChange(member.id, "viewer")}>
                  Change to Viewer
                </DropdownMenuItem>
              )}
              {member.role === "viewer" && (
                <DropdownMenuItem onClick={() => onRoleChange(member.id, "member")}>
                  Change to Member
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onRemove(member.id)}
              >
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// PendingInvitationRow
// ---------------------------------------------------------------------------

interface PendingInvitationRowProps {
  invitation: Invitation;
  onRevoke: (id: string) => void;
  isRevoking: boolean;
}

function PendingInvitationRow({ invitation, onRevoke, isRevoking }: PendingInvitationRowProps) {
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
                <span>Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? "s" : ""}</span>
              )}
            </span>
          </div>
        </div>
      </div>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// LeaveOrganizationSection
// ---------------------------------------------------------------------------

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

  const currentUserMember = members.find((m) => m.email === currentUserEmail);
  const owners = members.filter((m) => m.role === "owner");
  const isSoleOwner = currentMembership.role === "owner" && owners.length === 1;

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

  return (
    <div className="mt-8 rounded-lg border border-destructive/20 bg-destructive/5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-destructive">Leave Organization</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Remove yourself from <span className="font-medium">{currentOrg.name}</span>.
            {organizations.length > 1
              ? " You will be switched to another organization."
              : " You will need to create or join another organization."}
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={isLeaving || !currentUserMember}>
              <LogOut className="mr-2 size-4" />
              {isLeaving ? "Leaving..." : "Leave"}
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
                onClick={() => currentUserMember && onLeave(currentUserMember.id)}
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
